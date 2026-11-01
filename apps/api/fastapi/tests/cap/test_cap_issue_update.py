"""Issue Update: a published warning is copied into an Update draft that references it.

Also covers the publish response's ``schema_mismatch`` notice for the emergency path,
which the CAP desk shows as "published with a format problem".
"""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import service as cap_service
from src.cap import xsd
from src.cap.exceptions import CapNonConformingAlertError, CapStateError
from src.cap.levels import OVERRIDE_REASON
from src.cap.models import (
    CapAlert,
    CapAuditEvent,
    CapLifecycleState,
    CapMessageType,
)
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAlertUpdate,
    CapEmergencyPublish,
    CapPublishAction,
)
from tests.factories import make_user

from .test_cap_state_machine import (
    _VALID_PAYLOAD_DICT,
    _create_alert_for_test,
    _publish_approved,
)

pytestmark = pytest.mark.asyncio


async def _published(db: AsyncSession, user, payload: dict | None = None):
    if payload is None:
        alert = await _create_alert_for_test(db, user)
    else:
        await _create_alert_for_test(db, user)  # seeds the approval policy
        alert = await cap_service.create_alert(
            session=db, current_user=user, payload=CapAlertCreate(**payload)
        )
    published, _ = await _publish_approved(
        session=db, current_user=user, alert_id=alert.id, payload=CapPublishAction()
    )
    return published


