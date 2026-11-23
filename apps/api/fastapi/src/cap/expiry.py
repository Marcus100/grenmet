"""Expire published CAP alerts once every information block has ended.

Run by the ARQ worker every five minutes (``expire_cap_alerts``). An alert moves
PUBLISHED -> EXPIRED only when it has at least one info block and every info
block has an ``expires`` time at or before now. Anything else is left alone:
an info block without an expiry, one still in the future, a draft, a cancelled
or expired alert, and Cancel or Ack messages.

The transition goes through the same guard as the manual expiry
(``service._set_lifecycle``) and writes the same ``expire`` audit action, with no
user as the actor and the reason in the note. It sends nothing: no outbox job,
no publish side effects and no public message. It only clears the public caches,
which a manual expiry does too.

Concurrent runs are safe. Each alert is locked with ``SKIP LOCKED`` and the
eligibility test is repeated under that lock, so a row is expired by one run only;
a row that a person is editing is skipped and picked up by a later run.
"""

import logging
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import cache, service
from src.cap.cache import public_xml_key
from src.cap.common import _record_audit
from src.cap.models import CapAlert, CapInfo, CapLifecycleState, CapMessageType
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

SYSTEM_ACTION_NOTE = "expired by the system: end time passed"
SYSTEM_PAYLOAD = {"actor": "system"}
BATCH_SIZE = 100
MAX_BATCHES_PER_RUN = 10
_ELIGIBLE_MESSAGES = (CapMessageType.ALERT, CapMessageType.UPDATE)


def _eligible(now: datetime) -> list[sa.ColumnElement[bool]]:
    """SQL: published Alert or Update, at least one info, and no info still open."""
    has_info = sa.exists().where(CapInfo.alert_id == CapAlert.id)
    info_open = sa.exists().where(
        CapInfo.alert_id == CapAlert.id,
        sa.or_(CapInfo.expires.is_(None), CapInfo.expires > now),
    )
    return [
        CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
        CapAlert.msg_type.in_(_ELIGIBLE_MESSAGES),
        has_info,
        sa.not_(info_open),
    ]


async def _expire_one(
    *, session: AsyncSession, alert_id: uuid.UUID, now: datetime
) -> bool:
    stmt = (
        select(CapAlert)
        .where(CapAlert.id == alert_id, *_eligible(now))
        .with_for_update(skip_locked=True, of=CapAlert)
        .execution_options(populate_existing=True)
    )
    alert = (await session.execute(stmt)).scalars().first()
    if alert is None:
        # Changed since it was listed, locked by an editor, or already expired.
        return False
    previous_state = alert.lifecycle_state.value
    service._set_lifecycle(alert, "expire")
    alert.expired_at = now
    alert.updated_at = now
    session.add(alert)
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=None,
        action="expire",
        previous_state=previous_state,
        next_state=alert.lifecycle_state.value,
        note=SYSTEM_ACTION_NOTE,
        payload=dict(SYSTEM_PAYLOAD),
    )
    identifier = alert.identifier
    await session.commit()
    await cache.invalidate(*cache.PUBLIC_FEED_KEYS, public_xml_key(identifier))
    return True


async def expire_due_alerts(
    *, session: AsyncSession, now: datetime | None = None
) -> int:
    """Expire every eligible alert, up to ``MAX_BATCHES_PER_RUN`` batches.

    Returns the number expired by this run. Calling it again with nothing due
    returns 0.
    """
    moment = now or utc_now()
    expired = 0
    for _ in range(MAX_BATCHES_PER_RUN):
        ids = list(
            (
                await session.execute(
                    select(CapAlert.id)
                    .where(*_eligible(moment))
                    .order_by(CapAlert.created_at, CapAlert.id)
                    .limit(BATCH_SIZE)
                )
            )
            .scalars()
            .all()
        )
        for alert_id in ids:
            if await _expire_one(session=session, alert_id=alert_id, now=moment):
                expired += 1
        if len(ids) < BATCH_SIZE:
            break
    if expired:
        logger.info("CAP alerts expired by the system", extra={"count": expired})
    return expired
