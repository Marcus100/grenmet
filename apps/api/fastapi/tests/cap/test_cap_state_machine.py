"""CAP service state machine tests — invalid transitions raise CapStateError."""

import asyncio
from datetime import UTC, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.baseline.models import ApprovalPolicy
from src.cap import service as cap_service
from src.cap.exceptions import CapStateError
from src.cap.models import (
    CapAlert,
    CapAuditEvent,
    CapLifecycleState,
    CapMessageType,
    CapSnapshot,
)
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAlertUpdate,
    CapEmergencyPublish,
    CapReferenceCreate,
    CapReviewRecord,
)
from src.cap.service import (
    approve_alert,
    cancel_alert,
    create_alert,
    emergency_publish_alert,
    expire_alert,
    publish_alert,
    record_review,
    submit_alert,
    update_alert,
)
from src.exceptions import AppException
from src.utils.datetime import utc_now
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

    # Transition tests deliberately exercise a configured single-actor policy.
    if await db_async.get(ApprovalPolicy, "cap") is None:
        db_async.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await db_async.commit()
    return await create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**_VALID_PAYLOAD_DICT),
    )


async def _publish_approved(*, session, current_user, alert_id, payload):
    """Drive Draft -> Submitted -> Approved (by a second person) -> Published."""
    if await session.get(ApprovalPolicy, "cap") is None:
        session.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await session.commit()
    alert = await session.get(CapAlert, alert_id)
    if alert.lifecycle_state == CapLifecycleState.DRAFT:
        await submit_alert(
            session=session,
            current_user=current_user,
            alert_id=alert_id,
            payload=CapAlertAction(),
        )
        await session.refresh(alert)
    if alert.lifecycle_state == CapLifecycleState.SUBMITTED:
        await approve_alert(
            session=session,
            current_user=await make_user(session, superuser=True),
            alert_id=alert_id,
            payload=CapAlertAction(),
        )
    return await publish_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
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
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    approved = await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    assert approved.lifecycle_state == CapLifecycleState.APPROVED


async def test_publish_from_approved_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    result, snapshot = await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    assert result.lifecycle_state == CapLifecycleState.PUBLISHED
    assert snapshot.content_hash


