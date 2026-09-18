from datetime import UTC, datetime
from typing import get_args
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.wxproducts import validation
from src.wxproducts.schemas import ProductKind, ProductWrite

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
    return ProductWrite.model_validate(
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
