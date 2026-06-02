"""CAP service state machine tests — invalid transitions raise CapStateError."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.exceptions import CapStateError
from src.cap.models import CapLifecycleState
from src.cap.schemas import CapAlertAction
from src.cap.service import (
    approve_alert,
    cancel_alert,
    create_alert,
    publish_alert,
    submit_alert,
    update_alert,
)
from tests.factories import make_user

# Minimal valid alert payload shared across tests
_VALID_PAYLOAD_DICT = {
    "status": "Actual",
    "msg_type": "Alert",
    "scope": "Public",
    "info": [
        {
            "language": "en",
            "categories": ["Met"],
            "event": "Heavy Rain",
            "urgency": "Immediate",
            "severity": "Severe",
            "certainty": "Observed",
            "headline": "Heavy rain warning",
            "description": "Significant rainfall expected.",
            "areas": [{"area_desc": "Grenada", "kind": "AREA"}],
        }
    ],
}


async def _create_alert_for_test(db_async, user):
    from src.cap.schemas import CapAlertCreate

    return await create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**_VALID_PAYLOAD_DICT),
    )


async def test_submit_from_draft_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    submitted = await submit_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertAction(note="Ready"),
    )
    assert submitted.lifecycle_state == CapLifecycleState.SUBMITTED


async def test_approve_from_submitted_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    approved = await approve_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    assert approved.lifecycle_state == CapLifecycleState.APPROVED


async def test_publish_from_approved_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    await approve_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    result, snapshot = await publish_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    assert result.lifecycle_state == CapLifecycleState.PUBLISHED
    assert snapshot.content_hash


async def test_submit_from_non_draft_raises(db_async: AsyncSession) -> None:
    """Submitting an already-submitted alert raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())

    with pytest.raises(CapStateError):
        await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())


async def test_approve_from_draft_raises(db_async: AsyncSession) -> None:
    """Approving a draft (not yet submitted) raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    with pytest.raises(CapStateError):
        await approve_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())


async def test_publish_from_submitted_raises(db_async: AsyncSession) -> None:
    """Publishing without approval raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())

    with pytest.raises(CapStateError):
        await publish_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())


async def test_cancel_from_published_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    await approve_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    await publish_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())

    cancelled = await cancel_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    assert cancelled.lifecycle_state == CapLifecycleState.CANCELLED


async def test_cancel_from_draft_raises(db_async: AsyncSession) -> None:
    """Cancelling a draft alert raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    with pytest.raises(CapStateError):
        await cancel_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())


async def test_update_draft_alert_succeeds(db_async: AsyncSession) -> None:
    """Updating a draft alert changes its note."""
    from src.cap.schemas import CapAlertUpdate

    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    updated = await update_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertUpdate(note="Updated note"),
    )
    assert updated.note == "Updated note"


async def test_update_published_alert_raises(db_async: AsyncSession) -> None:
    """Updating a published alert raises CapStateError."""
    from src.cap.schemas import CapAlertUpdate

    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    await approve_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())
    await publish_alert(session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction())

    with pytest.raises(CapStateError):
        await update_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertUpdate(note="Cannot update published"),
        )