async def test_submit_from_non_draft_raises(db_async: AsyncSession) -> None:
    """Submitting an already-submitted alert raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )

    with pytest.raises(CapStateError):
        await submit_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


async def test_approve_from_draft_raises(db_async: AsyncSession) -> None:
    """Approving a draft (not yet submitted) raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    with pytest.raises(CapStateError):
        await approve_alert(
            session=db_async,
            current_user=await make_user(db_async, superuser=True),
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


async def test_publish_from_draft_refused(db_async: AsyncSession) -> None:
    """ADR-0023: publish needs an Approved alert; Draft is refused."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    with pytest.raises(CapStateError):
        await publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


async def test_publish_from_submitted_refused(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    with pytest.raises(CapStateError):
        await publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


async def test_author_may_approve_and_publish_their_own_alert(
    db_async: AsyncSession,
) -> None:
    # Owner decision 2026-10-23 (ADR-0023 amendment): self-approval is allowed.
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    approved = await approve_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    assert approved.lifecycle_state == CapLifecycleState.APPROVED
    published, _ = await publish_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    assert published.lifecycle_state == CapLifecycleState.PUBLISHED


async def test_reviews_are_optional_audited_and_never_by_the_author(
    db_async: AsyncSession,
) -> None:
    author = await make_user(db_async, superuser=True)
    reviewer = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, author)
    # Asking for a review is the submit step ("Request review" in the portal).
    await submit_alert(
        session=db_async,
        current_user=author,
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    with pytest.raises(AppException, match="someone other than the author"):
        await record_review(
            session=db_async,
            current_user=author,
            alert_id=alert.id,
            payload=CapReviewRecord(outcome="reviewed"),
        )
    reviewed = await record_review(
        session=db_async,
        current_user=reviewer,
        alert_id=alert.id,
        payload=CapReviewRecord(outcome="changes_requested", note="Tighten the area"),
    )
    # A review never moves the alert; the author can still approve it.
    assert reviewed.lifecycle_state == CapLifecycleState.SUBMITTED
    actions = (
        await db_async.scalars(
            select(CapAuditEvent.action)
            .where(CapAuditEvent.alert_id == alert.id)
            .order_by(CapAuditEvent.created_at)
        )
    ).all()
    assert "changes_requested" in actions
    approved = await approve_alert(
        session=db_async,
        current_user=author,
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    assert approved.lifecycle_state == CapLifecycleState.APPROVED


async def test_editing_after_approval_returns_alert_to_draft(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    edited = await update_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertUpdate(note="changed after approval"),
    )
    assert edited.lifecycle_state == CapLifecycleState.DRAFT
    with pytest.raises(CapStateError):
        await publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


async def test_emergency_publish_from_draft_audits_reason(
    db_async: AsyncSession,
) -> None:
    from src.cap.models import CapAuditEvent

    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    result, snapshot = await emergency_publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapEmergencyPublish(reason="  Tsunami watch, approver unreachable "),
    )
    assert result.lifecycle_state == CapLifecycleState.PUBLISHED
    assert snapshot.content_hash
    event = (
        await db_async.execute(
            select(CapAuditEvent).where(
                CapAuditEvent.alert_id == alert.id,
                CapAuditEvent.action == "emergency_publish",
            )
        )
    ).scalar_one()
    assert event.previous_state == "DRAFT"
    assert event.next_state == "PUBLISHED"
    assert event.note == "Tsunami watch, approver unreachable"
    assert event.payload["emergency"] is True
    assert event.payload["snapshot_id"] == str(snapshot.id)


async def test_emergency_publish_requires_reason(db_async: AsyncSession) -> None:
    from src.cap.exceptions import CapValidationFailedError

    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    with pytest.raises(CapValidationFailedError):
        await emergency_publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapEmergencyPublish(reason="   "),
        )
    with pytest.raises(ValueError):
        CapEmergencyPublish(reason="")


async def test_emergency_publish_requires_its_own_permission(
    db_async: AsyncSession,
) -> None:
    from tests.factories import assign_role, make_role_with_permission

    author = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, author)
    # cap.alert.publish alone (cap-publisher) is not enough.
    publisher = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "cap.alert.publish")
    await assign_role(db_async, user=publisher, role=role)
    with pytest.raises(AppException) as error:
        await emergency_publish_alert(
            session=db_async,
            current_user=publisher,
            alert_id=alert.id,
            payload=CapEmergencyPublish(reason="urgent"),
        )
    assert error.value.status_code == 403
    # The emergency key, held by a duty supervisor, is enough.
    supervisor = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "cap.alert.publish_emergency")
    await assign_role(db_async, user=supervisor, role=role)
    result, _ = await emergency_publish_alert(
        session=db_async,
        current_user=supervisor,
        alert_id=alert.id,
        payload=CapEmergencyPublish(reason="urgent"),
    )
    assert result.lifecycle_state == CapLifecycleState.PUBLISHED


async def test_emergency_publish_rejects_already_published(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await emergency_publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapEmergencyPublish(reason="first"),
    )
    with pytest.raises(CapStateError):
        await emergency_publish_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapEmergencyPublish(reason="again"),
        )


async def test_publish_from_published_raises(db_async: AsyncSession) -> None:
    """Publishing an already-published alert raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )

    with pytest.raises(CapStateError):
        await _publish_approved(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


async def test_cancel_from_published_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )

    cancelled = await cancel_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertAction(note="Hazard has ended"),
    )
    assert cancelled.lifecycle_state == CapLifecycleState.CANCELLED
    assert cancelled.msg_type == CapMessageType.ALERT
    assert cancelled.identifier == alert.identifier
    cancellation = (
        (
            await db_async.execute(
                select(CapAlert).where(CapAlert.msg_type == CapMessageType.CANCEL)
            )
        )
        .scalars()
        .one()
    )
    assert cancellation.identifier != alert.identifier
    assert cancellation.sender == alert.sender
    assert cancellation.lifecycle_state == CapLifecycleState.PUBLISHED
    assert cancellation.note == "Hazard has ended"
    assert cancellation.sent.microsecond == 0
    assert (
        await cap_service._to_public(session=db_async, alert=cancellation)
    ).references[0].identifier == alert.identifier
    assert (await cap_service.public_latest_active(session=db_async)).count == 0
    past = (await cap_service.public_past_alerts(session=db_async)).data
    assert [item.identifier for item in past] == [alert.identifier]
    assert past[0].cancellation_reason == "Hazard has ended"
    detail = await cap_service.public_alert_by_identifier(
        session=db_async, identifier=alert.identifier
    )
    assert detail.cancellation_reason == "Hazard has ended"
    snapshots = (
        (
            await db_async.execute(
                select(CapSnapshot).where(CapSnapshot.alert_id == alert.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(snapshots) == 1, "the original issued XML must remain unchanged"


async def test_cancel_requires_reason(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    with pytest.raises(cap_service.CapValidationFailedError):
        await cancel_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(note="  "),
        )
    assert (
        await db_async.get(CapAlert, alert.id)
    ).lifecycle_state == CapLifecycleState.PUBLISHED


async def test_update_retires_only_its_referenced_message(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    original = await _create_alert_for_test(db_async, user)
    await _publish_approved(
        session=db_async,
        current_user=user,
        alert_id=original.id,
        payload=CapAlertAction(),
    )
    update = await create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(
            **{
                **_VALID_PAYLOAD_DICT,
                "msg_type": "Update",
                "references": [
                    CapReferenceCreate(
                        sender=original.sender,
                        identifier=original.identifier,
                        sent=original.sent.replace(tzinfo=UTC),
                    )
                ],
            }
        ),
    )
    published, _ = await _publish_approved(
        session=db_async,
        current_user=user,
        alert_id=update.id,
        payload=CapAlertAction(),
    )
    assert published.lifecycle_state == CapLifecycleState.PUBLISHED
    assert (
        await db_async.get(CapAlert, original.id)
    ).lifecycle_state == CapLifecycleState.EXPIRED
    assert [
        item.identifier
        for item in (await cap_service.public_latest_active(session=db_async)).data
    ] == [update.identifier]
    past = await cap_service.public_past_alerts(session=db_async)
    assert past.data[0].replaced_by_identifier == update.identifier
    detail = await cap_service.public_alert_by_identifier(
        session=db_async, identifier=original.identifier
    )
    assert detail.replaced_by_identifier == update.identifier


async def test_update_rejects_reference_from_another_sender(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    original = await _create_alert_for_test(db_async, user)
    await _publish_approved(
        session=db_async,
        current_user=user,
        alert_id=original.id,
        payload=CapAlertAction(),
    )
    update = await create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(
            **{
                **_VALID_PAYLOAD_DICT,
                "sender": "another-authority.example",
                "msg_type": "Update",
                "references": [
                    CapReferenceCreate(
                        sender=original.sender,
                        identifier=original.identifier,
                        sent=original.sent.replace(tzinfo=UTC),
                    )
                ],
            }
        ),
    )
    with pytest.raises(cap_service.CapValidationFailedError):
        await _publish_approved(
            session=db_async,
            current_user=user,
            alert_id=update.id,
            payload=CapAlertAction(),
        )
    assert (
        await db_async.get(CapAlert, original.id)
    ).lifecycle_state == CapLifecycleState.PUBLISHED


async def test_natural_expiry_appears_in_past_without_rewriting_cap_message(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    payload = CapAlertCreate(
        **{
            **_VALID_PAYLOAD_DICT,
            "info": [
                {
                    **_VALID_PAYLOAD_DICT["info"][0],
                    "expires": (utc_now() - timedelta(minutes=1)).replace(tzinfo=UTC),
                }
            ],
        }
    )
    draft = await create_alert(session=db_async, current_user=user, payload=payload)
    published, _ = await _publish_approved(
        session=db_async, current_user=user, alert_id=draft.id, payload=CapAlertAction()
    )
    assert published.lifecycle_state == CapLifecycleState.PUBLISHED
    assert (await cap_service.public_latest_active(session=db_async)).count == 0
    assert [
        item.identifier
        for item in (await cap_service.public_past_alerts(session=db_async)).data
    ] == [published.identifier]


async def test_expire_from_published_succeeds_and_invalidates_cache(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Expiring a published alert transitions to EXPIRED and invalidates the
    public feed caches so latest-active/past reflect it immediately."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )

    invalidated: list[tuple[str, ...]] = []

    async def _spy_invalidate(*keys: str) -> None:
        invalidated.append(keys)

    monkeypatch.setattr(cap_service, "invalidate", _spy_invalidate)

    expired = await expire_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    assert expired.lifecycle_state == CapLifecycleState.EXPIRED
    assert invalidated, "expire must invalidate the public feed caches"


async def test_cancel_from_draft_raises(db_async: AsyncSession) -> None:
    """Cancelling a draft alert raises CapStateError."""
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)

    with pytest.raises(CapStateError):
        await cancel_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )


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
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )
    await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )

    with pytest.raises(CapStateError):
        await update_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertUpdate(note="Cannot update published"),
        )


async def test_submit_without_policy_preserves_draft(db_async: AsyncSession) -> None:
    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    policy = await db_async.get(ApprovalPolicy, "cap")
    await db_async.delete(policy)
    await db_async.commit()
    with pytest.raises(AppException):
        await submit_alert(
            session=db_async,
            current_user=user,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )
    stored = await db_async.get(CapAlert, alert.id)
    assert stored.lifecycle_state == CapLifecycleState.DRAFT


async def test_edit_waits_for_a_publish_in_progress_and_is_then_refused(
    db_async: AsyncSession,
) -> None:
    """An edit that starts while a publish holds the row lock must not slip in."""
    from src.database import async_session_factory

    user = await make_user(db_async, superuser=True)
    alert = await _create_alert_for_test(db_async, user)
    await submit_alert(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db_async,
        current_user=await make_user(db_async, superuser=True),
        alert_id=alert.id,
        payload=CapAlertAction(),
    )

    async def edit() -> None:
        async with async_session_factory() as other:
            await update_alert(
                session=other,
                current_user=user,
                alert_id=alert.id,
                payload=CapAlertUpdate(note="late edit"),
            )

    # The publisher's transaction takes the lock first (as publish_alert now does).
    await cap_service.get_alert_or_404(
        session=db_async, alert_id=alert.id, for_update=True
    )
    editor = asyncio.create_task(edit())
    await asyncio.sleep(0.5)
    assert not editor.done(), "the edit must wait for the row lock"

    await _publish_approved(
        session=db_async, current_user=user, alert_id=alert.id, payload=CapAlertAction()
    )
    with pytest.raises(CapStateError):
        await asyncio.wait_for(editor, timeout=10)
    row = await db_async.get(CapAlert, alert.id, populate_existing=True)
    assert row is not None and row.note != "late edit"
