from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.auth.modern_schemas import SecuritySessionPublic
from src.cap.schemas import (
    CapAlertCreate,
    CapAlertUpdate,
    CapInfoCreate,
    CapReferenceCreate,
)
from src.eregister.schemas import RegisterObservationCreate, RegisterObservationRead
from src.wxproducts.schemas import PublicPublishedProduct


@pytest.mark.parametrize("field", ["effective", "onset", "expires"])
def test_cap_info_requires_offsets_before_comparing(field):
    values = {
        "event": "Rain",
        "headline": "Test",
        "description": "Test only",
        "effective": "2026-09-23T12:00:00Z",
        "onset": "2026-09-23T13:00:00Z",
        "expires": "2026-09-23T14:00:00Z",
    }
    values[field] = values[field].removesuffix("Z")
    with pytest.raises(ValidationError):
        CapInfoCreate(**values)


@pytest.mark.parametrize("schema", [CapAlertCreate, CapAlertUpdate, CapReferenceCreate])
def test_cap_sent_requires_offset(schema):
    with pytest.raises(ValidationError):
        schema(sent="2026-09-23T12:00:00", sender="test", identifier="test")


@pytest.mark.parametrize(
    "changes",
    [
        {"station_id": "   "},
        {"observed_at": "2026-09-23T12:00:00"},
        {"issued_at": "2026-09-23T12:00:00"},
        {"unknown_field": "typo"},
    ],
)
def test_register_rejects_invalid_envelope(changes):
    with pytest.raises(ValidationError):
        RegisterObservationCreate.model_validate(
            {
                "station_id": "78958",
                "kind": "SYNOP",
                "observed_at": "2026-09-23T12:00:00Z",
                **changes,
            }
        )


def test_register_strict_inputs_preserve_permissive_historical_reads():
    saved = RegisterObservationCreate(
        station_id=" 78958 ",
        kind="SYNOP",
        observed_at="2026-09-23T08:00:00-04:00",
        body={"workbook": {"notes": "Draft"}},
    )
    assert saved.station_id == "78958"
    assert saved.model_dump(mode="json")["observed_at"] == "2026-09-23T12:00:00Z"
    historical = RegisterObservationRead.model_validate(
        {
            **saved.model_dump(),
            "station_id": "   ",
            "observed_at": datetime(2026, 9, 23, 12),
            "actor_id": "historical",
            "state": "draft",
            "created_at": datetime(2026, 9, 23),
            "updated_at": datetime(2026, 9, 23),
        }
    )
    assert historical.station_id == "   "


def test_public_product_timestamp_is_validated_and_serialized_as_utc():
    values = {"id": uuid4(), "revision": 1, "kind": "morning", "values": {}}
    for invalid in ("not-a-date", "2026-09-23T12:00:00"):
        with pytest.raises(ValidationError):
            PublicPublishedProduct(**values, publishedAt=invalid)
    result = PublicPublishedProduct(**values, publishedAt="2026-09-23T08:00:00-04:00")
    assert result.model_dump(mode="json")["publishedAt"] == "2026-09-23T12:00:00Z"


def test_security_session_serializes_naive_database_time_as_utc():
    values = {
        "id": "test",
        "client_type": "browser",
        "last_used_at": datetime(2026, 9, 23, 12),
        "expires_at": datetime(2026, 9, 24, 12),
    }
    result = SecuritySessionPublic(**values).model_dump(mode="json")
    assert result["last_used_at"] == "2026-09-23T12:00:00Z"
    assert result["expires_at"] == "2026-09-24T12:00:00Z"
    with pytest.raises(ValidationError):
        SecuritySessionPublic(**{**values, "expires_at": "not-a-date"})
