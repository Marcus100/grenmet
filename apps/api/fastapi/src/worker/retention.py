"""Scheduled purge of personal data past its retention period.

Periods (docs/security.md, Data retention):

* ``contact_message`` and ``contact_data_request``: deleted 24 months after
  closing. Neither table has a status, so a request counts as closed when it is
  created and the clock is ``created_at`` + 24 calendar months.
* ``list_subscription`` rows still ``pending`` after their newest confirmation
  link lapsed (``SUBSCRIPTIONS_CONFIRM_TTL_DAYS``, default 7 days): deleted. The
  reader's confirm link then says it has expired and offers a fresh sign-up.
* ``page_feedback`` comments older than 24 months: the free text is nulled. The
  row stays so helpful / not helpful counts per page do not change.
* ``platform.idempotency_key`` rows past ``expires_at`` (24 hours): deleted.
* ``platform.outbox`` rows ``done`` or ``dead`` for 30 days: deleted.
* ``notification_occurrence`` rows older than 30 days: the grouped-notification
  lookback is 24 to 48 hours, so older rows can never suppress anything.
* ``bookings.booking.manage_token_hash`` for bookings that ended over 90 days
  ago: cleared, so the old manage link stops working.

Idempotent (a second run finds nothing past the cutoff), batched so no single
statement holds a long lock, and logs counts only, never personal data.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, delete, func, inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from src.contact.models import ContactDataRequest, ContactMessage
from src.feedback.models import PageFeedback
from src.idempotency import IdempotencyKey
from src.notifications.models import NotificationOccurrence
from src.orm import Base
from src.outbox import Outbox, OutboxStatus
from src.subscriptions import service as subscription_service
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

CONTACT_RETENTION_MONTHS = 24
FEEDBACK_COMMENT_RETENTION_MONTHS = 24
OUTBOX_RETENTION_DAYS = 30
BOOKING_TOKEN_RETENTION_DAYS = 90
NOTIFICATION_OCCURRENCE_RETENTION_DAYS = 30
BATCH_SIZE = 500


@dataclass(frozen=True)
class PurgeResult:
    contact_messages: int = 0
    data_requests: int = 0
    pending_subscriptions: int = 0
    feedback_comments: int = 0
    idempotency_keys: int = 0
    outbox_rows: int = 0
    booking_tokens: int = 0
    notification_occurrences: int = 0

    @property
    def total(self) -> int:
        return (
            self.contact_messages
            + self.data_requests
            + self.pending_subscriptions
            + self.feedback_comments
            + self.idempotency_keys
            + self.outbox_rows
            + self.booking_tokens
            + self.notification_occurrences
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
    # Every retained model has a single-column primary key.
    primary_key = inspect(model).primary_key[0]
    total = 0
    while True:
        ids = select(primary_key).where(*conditions).limit(BATCH_SIZE)
        result = await session.execute(delete(model).where(primary_key.in_(ids)))
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


async def _clear_booking_tokens_batched(session: AsyncSession, cutoff: datetime) -> int:
    total = 0
    while True:
        ids = (
            select(Booking.id)
            .where(Booking.manage_token_hash.is_not(None), Booking.ends_at < cutoff)
            .limit(BATCH_SIZE)
        )
        result = await session.execute(
            update(Booking).where(Booking.id.in_(ids)).values(manage_token_hash=None)
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
    pending_cutoff = subscription_service.pending_expiry_cutoff(now)
    outbox_cutoff = now - timedelta(days=OUTBOX_RETENTION_DAYS)
    token_cutoff = now - timedelta(days=BOOKING_TOKEN_RETENTION_DAYS)
    occurrence_cutoff = now - timedelta(days=NOTIFICATION_OCCURRENCE_RETENTION_DAYS)

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
            # The newest link's lifetime runs from when it was sent.
            func.coalesce(
                ListSubscription.last_confirmation_sent_at,
                ListSubscription.requested_at,
            )
            < pending_cutoff,
        ),
        feedback_comments=await _null_comments_batched(session, feedback_cutoff),
        idempotency_keys=await _delete_batched(
            session, IdempotencyKey, IdempotencyKey.expires_at < now
        ),
        outbox_rows=await _delete_batched(
            session,
            Outbox,
            Outbox.status.in_([OutboxStatus.DONE.value, OutboxStatus.DEAD.value]),
            Outbox.updated_at < outbox_cutoff,
        ),
        booking_tokens=await _clear_booking_tokens_batched(session, token_cutoff),
        notification_occurrences=await _delete_batched(
            session,
            NotificationOccurrence,
            NotificationOccurrence.created_at < occurrence_cutoff,
        ),
    )
    logger.info(
        "Retention purge finished",
        extra={
            "contact_messages": result.contact_messages,
            "data_requests": result.data_requests,
            "pending_subscriptions": result.pending_subscriptions,
            "feedback_comments": result.feedback_comments,
            "idempotency_keys": result.idempotency_keys,
            "outbox_rows": result.outbox_rows,
            "booking_tokens": result.booking_tokens,
            "notification_occurrences": result.notification_occurrences,
        },
    )
    return result
