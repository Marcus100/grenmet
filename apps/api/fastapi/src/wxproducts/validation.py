"""Authoritative product validation. Web validation is only editing feedback."""

import json
import math
import re
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from pydantic import TypeAdapter

from src.models import BaseModel

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


def normalize(kind: ProductKind, values: dict[str, str]) -> dict[str, str]:
    result = dict(values)
    if kind not in ISSUE_HOURS:
        return result
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
    body: ProductPreviewInput, *, now: datetime | None = None
) -> ProductPreview:
    instant = now or datetime.now(UTC)
    values = normalize(body.kind, values_as_dict(body.values))
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
