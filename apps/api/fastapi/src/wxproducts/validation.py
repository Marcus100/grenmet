"""Authoritative product validation. Web validation is only editing feedback."""

import json
import math
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID

from pydantic import TypeAdapter

from src.models import BaseModel
from src.sectors import unknown_sectors
from src.utils.timezones import GRENADA as GRENADA

from . import synop_codes, units
from .schemas import (
    ProductKind,
    ProductPreview,
    ProductPreviewAdapter,
    ProductPreviewInput,
    ProductWrite,
    ProductWriteAdapter,
    values_as_dict,
)

ISSUE_HOURS = {"morning": 7, "midday": 12, "evening": 18}
# Forecasts that import the CAP alerts and GMS bulletins in force when saved or
# previewed (`advisories.snapshot`). Marine Forecast is a forecast too, but it
# keeps its own 05:00 schedule (`_marine_schedule`), so it is not in ISSUE_HOURS
# (land-forecast selection and expiry read that; the overdue sweep reads
# DAILY_ISSUE_HOURS, which adds marine at 05:00).
ADVISORY_KINDS = frozenset({*ISSUE_HOURS, "marine-forecast"})
MARINE_ISSUE_HOUR = 5
# Every forecast issued once a day, with its Grenada issue hour. The overdue
# sweep reads this; ISSUE_HOURS stays land-only (selection, expiry, file names).
DAILY_ISSUE_HOURS = {**ISSUE_HOURS, "marine-forecast": MARINE_ISSUE_HOUR}
# Scheduled products outside the land-forecast set: drafted ahead of the
# issue time, so a future issue time may be published.
SCHEDULED_KINDS = {*ISSUE_HOURS, "marine-forecast"}
LEGACY_MARINE_FIELDS = ("smallCraft", "smallCraftNotes")
# Fields of the first climate sheet (before the owner's bulletin examples).
# Older revisions keep them: writes drop them, the PDF prints them under
# "Earlier format". One source for both.
LEGACY_CLIMATE_FIELDS = (
    ("summary", "Summary of the month"),
    ("rainfallComment", "Rainfall"),
    ("temperatureComment", "Temperature"),
    ("notableEvents", "Notable events"),
    ("outlook", "Outlook for the coming months"),
)
MARINE_FORECAST_AREA = "Waters of Grenada, Carriacou and Petite Martinique"
MARINE_FORECAST_VALIDITY = "05:00 today to 05:00 tomorrow"
CLIMATE_ISSUE_DAY = 15
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


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
# Hazard bulletins (GMS alerts): the kinds with a bulletin purpose (`notice`).
BULLETIN_KINDS = frozenset(
    kind for kind, rules in FIELDS.items() if any(r.key == "notice" for r in rules)
)
# Marine products give wind in knots and heights in metres with feet in
# brackets (owner, 9 Nov 2026); land forecasts stay mph and feet.
MARINE_KINDS = frozenset({"marine", "marine-forecast"})
SUPERSEDED = "superseded by the next issue"


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


def compose_legacy_text(
    values: dict[str, str], *, marine: bool = False
) -> dict[str, str]:
    """Derive the free-text keys older consumers read from structured values.

    Marine products say knots and metres (feet in brackets); others mph and feet.
    """
    composed: dict[str, str] = {}
    wind_keys = ("windDirFrom", "windDirTo", "windSpeedMin", "windSpeedMax", "windGust")
    if any(values.get(key) for key in wind_keys):
        composed["wind"] = units.wind_text(
            values.get("windDirFrom", ""),
            values.get("windDirTo", ""),
            optional_number(values, "windSpeedMin"),
            optional_number(values, "windSpeedMax"),
            optional_number(values, "windGust"),
            unit=units.MARINE_WIND_UNIT if marine else units.PUBLIC_WIND_UNIT,
        )
    sea = units.sea_state_text(
        values.get("seaStateFrom", ""), values.get("seaStateTo", "")
    )
    heights = units.marine_height_text if marine else units.height_text
    waves = heights(
        optional_number(values, "waveHeightMin"),
        optional_number(values, "waveHeightMax"),
    )
    swell = units.swell_text(
        values.get("swellDir", ""),
        optional_number(values, "swellPeriod"),
        optional_number(values, "swellHeight"),
        marine=marine,
    )
    if swell:
        composed["swell"] = swell
    sea_parts = [
        sea,
        f"waves {waves}" if waves else "",
        f"swell {swell}" if swell else "",
    ]
    if any(sea_parts):
        composed["seaState"] = "; ".join(part for part in sea_parts if part)
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
                    time
                    if height is None
                    else f"{time} ({units._num(units.feet(height))} ft)"
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
        composed = compose_legacy_text(
            period_values(values, prefix), marine=kind in MARINE_KINDS
        )
        for name, text in composed.items():
            if parameter_key(prefix, name) in allowed:
                result[parameter_key(prefix, name)] = text
    _normalize_weather(kind, result)
    if kind in BULLETIN_KINDS:
        return _bulletin_details(result)
    if kind == "marine-forecast":
        # The typed small-craft fields were removed; older revisions carry them
        # and the desk posts stored values back, so new writes drop them
        # (stored revisions keep them). Any other unknown key is still refused.
        for key in LEGACY_MARINE_FIELDS:
            result.pop(key, None)
        if advisories is not None:
            result["advisories"] = advisories
        return _marine_schedule(result)
    if kind == "climate-bulletin":
        # First-version text fields: stored revisions keep them (and still
        # render), but the desk posts stored values back, so writes drop them.
        for key, _label in LEGACY_CLIMATE_FIELDS:
            result.pop(key, None)
        return _climate_schedule(result)
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


