from datetime import UTC, datetime
from typing import get_args
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.wxproducts import validation
from src.wxproducts.schemas import ProductKind, ProductWrite, ProductWriteAdapter

NOW = datetime(2026, 9, 8, 23, tzinfo=UTC)


def complete(kind: ProductKind) -> dict[str, str]:
    values = {}
    for field in validation.FIELDS[kind]:
        if field.requiredOnPublish:
            values[field.key] = (
                field.options[0]
                if field.options
                else "25"
                if field.type == "number"
                else "Forecast detail"
            )
    values.update(
        issuedAt="2026-09-08T05:00",
        validFrom="2026-09-08T05:00",
        validTo="2026-09-09T05:00",
    )
    if "nextUpdate" in values:
        values["nextUpdate"] = "2026-09-09T02:00"
    return validation.normalize(kind, values)


def body(kind: ProductKind = "marine", **changes) -> ProductWrite:
    return ProductWriteAdapter.validate_python(
        {
            "id": str(uuid4()),
            "expectedRevision": 0,
            "kind": kind,
            "values": complete(kind),
            "action": "publish",
            "changeSummary": "",
            "reviewed": True,
            **changes,
        }
    )


@pytest.mark.parametrize("kind", get_args(ProductKind))
def test_all_current_kinds_can_publish(kind: ProductKind) -> None:
    assert validation.validate(body(kind), now=NOW) == []


def test_drafts_can_be_incomplete_but_not_invalid() -> None:
    assert validation.validate(body(action="draft", values={}), now=NOW) == []
    assert validation.validate(body(values={}), now=NOW)
    assert validation.validate(
        body(action="draft", values={"forged": "value"}), now=NOW
    ) == ["Unknown product field"]
    for value in ["1_000", "NaN", "Infinity", "12 degrees"]:
        assert validation.validate(
            body("morning", action="draft", values={"maxTemperature": value}), now=NOW
        )


@pytest.mark.parametrize("kind", ["morning", "midday"])
def test_day_forecasts_need_todays_maximum(kind: ProductKind) -> None:
    # The GMS sheet prints "Today's Max | Tonight's Min" for both issues.
    values = complete(kind)
    values.pop("maxTemperature")
    assert "Weather: Maximum temperature (°C) is required" in validation.validate(
        body(kind, values=values), now=NOW
    )


def test_evening_tonight_needs_no_maximum() -> None:
    values = complete("evening")
    values.pop("maxTemperature", None)
    assert validation.validate(body("evening", values=values), now=NOW) == []


@pytest.mark.parametrize("day", range(1, 5))
@pytest.mark.parametrize("action", ["draft", "publish"])
def test_evening_temperature_order_is_checked_for_every_period(day, action) -> None:
    values = complete("evening") | {f"day{day}Min": "30", f"day{day}Max": "25"}
    errors = validation.validate(body("evening", action=action, values=values), now=NOW)
    assert errors == [f"Day {day}: Minimum temperature exceeds maximum"]


@pytest.mark.parametrize("day", range(1, 5))
@pytest.mark.parametrize(
    "temperatures", [("", "25"), ("25", ""), ("25", "25"), ("0", "25")]
)
def test_evening_temperature_check_allows_missing_equal_and_zero_values(
    day, temperatures
) -> None:
    low, high = temperatures
    errors = validation.validate(
        body(
            "evening",
            action="draft",
            values={f"day{day}Min": low, f"day{day}Max": high},
        ),
        now=NOW,
    )
    assert errors == []


@pytest.mark.parametrize("kind", ["morning", "midday", "evening"])
@pytest.mark.parametrize(
    "field,value",
    [
        ("windSpeedMin", "-1"),
        ("windGust", "Infinity"),
        ("rainChance", "101"),
        ("waveHeightMin", "-0.1"),
    ],
)
def test_forecast_parameter_checks_reject_invalid_entered_draft_values(
    kind, field, value
) -> None:
    errors = validation.validate(
        body(kind, action="draft", values={field: value}), now=NOW
    )
    assert errors