async def test_issue_update_copies_the_warning_and_references_it(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    payload = {
        **_VALID_PAYLOAD_DICT,
        "status": "Exercise",
        "info": [
            {
                **_VALID_PAYLOAD_DICT["info"][0],
                "parameters": [
                    {"value_name": "GMS:sectors", "value": "marine"},
                    {"value_name": OVERRIDE_REASON, "value": "old decision"},
                ],
            }
        ],
    }
    original = await _published(db_async, user, payload)

    draft, created = await cap_service.issue_update(
        session=db_async, current_user=user, alert_id=original.id
    )

    assert created is True
    assert draft.lifecycle_state == CapLifecycleState.DRAFT
    assert draft.msg_type == CapMessageType.UPDATE
    # Same status, sender and scope as the original: publishing checks them.
    assert draft.status == original.status
    assert draft.sender == original.sender
    assert draft.scope == original.scope
    assert draft.identifier != original.identifier
    assert [(r.sender, r.identifier) for r in draft.references] == [
        (original.sender, original.identifier)
    ]
    info = draft.info[0]
    assert info.headline == original.info[0].headline  # no "Copy of"
    names = [p.value_name for p in info.parameters]
    assert "GMS:sectors" in names
    assert OVERRIDE_REASON not in names  # a new decision needs its own reason
    audit = (
        (
            await db_async.execute(
                select(CapAuditEvent).where(
                    CapAuditEvent.alert_id == original.id,
                    CapAuditEvent.action == "update_started",
                )
            )
        )
        .scalars()
        .one()
    )
    assert audit.payload["update_alert_id"] == str(draft.id)


async def test_publishing_the_update_supersedes_the_original(
    db_async: AsyncSession,
) -> None:
    """The reference must match the stored instant exactly, microseconds included."""
    user = await make_user(db_async, superuser=True)
    original = await _published(db_async, user)
    draft, _ = await cap_service.issue_update(
        session=db_async, current_user=user, alert_id=original.id
    )
    await cap_service.update_alert(
        session=db_async,
        current_user=user,
        alert_id=draft.id,
        payload=CapAlertUpdate(note="Raised from yellow to orange"),
    )

    published, _ = await _publish_approved(
        session=db_async,
        current_user=user,
        alert_id=draft.id,
        payload=CapPublishAction(),
    )

    assert published.lifecycle_state == CapLifecycleState.PUBLISHED
    previous = await db_async.get(CapAlert, original.id)
    await db_async.refresh(previous)
    assert previous.lifecycle_state == CapLifecycleState.EXPIRED


async def test_a_second_request_returns_the_update_already_being_prepared(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    original = await _published(db_async, user)
    first, created = await cap_service.issue_update(
        session=db_async, current_user=user, alert_id=original.id
    )
    second, created_again = await cap_service.issue_update(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=original.id,
    )
    assert created is True
    assert created_again is False
    assert second.id == first.id
    updates = (
        (
            await db_async.execute(
                select(CapAlert).where(CapAlert.msg_type == CapMessageType.UPDATE)
            )
        )
        .scalars()
        .all()
    )
    assert len(updates) == 1


async def test_only_a_published_warning_can_be_updated(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    draft = await _create_alert_for_test(db_async, user)
    with pytest.raises(CapStateError):
        await cap_service.issue_update(
            session=db_async, current_user=user, alert_id=draft.id
        )

    published = await _published(db_async, user)
    await cap_service.cancel_alert(
        session=db_async,
        current_user=user,
        alert_id=published.id,
        payload=CapAlertAction(note="Issued in error"),
    )
    with pytest.raises(CapStateError):
        await cap_service.issue_update(
            session=db_async, current_user=user, alert_id=published.id
        )


async def test_an_imported_alert_cannot_be_updated_here(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    published = await _published(db_async, user)
    row = await db_async.get(CapAlert, published.id)
    row.import_source = "feed"
    await db_async.commit()
    with pytest.raises(CapStateError, match="imported"):
        await cap_service.issue_update(
            session=db_async, current_user=user, alert_id=published.id
        )

    row.import_source = None
    row.schema_conformant = False
    await db_async.commit()
    with pytest.raises(CapNonConformingAlertError):
        await cap_service.issue_update(
            session=db_async, current_user=user, alert_id=published.id
        )


async def test_issue_update_api_201_then_200_and_refusals(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    normal_user_token_headers_async: dict[str, str],
) -> None:
    user = await make_user(db_async, superuser=True)
    original = await _published(db_async, user)
    url = f"/api/v1/cap/alerts/{original.id}/updates"

    created = await async_client.post(url, headers=superuser_token_headers_async)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["msg_type"] == "Update"
    assert body["references"][0]["identifier"] == original.identifier

    again = await async_client.post(url, headers=superuser_token_headers_async)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == body["id"]

    # The draft itself is not published, so it cannot be updated.
    on_draft = await async_client.post(
        f"/api/v1/cap/alerts/{body['id']}/updates",
        headers=superuser_token_headers_async,
    )
    assert on_draft.status_code == 409, on_draft.text

    refused = await async_client.post(url, headers=normal_user_token_headers_async)
    assert refused.status_code == 403, refused.text


async def test_a_normal_publish_reports_no_format_problem(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    _, snapshot = await _publish_approved(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(),
    )
    assert snapshot.schema_mismatch is None


async def test_an_emergency_publish_past_a_mismatch_says_so_in_the_response(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def mismatch(_xml: str | bytes) -> list[str]:
        return ["line 2: element 'forced': this is a forced test mismatch"]

    async def no_notice(**_: object) -> int:
        return 1

    monkeypatch.setattr(xsd, "cap_schema_errors", mismatch)
    monkeypatch.setattr(cap_service, "notify_schema_mismatch", no_notice)
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    _, snapshot = await cap_service.emergency_publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapEmergencyPublish(reason="Storm already over the island"),
    )
    assert snapshot.schema_mismatch is not None
    assert "forced test mismatch" in snapshot.schema_mismatch

    other = await async_client.post(
        "/api/v1/cap/alerts",
        headers=superuser_token_headers_async,
        json=_VALID_PAYLOAD_DICT,
    )
    assert other.status_code == 201, other.text
    response = await async_client.post(
        f"/api/v1/cap/alerts/{other.json()['id']}/emergency-publish",
        headers=superuser_token_headers_async,
        json={"reason": "Storm already over the island"},
    )
    assert response.status_code == 200, response.text
    assert "forced test mismatch" in response.json()["snapshot"]["schema_mismatch"]