def _normalize_weather(kind: ProductKind, result: dict[str, str]) -> None:
    """Weather types: legacy single labels become items, and the public
    sentence (`<key>Text`) is generated when the forecaster left it empty."""
    for rule in FIELDS[kind]:
        if rule.type != "weather" or not result.get(rule.key, "").strip():
            continue
        items = synop_codes.parse_weather(result[rule.key])
        text_key = f"{rule.key}Text"
        legacy = result[rule.key].strip()
        if legacy in synop_codes.LEGACY_WEATHER_TYPES:
            # Several old labels map onto a broader item ("Severe
            # thunderstorms" -> thunderstorms), so the official wording keeps
            # the label as issued; the generated sentence never replaces it.
            if not result.get(text_key, "").strip():
                result[text_key] = legacy
            result[rule.key] = synop_codes.format_weather(items)
        if not result.get(text_key, "").strip():
            result[text_key] = synop_codes.weather_sentence(result[rule.key])


def _local_label(value: str) -> str:
    try:
        return f"{local_time(value):%H:%M %a %-d %b}"
    except ValueError, OverflowError:
        return ""


def bulletin_validity(valid_from: str, valid_to: str) -> str:
    """Fixed validity sentence for an alert (owner decision 4, #1197)."""
    start, end = _local_label(valid_from), _local_label(valid_to)
    if not (start and end):
        return ""
    return f"Valid from {start} to {end}, or until {SUPERSEDED}."


def _bulletin_details(result: dict[str, str]) -> dict[str, str]:
    """Alerts are green only, and their validity reads from the machine fields."""
    if not result.get("level", "").strip():
        result["level"] = "Green"
    validity = bulletin_validity(result.get("validFrom", ""), result.get("validTo", ""))
    if validity:
        result["validity"] = validity
    return result


