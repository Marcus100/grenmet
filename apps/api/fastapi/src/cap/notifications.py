"""Tell GMS staff about warning lifecycle changes (bell and email).

Called from ``service`` inside the lifecycle transaction, before its commit, so a
rolled-back publish never notifies. Recipients and delivery live in
``src.notifications.gms``; only real (Actual) warnings notify, never tests or
exercises.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.notifications import gms

from .models import (
    CapAlert,
    CapInfo,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapStatus,
)

ACTIONS = {
    CapMessageType.ALERT: "issued",
    CapMessageType.UPDATE: "updated",
    CapMessageType.CANCEL: "cancelled",
}


def is_public(alert: CapAlert) -> bool:
    """Whether the anonymous public lookup finds this alert."""
    return alert.scope == CapScope.PUBLIC and alert.lifecycle_state in {
        CapLifecycleState.PUBLISHED,
        CapLifecycleState.EXPIRED,
        CapLifecycleState.CANCELLED,
    }


async def headline(session: AsyncSession, alert: CapAlert) -> str:
    """The first information block's headline, or the identifier when there is none."""
    found = await session.scalar(
        select(CapInfo.headline)
        .where(CapInfo.alert_id == alert.id)
        .order_by(CapInfo.sequence)
        .limit(1)
    )
    return found or alert.identifier


async def notify_schema_mismatch(
    *,
    session: AsyncSession,
    alert: CapAlert,
    problem: str,
    action: str,
) -> int:
    """A warning went out with a CAP format problem: tell the duty supervisor.

    The person who published is not excluded: an emergency publish is usually made
    by the duty supervisor, and they must still hear that the XML did not conform.
    """
    recipients = await gms.duty_or_holders(session, gms.CAP_DUTY_PERMISSIONS)
    return await gms.tell(
        session,
        gms.CAP_FORMAT_PROBLEM,
        recipients,
        {
            "action": action,
            "headline": await headline(session, alert),
            "identifier": alert.identifier,
            "problem": problem[:300],
        },
        link_path=gms.alert_link(alert.identifier, alert.id, public=is_public(alert)),
        entity_type="cap_alert",
        entity_id=str(alert.id),
        dedupe_key=f"cap-format-problem:{alert.id}:{action}",
    )


async def notify_warning_changed(
    *,
    session: AsyncSession,
    alert: CapAlert,
    actor: User,
    about: CapAlert | None = None,
) -> int:
    """Issued, updated or cancelled: all GMS staff except the person who did it.

    ``about`` names the alert whose headline to quote when ``alert`` carries none
    (a cancellation message has no information block of its own).
    """
    if alert.status != CapStatus.ACTUAL:
        return 0
    action = ACTIONS.get(alert.msg_type)
    if action is None:
        # Ack and Error messages are protocol traffic, not a warning change.
        return 0
    staff = await gms.gms_staff(session)
    return await gms.tell(
        session,
        gms.WARNING_CHANGED,
        staff,
        {
            "action": action,
            "headline": await headline(session, about or alert),
            "identifier": alert.identifier,
        },
        link_path=gms.alert_link(alert.identifier, alert.id, public=is_public(alert)),
        entity_type="cap_alert",
        entity_id=str(alert.id),
        dedupe_key=f"{gms.WARNING_CHANGED}:{alert.id}",
        exclude=(actor.id,),
    )


async def notify_review_requested(
    *, session: AsyncSession, alert: CapAlert, actor: User
) -> int:
    """A warning was submitted: approvers on duty (else every approver) can review."""
    if alert.status != CapStatus.ACTUAL:
        return 0
    reviewers = await gms.duty_or_holders(session, ("cap.alert.approve",))
    return await gms.tell(
        session,
        gms.REVIEW_REQUESTED,
        reviewers,
        {
            "subject": await headline(session, alert),
            "detail": f"Warning {alert.identifier} was submitted for review.",
        },
        link_path=gms.alert_link(alert.identifier, alert.id, public=False),
        entity_type="cap_alert",
        entity_id=str(alert.id),
        exclude=(actor.id,),
        group_key="cap",
    )
