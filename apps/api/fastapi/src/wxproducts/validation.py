"""Authoritative product validation. Web validation is only editing feedback."""

import json
import math
import re
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from pydantic import TypeAdapter

from src.models import BaseModel

from . import units
from .schemas import (
    ProductKind,
    ProductPreview,
    ProductPreviewAdapter,
    ProductPreviewInput,
    ProductWrite,
    ProductWriteAdapter,
    values_as_dict,
)

GRENADA = timezone(timedelta(hours=-4))
ISSUE_HOURS = {"morning": 7, "midday": 12, "evening": 18}


class FieldRule(BaseModel):
    key: str
    label: str
    section: str
    type: str = "text"
    options: list[str] | None = None
    requiredOnPublish: bool


FIELDS = TypeAdapter(dict[str, list[FieldRule]]).validate_python(
    json.loads(Path(__file__).with_name("fields.json").read_text())
)


def local_time(value: str) -> datetime:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
        raise ValueError("Invalid local time")
    return datetime.fromisoformat(value).replace(tzinfo=GRENADA)


def timestamp(value: str) -> float:
    try:
        return local_time(value).timestamp()
    except ValueError, OverflowError:
        return math.nan


def number(value: str) -> float:
    try:
        cleaned = value.strip()
        if not cleaned:
            return 0
        if re.fullmatch(r"0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+", cleaned):
            return float(int(cleaned, 0))
        if not re.fullmatch(
            r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", cleaned
        ):
            return math.nan
        return float(cleaned)
    except ValueError, OverflowError:
        return math.nan


FORECAST_AREA = "Grenada, Carriacou and Petite Martinique"
TIME_OF_DAY = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def optional_number(values: dict[str, str], key: str) -> float | None:
    raw = values.get(key, "").strip()
    if not raw:
        return None
    parsed = number(raw)
    return parsed if math.isfinite(parsed) else None


def parameter_key(prefix: str, name: str) -> str:
    """`windDirFrom` for the main period, `day1WindDirFrom` for an evening day."""
    return f"{prefix}{name[0].upper()}{name[1:]}" if prefix else name


def forecast_periods(kind: ProductKind) -> list[tuple[str, str]]:
    """(key prefix, label) for each period with its own structured parameters."""
    days = [(f"day{day}", f"Day {day}: ") for day in range(1, 5)]
    return [("", ""), *(days if kind == "evening" else [])]


def period_values(values: dict[str, str], prefix: str) -> dict[str, str]:
    if not prefix:
        return values
    return {
        key[len(prefix)].lower() + key[len(prefix) + 1 :]: value
        for key, value in values.items()
        if key.startswith(prefix) and len(key) > len(prefix)
    }


def compose_legacy_text(values: dict[str, str]) -> dict[str, str]:
    """Derive the free-text keys older consumers read from structured values."""
    composed: dict[str, str] = {}
    wind_keys = ("windDirFrom", "windDirTo", "windSpeedMin", "windSpeedMax", "windGust")
    if any(values.get(key) for key in wind_keys):
        composed["wind"] = units.wind_text(
            values.get("windDirFrom", ""),
            values.get("windDirTo", ""),
            optional_number(values, "windSpeedMin"),
            optional_number(values, "windSpeedMax"),
            optional_number(values, "windGust"),
        )
    sea = units.sea_state_text(
        values.get("seaStateFrom", ""), values.get("seaStateTo", "")
    )
    waves = units.height_text(
        optional_number(values, "waveHeightMin"),
        optional_number(values, "waveHeightMax"),
    )
    swell = units.swell_text(
        values.get("swellDir", ""),
        optional_number(values, "swellPeriod"),
        optional_number(values, "swellHeight"),
    )
    if swell:
        composed["swell"] = swell
    marine = [sea, f"waves {waves}" if waves else "", f"swell {swell}" if swell else ""]
    if any(marine):
        composed["seaState"] = "; ".join(part for part in marine if part)
    visibility = units.visibility_text(
        optional_number(values, "visibilityMin"),
        optional_number(values, "visibilityMax"),
    )
    if visibility:
        composed["visibility"] = visibility
    tides = [
        (values.get(f"tide{n}Type", ""), values.get(f"tide{n}Time", ""), n)
        for n in units.TIDE_SLOTS
    ]
    if any(kind or time for kind, time, _ in tides):
        for tide_kind, key in (("High", "highTides"), ("Low", "lowTides")):
            entries = []
            for kind, time, n in sorted(tides, key=lambda tide: tide[1]):
                if kind != tide_kind or not time:
                    continue
                height = optional_number(values, f"tide{n}Height")
                entries.append(
                    time if height is None else f"{time} ({units._num(height)} m)"
                )
            composed[key] = ", ".join(entries)
    return composed