def test_publication_safeguards() -> None:
    payload = body(expectedRevision=2, reviewed=False)
    payload.values["validTo"] = "2026-09-08T06:00"
    payload.values["synopsis"] = "EXAMPLE weather"
    errors = validation.validate(payload, now=NOW)
    assert "Review the preview before publishing" in errors
    assert "Describe this issue or revision" in errors
    assert "An expired product cannot be published" in errors
    assert "Replace example draft wording before publishing" in errors
    payload.values["issuedAt"] = "2026-09-09T05:00"
    assert "Issue time cannot be in the future" in validation.validate(payload, now=NOW)


def test_withdrawal_requires_reason() -> None:
    assert validation.validate(body(action="withdraw", values={}), now=NOW) == [
        "Explain why this product is being withdrawn"
    ]
    assert (
        validation.validate(
            body(action="withdraw", values={}, changeSummary="Incorrect issue"), now=NOW
        )
        == []
    )


def test_normalizes_schedule_across_year_and_rejects_bad_dates() -> None:
    values = validation.normalize("evening", {"issuedAt": "2026-12-30T03:00"})
    assert values["issuedAt"] == "2026-12-30T18:00"
    assert values["day4Date"] == "2027-01-03"
    assert values["validTo"] == "2027-01-04T07:00"
    with pytest.raises(ValueError):
        validation.local_time("2026-02-30T07:00")


def test_rejects_forged_actor_and_oversized_or_coerced_inputs() -> None:
    for changes in [
        {"actorId": "forged"},
        {"expectedRevision": True},
        {"reviewed": "true"},
        {"values": {"synopsis": "x" * 12001}},
        {"values": {"synopsis": 23}},
    ]:
        with pytest.raises(ValidationError):
            body(**changes)


def test_outlook_values_match_authoritative_field_catalog() -> None:
    from src.wxproducts.schemas import OutlookValuesDraft

    catalog = {field.key for field in validation.FIELDS["outlook"]}
    assert set(OutlookValuesDraft.model_fields) == catalog


@pytest.mark.parametrize("values", [{}, {"seaState": "rough"}])
def test_outlook_draft_shape_is_strict(values: dict[str, str]) -> None:
    payload = {
        "id": str(uuid4()),
        "expectedRevision": 0,
        "kind": "outlook",
        "values": values,
        "action": "draft",
        "changeSummary": "",
        "reviewed": False,
    }
    if values:
        with pytest.raises(ValidationError):
            ProductWriteAdapter.validate_python(payload)
    else:
        assert (
            ProductWriteAdapter.validate_python(payload).values.model_dump(
                exclude_none=True
            )
            == {}
        )


ALERT_KINDS = [
    kind
    for kind in get_args(ProductKind)
    if "level" in {f.key for f in validation.FIELDS[kind]}
]


@pytest.mark.parametrize("kind", ALERT_KINDS)
@pytest.mark.parametrize("level", ["Yellow", "Amber", "Orange", "Red"])
@pytest.mark.parametrize("action", ["draft", "publish"])
def test_alerts_refuse_levels_above_green_on_write(kind, level, action) -> None:
    payload = body(kind, action=action)
    payload.values["level"] = level
    errors = validation.validate(payload, now=NOW)
    assert any("green only" in error for error in errors)


@pytest.mark.parametrize("kind", ALERT_KINDS)
def test_alerts_offer_green_and_only_information_advisory_all_clear(kind) -> None:
    rules = {f.key: f for f in validation.FIELDS[kind]}
    assert rules["level"].options == ["Green"]
    assert rules["notice"].options == ["Information", "Advisory", "All clear"]
    for notice in ("Watch", "Warning"):
        payload = body(kind, action="draft")
        payload.values["notice"] = notice
        assert validation.validate(payload, now=NOW)


def test_old_alert_can_still_be_withdrawn() -> None:
    # Saved revisions are never re-validated: withdrawing checks only the reason.
    payload = body(
        "marine",
        action="withdraw",
        values={"level": "Red", "notice": "Warning"},
        changeSummary="Raised to a CAP warning",
    )
    assert validation.validate(payload, now=NOW) == []
