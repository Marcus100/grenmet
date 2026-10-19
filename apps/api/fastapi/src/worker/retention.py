"""Scheduled purge of personal data past its retention period.

Periods (docs/security.md, Data retention):

* ``contact_message`` and ``contact_data_request``: deleted 24 months after
  closing. Neither table has a status, so a request counts as closed when it is
  created and the clock is ``created_at`` + 24 calendar months.
* ``list_subscription`` rows still ``pending`` 30 days after ``requested_at``
  (never confirmed): deleted.
* ``page_feedback`` comments older than 24 months: the free text is nulled. The
  row stays so helpful / not helpful counts per page do not change.

Idempotent (a second run finds nothing past the cutoff), batched so no single
statement holds a long lock, and logs counts only, never personal data.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.contact.models import ContactDataRequest, ContactMessage
from src.feedback.models import PageFeedback
from src.orm import Base
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

CONTACT_RETENTION_MONTHS = 24
FEEDBACK_COMMENT_RETENTION_MONTHS = 24
PENDING_SUBSCRIPTION_DAYS = 30
BATCH_SIZE = 500


@dataclass(frozen=True)
class PurgeResult:
    contact_messages: int = 0
    data_requests: int = 0
    pending_subscriptions: int = 0
    feedback_comments: int = 0

    @property
    def total(self) -> int:
        return (
            self.contact_messages
            + self.data_requests
            + self.pending_subscriptions
            + self.feedback_comments
        )


def months_before(moment: datetime, months: int) -> datetime:
    """Calendar-month subtraction; the day is clamped to the target month's length."""
    index = moment.year * 12 + (moment.month - 1) - months
    year, month = divmod(index, 12)
    month += 1
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    last_day = (31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)[
        month - 1
    ]
    return moment.replace(year=year, month=month, day=min(moment.day, last_day))


async def _delete_batched(
    session: AsyncSession, model: type[Base], *conditions: ColumnElement[bool]
) -> int:
    total = 0
    while True:
        ids = select(model.id).where(*conditions).limit(BATCH_SIZE)  # type: ignore[attr-defined]
        result = await session.execute(
            delete(model).where(model.id.in_(ids))  # type: ignore[attr-defined]
        )
        await session.commit()
        count = int(getattr(result, "rowcount", 0) or 0)
        total += count
        if count < BATCH_SIZE:
            return total


async def _null_comments_batched(session: AsyncSession, cutoff: datetime) -> int:
    total = 0
    while True:
        ids = (
            select(PageFeedback.id)
            .where(PageFeedback.comment.is_not(None), PageFeedback.created_at < cutoff)
            .limit(BATCH_SIZE)
        )
        result = await session.execute(
            update(PageFeedback).where(PageFeedback.id.in_(ids)).values(comment=None)
        )
        await session.commit()
        count = int(getattr(result, "rowcount", 0) or 0)
        total += count
        if count < BATCH_SIZE:
            return total


async def purge_expired(
    *, session: AsyncSession, now: datetime | None = None
) -> PurgeResult:
    """Delete or scrub everything past its retention period. Safe to re-run."""
    now = now or utc_now()
    contact_cutoff = months_before(now, CONTACT_RETENTION_MONTHS)
    feedback_cutoff = months_before(now, FEEDBACK_COMMENT_RETENTION_MONTHS)
    pending_cutoff = now - timedelta(days=PENDING_SUBSCRIPTION_DAYS)

    result = PurgeResult(
        contact_messages=await _delete_batched(
            session, ContactMessage, ContactMessage.created_at < contact_cutoff
        ),
        data_requests=await _delete_batched(
            session, ContactDataRequest, ContactDataRequest.created_at < contact_cutoff
        ),
        pending_subscriptions=await _delete_batched(
            session,
            ListSubscription,
            ListSubscription.status == SubscriptionStatus.PENDING.value,
            ListSubscription.requested_at < pending_cutoff,
        ),
        feedback_comments=await _null_comments_batched(session, feedback_cutoff),
    )
    logger.info(
        "Retention purge finished",
        extra={
            "contact_messages": result.contact_messages,
            "data_requests": result.data_requests,
            "pending_subscriptions": result.pending_subscriptions,
            "feedback_comments": result.feedback_comments,
        },
    )
    return result