def normalize(
    kind: ProductKind,
    values: dict[str, str],
    *,
    forecaster: str | None = None,
    advisories: str | None = None,
) -> dict[str, str]:
    """Stamp the issuing forecaster and derived text for every product; forecasts
    also get the fixed coverage area, schedule and advisories snapshot."""
    result = dict(values)
    allowed = {rule.key for rule in FIELDS[kind]}
    if forecaster and "forecaster" in allowed:
        result["forecaster"] = forecaster
    for prefix, _ in forecast_periods(kind):
        composed = compose_legacy_text(period_values(values, prefix))
        for name, text in composed.items():
            if parameter_key(prefix, name) in allowed:
                result[parameter_key(prefix, name)] = text
    if kind not in ISSUE_HOURS:
        return result
    result["area"] = FORECAST_AREA
    if advisories is not None:
        result["advisories"] = advisories
    try:
        issued = local_time(
            f"{values.get('issuedAt', '')[:10]}T{ISSUE_HOURS[kind]:02}:00"
        )
        end = issued.replace(hour=7) + timedelta(days=5 if kind == "evening" else 1)
    except ValueError, OverflowError:
        return result
    result.update(
        issuedAt=issued.strftime("%Y-%m-%dT%H:%M"),
        validFrom=issued.strftime("%Y-%m-%dT%H:%M"),
        validTo=end.strftime("%Y-%m-%dT%H:%M"),
    )
    result["validity"] = {
        "morning": "Today and tonight (07:00–07:00)",
        "midday": "This afternoon and tonight (12:00–07:00)",
        "evening": "Tonight (18:00–07:00) and four following days (07:00–07:00)",
    }[kind]
    if kind == "evening":
        for day in range(1, 5):
            result[f"day{day}Date"] = (issued + timedelta(days=day)).date().isoformat()
    return result


RANGES = {
    "windSpeedMin": (0, 200),
    "windSpeedMax": (0, 200),
    "windGust": (0, 250),
    "waveHeightMin": (0, 30),
    "waveHeightMax": (0, 30),
    "swellHeight": (0, 30),
    "swellPeriod": (1, 30),
    "rainChance": (0, 100),
    "formationChance48h": (0, 100),
    "formationChance7d": (0, 100),
    "visibilityMin": (0, 100),
    "visibilityMax": (0, 100),
    **{f"tide{n}Height": (-5, 5) for n in units.TIDE_SLOTS},
}


def parameter_errors(values: dict[str, str]) -> list[str]:
    """Physical plausibility and ordering of structured forecast parameters."""
    errors = []
    for key, (low, high) in RANGES.items():
        value = optional_number(values, key)
        if value is not None and not low <= value <= high:
            errors.append(f"{key}: must be between {low} and {high}")
    speeds = [optional_number(values, k) for k in ("windSpeedMin", "windSpeedMax")]
    if None not in speeds and speeds[0] > speeds[1]:  # type: ignore[operator]
        errors.append("Wind: 'speed from' exceeds 'speed to'")
    gust = optional_number(values, "windGust")
    fastest = max((s for s in speeds if s is not None), default=None)
    if gust is not None and fastest is not None and gust < fastest:
        errors.append("Wind: gusts must be at least the highest sustained speed")
    waves = [optional_number(values, k) for k in ("waveHeightMin", "waveHeightMax")]
    if None not in waves and waves[0] > waves[1]:  # type: ignore[operator]
        errors.append("Marine: 'wave height from' exceeds 'wave height to'")
    seen = [optional_number(values, k) for k in ("visibilityMin", "visibilityMax")]
    if None not in seen and seen[0] > seen[1]:  # type: ignore[operator]
        errors.append("Visibility: 'from' exceeds 'to'")
    states = list(units.SEA_STATES)
    start, end = values.get("seaStateFrom", ""), values.get("seaStateTo", "")
    if start in states and end in states and states.index(start) > states.index(end):
        errors.append("Marine: 'sea state from' is rougher than 'sea state to'")
    for n in units.TIDE_SLOTS:
        if bool(values.get(f"tide{n}Type")) != bool(values.get(f"tide{n}Time")):
            errors.append(f"Tide {n}: choose high or low and enter its time")
    return errors


