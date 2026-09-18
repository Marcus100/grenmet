from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from src.cap import service
from src.cap.schemas import CapAlertPublic, CapInfoPublic

NOW = datetime(2026, 9, 17, 12, tzinfo=UTC)


def info(**changes):
    values = {
        "id": uuid4(),
        "sequence": 0,
        "language": "en",
        "event": "Gale Warning",
        "headline": "Gale winds",
        "description": "Warning",
        "expires": NOW + timedelta(hours=1),
    }
    return CapInfoPublic.model_validate({**values, **changes})


def alert(**changes):
    values = {
        "id": uuid4(),
        "identifier": str(uuid4()),
        "sender": "GMS",
        "sent": NOW,
        "status": "Actual",
        "scope": "Public",
        "msg_type": "Alert",
        "lifecycle_state": "PUBLISHED",
        "created_by_user_id": uuid4(),
        "created_at": NOW,
        "updated_at": NOW,
        "info": [info()],
    }
    return CapAlertPublic.model_validate({**values, **changes})


def test_groups_sort_and_preserve_unknown_events():
    result = service.select_public_warnings(
        [
            alert(identifier="minor", info=[info(severity="Minor")]),
            alert(identifier="extreme", info=[info(severity="Extreme")]),
            alert(identifier="ash", info=[info(event="Volcanic ash")]),
        ],
        NOW,
    )
    assert result.activeCount == 3
    assert [
        item.identifier
        for item in next(g for g in result.groups if g.name == "Wind").alerts
    ] == ["extreme", "minor"]
    assert result.groups[-1].name == "Other warnings"
    assert result.groups[-1].alerts[0].identifier == "ash"
    assert service.select_public_warnings([], NOW).activeCount == 0


@pytest.mark.parametrize(
    "changes",
    [
        {"scope": "Private"},
        {"scope": "Restricted"},
        {"lifecycle_state": "DRAFT"},
        {"lifecycle_state": "CANCELLED"},
        {"msg_type": "Cancel"},
        {"msg_type": "Ack"},
        {"sent": NOW + timedelta(seconds=1)},
        {"info": [info(expires=NOW)]},
        {"info": [info(effective=NOW + timedelta(seconds=1))]},
    ],
)
def test_ineligible_alerts_are_excluded(changes):
    assert service.select_public_warnings([alert(**changes)], NOW).activeCount == 0


def test_active_language_selection_does_not_use_expired_first_info():
    bulletin = alert(
        info=[
            info(language="fr", sequence=0, expires=NOW),
            info(
                sequence=1,
                headline="Current English",
                onset=NOW + timedelta(hours=1),
                expires=NOW + timedelta(hours=2),
            ),
        ]
    )
    result = service.select_public_warnings([bulletin], NOW)
    assert result.activeCount == 1
    assert (
        next(g for g in result.groups if g.alerts).alerts[0].headline
        == "Current English"
    )


@pytest.mark.parametrize("status", ["Exercise", "Test", "System", "Draft"])
def test_status_is_preserved(status):
    result = service.select_public_warnings([alert(status=status)], NOW)
    assert next(g for g in result.groups if g.alerts).alerts[0].status == status


def test_unknown_status_is_not_actual():
    with pytest.raises(ValidationError):
        alert(status="invalid")


async def test_endpoint_and_failure(async_client: httpx.AsyncClient, monkeypatch):
    async def selection(**_kwargs):
        return service.select_public_warnings([alert(status="Exercise")], NOW)

    monkeypatch.setattr(service, "public_warnings", selection)
    response = await async_client.get("/api/cap/warnings")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["activeCount"] == 1

    async def unavailable(**_kwargs):
        raise OSError("database unavailable")

    monkeypatch.setattr(service, "public_warnings", unavailable)
    response = await async_client.get("/api/cap/warnings")
    assert response.status_code == 503
    assert "groups" not in response.json()


async def test_warning_query_excludes_restricted_records(
    async_client, db_async, superuser_token_headers_async
):
    from src.baseline.models import ApprovalPolicy
    from tests.cap.test_cap_public_scope import _publish_alert

    db_async.add(ApprovalPolicy(key="cap", allow_self_approval=True))
    await db_async.commit()
    public = await _publish_alert(
        async_client, superuser_token_headers_async, scope="Public"
    )
    private = await _publish_alert(
        async_client,
        superuser_token_headers_async,
        scope="Restricted",
        restriction="Staff",
    )
    response = await async_client.get("/api/cap/warnings")
    assert response.status_code == 200, response.text
    identifiers = [
        item["identifier"]
        for group in response.json()["groups"]
        for item in group["alerts"]
    ]
    assert public in identifiers
    assert private not in identifiers