def _marine_schedule(result: dict[str, str]) -> dict[str, str]:
    """Marine Forecast: issued 05:00 Grenada, valid 05:00 to 05:00 next day."""
    result["area"] = MARINE_FORECAST_AREA
    try:
        issued = local_time(
            f"{result.get('issuedAt', '')[:10]}T{MARINE_ISSUE_HOUR:02}:00"
        )
    except ValueError, OverflowError:
        return result
    result.update(
        issuedAt=issued.strftime("%Y-%m-%dT%H:%M"),
        validFrom=issued.strftime("%Y-%m-%dT%H:%M"),
        validTo=(issued + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M"),
        validity=MARINE_FORECAST_VALIDITY,
    )
    return result


def previous_month(day: date) -> str:
    first = day.replace(day=1) - timedelta(days=1)
    return first.strftime("%Y-%m")


def next_climate_issue(day: date) -> date:
    """The 15th after ``day`` (the following month's 15th from the 15th on)."""
    if day.day < CLIMATE_ISSUE_DAY:
        return day.replace(day=CLIMATE_ISSUE_DAY)
    following = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return following.replace(day=CLIMATE_ISSUE_DAY)


def _climate_schedule(result: dict[str, str]) -> dict[str, str]:
    """Climate Bulletin: reviews the month before issue, valid until the next 15th."""
    try:
        issued = local_time(result.get("issuedAt", ""))
    except ValueError, OverflowError:
        return result
    if not MONTH.fullmatch(result.get("month", "").strip()):
        result["month"] = previous_month(issued.date())
    end = next_climate_issue(issued.date() + timedelta(days=1))
    result.update(
        validFrom=issued.strftime("%Y-%m-%dT%H:%M"),
        validTo=f"{end.isoformat()}T23:59",
        validity="Until the next monthly bulletin",
    )
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


def _exceeds(pair: list[float | None]) -> bool:
    """True when both ends of a from/to pair are set and from is above to."""
    low, high = pair
    return low is not None and high is not None and low > high


def parameter_errors(values: dict[str, str]) -> list[str]:
    """Physical plausibility and ordering of structured forecast parameters."""
    errors = []
    for key, (low, high) in RANGES.items():
        value = optional_number(values, key)
        if value is not None and not low <= value <= high:
            errors.append(f"{key}: must be between {low} and {high}")
    speeds = [optional_number(values, k) for k in ("windSpeedMin", "windSpeedMax")]
    if _exceeds(speeds):
        errors.append("Wind: 'speed from' exceeds 'speed to'")
    gust = optional_number(values, "windGust")
    fastest = max((s for s in speeds if s is not None), default=None)
    if gust is not None and fastest is not None and gust < fastest:
        errors.append("Wind: gusts must be at least the highest sustained speed")
    waves = [optional_number(values, k) for k in ("waveHeightMin", "waveHeightMax")]
    if _exceeds(waves):
        errors.append("Marine: 'wave height from' exceeds 'wave height to'")
    seen = [optional_number(values, k) for k in ("visibilityMin", "visibilityMax")]
    if _exceeds(seen):
        errors.append("Visibility: 'from' exceeds 'to'")
    states = list(units.SEA_STATES)
    start, end = values.get("seaStateFrom", ""), values.get("seaStateTo", "")
    if start in states and end in states and states.index(start) > states.index(end):
        errors.append("Marine: 'sea state from' is rougher than 'sea state to'")
    for n in units.TIDE_SLOTS:
        if bool(values.get(f"tide{n}Type")) != bool(values.get(f"tide{n}Time")):
            errors.append(f"Tide {n}: choose high or low and enter its time")
    return errors


_ABOVE_GREEN_NOTICES = ("Watch", "Warning")

# Climate Bulletin ranges: (key prefix, label). `<prefix>Min` must not exceed `<prefix>Max`.
CLIMATE_RANGES = (
    ("precipRange", "Normal range for the season"),
    ("wetDays", "Usual number of wet days"),
    ("wetSpells", "Historical number of 7-day wet spells"),
    ("extremeSpells", "Historical number of extreme 3-day wet spells"),
    ("tempMaxRange", "Normal maximum temperature"),
    ("tempMinRange", "Normal minimum temperature"),
    ("verifyRainfallRange", "Rainfall, normal range"),
    ("verifyWetDaysRange", "Wet days, normal range"),
    ("verifyWetSpellRange", "7-day wet spell, normal range"),
    ("verifyTmaxRange", "Tmax, normal range"),
    ("verifyTminRange", "Tmin, normal range"),
)
# The implications table's sector rows, in print order (key, row label).
CLIMATE_SECTORS = (
    ("impactAgriculture", "Agriculture"),
    ("impactWater", "Water"),
    ("impactHealth", "Health"),
    ("impactTourism", "Tourism"),
    ("impactDrm", "Disaster Risk Management"),
    ("impactEnergy", "Energy"),
    ("impactFisheries", "Fisheries"),
    ("impactInfrastructure", "Infrastructure"),
)
CLIMATE_SECTOR_KEYS = tuple(key for key, _label in CLIMATE_SECTORS)


def _climate_bounds() -> dict[str, tuple[float, float]]:
    """Plausible limits for the typed climate numbers (mm, counts, degrees Celsius)."""
    bounds: dict[str, tuple[float, float]] = {
        "pet": (0, 20),  # mm/day
        "petRatio": (0, 100),  # demand over supply
    }
    degrees = (10.0, 45.0)
    counts = (0.0, 10_000.0)
    temperatures = {
        "tempMaxRange",
        "tempMinRange",
        "verifyTmaxRange",
        "verifyTminRange",
    }
    for prefix, _ in CLIMATE_RANGES:
        limit = degrees if prefix in temperatures else counts
        bounds[f"{prefix}Min"] = bounds[f"{prefix}Max"] = limit
    for prefix in ("verifyRainfall", "verifyWetDays", "verifyWetSpell"):
        bounds[f"{prefix}Observed"] = counts
    for prefix in ("verifyTmax", "verifyTmin"):
        bounds[f"{prefix}Observed"] = degrees
    return bounds


CLIMATE_BOUNDS = _climate_bounds()


def _climate_errors(values: dict[str, str], *, publish: bool) -> list[str]:
    errors = []
    labels = {rule.key: rule.label for rule in FIELDS["climate-bulletin"]}
    for key, (low, high) in CLIMATE_BOUNDS.items():
        found = optional_number(values, key)
        if found is not None and not low <= found <= high:
            errors.append(f"{labels[key]}: enter a value from {low:g} to {high:g}")
    for prefix, label in CLIMATE_RANGES:
        if _exceeds(
            [
                optional_number(values, f"{prefix}Min"),
                optional_number(values, f"{prefix}Max"),
            ]
        ):
            errors.append(f"{label}: 'from' exceeds 'to'")
    if publish and not (
        values.get("generalImplications", "").strip()
        or any(values.get(key, "").strip() for key in CLIMATE_SECTOR_KEYS)
    ):
        errors.append(
            "Implications: fill in the sector table or the general implications"
        )
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
            errors.append(
                f"{rule.label}: GMS alerts are green only; raise to a warning "
                "(CAP) or change to green"
                if rule.key == "level"
                or (rule.key == "notice" and value in _ABOVE_GREEN_NOTICES)
                else f"{rule.label}: select a listed option"
            )
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
        if value and rule.type == "sectors" and unknown_sectors(value):
            errors.append(f"{rule.label}: choose from the listed sectors")
        if value and rule.type == "weather" and not synop_codes.is_valid_weather(value):
            errors.append(f"{rule.label}: choose from the listed weather types")
    # Structured parameters appear in forecasts and several bulletins.
    for prefix, label in forecast_periods(kind):
        errors.extend(
            f"{label}{message}"
            for message in parameter_errors(period_values(values, prefix))
        )
        low_key, high_key = (
            (f"{prefix}Min", f"{prefix}Max")
            if prefix
            else ("minTemperature", "maxTemperature")
        )
        low, high = optional_number(values, low_key), optional_number(values, high_key)
        if low is not None and high is not None and low > high:
            errors.append(f"{label}Minimum temperature exceeds maximum")
    issue = timestamp(values.get("issuedAt", ""))
    end = timestamp(values.get("validTo", ""))
    if end <= timestamp(values.get("validFrom", "")):
        errors.append("Validity must end after it starts")
    if end <= issue:
        errors.append("Validity must end after the issue time")
    if values.get("nextUpdate") and timestamp(values["nextUpdate"]) <= issue:
        errors.append("Next update must follow the issue time")
    if (
        kind == "climate-bulletin"
        and values.get("month")
        and not MONTH.fullmatch(values["month"].strip())
    ):
        errors.append("Month reviewed: enter the month as YYYY-MM")
    if kind == "climate-bulletin" and MONTH.fullmatch(values.get("month", "").strip()):
        issued_day = (
            local_time(values["issuedAt"]).date() if math.isfinite(issue) else None
        )
        if issued_day and values["month"].strip() > previous_month(issued_day):
            errors.append(
                "Month reviewed: cannot be later than the month before the issue date"
            )
    if kind == "climate-bulletin":
        errors.extend(_climate_errors(values, publish=publish))
    if kind == "evening" and publish and math.isfinite(issue):
        for day in range(1, 5):
            expected = (
                (local_time(values["issuedAt"]) + timedelta(days=day))
                .date()
                .isoformat()
            )
            if values.get(f"day{day}Date") != expected:
                errors.append(f"Day {day} must be {expected} (the following four days)")
    if publish:
        if (
            kind == "marine"
            and body.guidance
            and body.guidance.sources
            and not body.guidance.local_assessment.strip()
        ):
            errors.append(
                "Add the GMS local assessment of regional marine guidance before publishing"
            )
        if body.guidance and any(
            not system.name.strip() for system in body.guidance.systems
        ):
            errors.append("Name every meteorological system before publishing")
        # Placeholder wording is looked for in short typed fields only: not in
        # the captured advisories snapshot, and (Climate Bulletin) not in its
        # long free-text fields, where "for example" is ordinary prose.
        long_text = (
            {r.key for r in rules if r.type == "textarea"}
            if kind == "climate-bulletin"
            else set()
        )
        if any(
            "example" in value.lower()
            for key, value in values.items()
            if key != "advisories" and key not in long_text
        ):
            errors.append("Replace example draft wording before publishing")
        if not body.reviewed:
            errors.append("Review the preview before publishing")
        instant = (now or datetime.now(UTC)).timestamp()
        if end <= instant:
            errors.append("An expired product cannot be published")
        if kind not in SCHEDULED_KINDS and issue > instant:
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
    from .guidance import compose

    values = normalize(
        body.kind,
        compose(body.kind, values_as_dict(body.values), body.guidance),
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
            "guidance": body.guidance,
            "action": "publish",
            "changeSummary": body.changeSummary,
            "reviewed": True,
        }
    )
    return ProductPreviewAdapter.validate_python(
        {
            "kind": body.kind,
            "values": values,
            "guidance": body.guidance,
            "errors": validate(candidate, now=instant),
            "checked_at": instant,
        }
    )