def validate(body: ProductWrite, *, now: datetime | None = None) -> list[str]:
    values, kind = values_as_dict(body.values), body.kind
    rules = FIELDS[kind]
    if set(values) - {rule.key for rule in rules}:
        return ["Unknown product field"]
    if body.action == "withdraw":
        return (
            []
            if body.changeSummary
            else ["Explain why this product is being withdrawn"]
        )
    publish = body.action == "publish"
    errors: list[str] = []
    for rule in rules:
        value = values.get(rule.key, "").strip()
        if publish and rule.requiredOnPublish and not value:
            errors.append(f"{rule.section}: {rule.label} is required")
        if value and rule.options and value not in rule.options:
            errors.append(f"{rule.label}: select a listed option")
        if (
            value
            and rule.type == "datetime-local"
            and not math.isfinite(timestamp(value))
        ):
            errors.append(f"{rule.label}: enter a valid date and time")
        if value and rule.type == "number" and not math.isfinite(number(value)):
            errors.append(f"{rule.label}: enter a number")
        if value and rule.type == "time" and not TIME_OF_DAY.fullmatch(value):
            errors.append(f"{rule.label}: enter a time as HH:MM")
    # Structured parameters appear in forecasts and several bulletins.
    for prefix, label in forecast_periods(kind):
        errors.extend(
            f"{label}{message}"
            for message in parameter_errors(period_values(values, prefix))
        )
    issue = timestamp(values.get("issuedAt", ""))
    end = timestamp(values.get("validTo", ""))
    if end <= timestamp(values.get("validFrom", "")):
        errors.append("Validity must end after it starts")
    if end <= issue:
        errors.append("Validity must end after the issue time")
    if values.get("nextUpdate") and timestamp(values["nextUpdate"]) <= issue:
        errors.append("Next update must follow the issue time")
    if kind == "evening" and publish and math.isfinite(issue):
        for day in range(1, 5):
            expected = (
                (local_time(values["issuedAt"]) + timedelta(days=day))
                .date()
                .isoformat()
            )
            if values.get(f"day{day}Date") != expected:
                errors.append(f"Day {day} must be {expected} (the following four days)")
            low, high = values.get(f"day{day}Min"), values.get(f"day{day}Max")
            if low and high and number(low) > number(high):
                errors.append(f"Day {day}: minimum temperature exceeds maximum")
    if (
        values.get("minTemperature")
        and values.get("maxTemperature")
        and number(values["minTemperature"]) > number(values["maxTemperature"])
    ):
        errors.append("Minimum temperature exceeds maximum")
    if publish:
        if any("example" in value.lower() for value in values.values()):
            errors.append("Replace example draft wording before publishing")
        if not body.reviewed:
            errors.append("Review the preview before publishing")
        instant = (now or datetime.now(UTC)).timestamp()
        if end <= instant:
            errors.append("An expired product cannot be published")
        if kind not in ISSUE_HOURS and issue > instant:
            errors.append("Issue time cannot be in the future")
        if body.expectedRevision > 0 and not body.changeSummary:
            errors.append("Describe this issue or revision")
    return errors


def preview(
    body: ProductPreviewInput,
    *,
    now: datetime | None = None,
    forecaster: str | None = None,
    advisories: str | None = None,
) -> ProductPreview:
    instant = now or datetime.now(UTC)
    values = normalize(
        body.kind,
        values_as_dict(body.values),
        forecaster=forecaster,
        advisories=advisories,
    )
    # Preview checks content before the human acknowledgement, without saving it.
    candidate = ProductWriteAdapter.validate_python(
        {
            "id": UUID(int=0),
            "expectedRevision": body.expectedRevision,
            "kind": body.kind,
            "values": values,
            "action": "publish",
            "changeSummary": body.changeSummary,
            "reviewed": True,
        }
    )
    return ProductPreviewAdapter.validate_python(
        {
            "kind": body.kind,
            "values": values,
            "errors": validate(candidate, now=instant),
            "checked_at": instant,
        }
    )
