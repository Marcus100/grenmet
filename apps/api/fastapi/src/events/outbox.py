"""Events outbox (F6): enqueue inside the change's transaction, drain in the worker.

``enqueue`` only adds a row to the caller's Events-DB session, so the row commits
or rolls back with the change itself. ``drain`` (an ARQ job) turns due rows into
``notifications.notify`` calls. Delivery is at-least-once; the outbox row's
``dedupe_key`` is handed to ``notify`` so a repeat (for example a crash between
the platform commit and the Events commit) tells nobody twice. Failures back off
exponentially and give up after ``MAX_ATTEMPTS`` (``failed_at``).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from jinja2 import TemplateError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import service as notification_service
from src.organisations.models import Membership, MembershipRole, MembershipStatus
from src.utils.datetime import utc_now

from . import notifications
from .models import (
    Follow,
    Listing,
    Order,
    Organiser,
    Outbox,
    Rsvp,
    SavedListing,
    Ticket,
)
from .service.common import GRENADA

logger = logging.getLogger(__name__)

PUBLISHED = "listing.published"
CANCELLED = "listing.cancelled"
POSTPONED = "listing.postponed"
ORGANISER_APPROVED = "organiser.approved"
TICKET_ISSUED = "ticket.issued"

_EVENT_KEYS = {
    PUBLISHED: notifications.LISTING_PUBLISHED,
    CANCELLED: notifications.LISTING_CANCELLED,
    POSTPONED: notifications.LISTING_POSTPONED,
    ORGANISER_APPROVED: notifications.ORGANISER_APPROVED,
    TICKET_ISSUED: notifications.TICKET_ISSUED,
}

MAX_ATTEMPTS = 6
BATCH_SIZE = 50
_RETRY_BASE_SECONDS = 30
_RETRY_MAX_SECONDS = 3600

#: Failures worth a retry; anything else is a bug and should surface loudly.
_RETRYABLE = (
    SQLAlchemyError,
    OSError,
    LookupError,
    ValueError,
    TypeError,
    TemplateError,
)


def retry_delay_seconds(attempts: int) -> int:
    return min(_RETRY_BASE_SECONDS << max(attempts - 1, 0), _RETRY_MAX_SECONDS)


async def enqueue(
    db: AsyncSession,
    *,
    kind: str,
    entity_type: str,
    entity_id: str,
    dedupe_key: str,
    payload: dict[str, str],
) -> None:
    """Add an outbox row to the caller's transaction (no commit). A repeated
    ``dedupe_key`` is ignored, so retried requests queue each effect once."""
    now = utc_now()
    await db.execute(
        insert(Outbox)
        .values(
            id=uuid.uuid4(),
            kind=kind,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload,
            dedupe_key=dedupe_key,
            attempts=0,
            created_at=now,
            available_at=now,
        )
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
    )


def _when(value: str | None) -> str:
    if not value:
        return "a time to be confirmed"
    local = datetime.fromisoformat(value).replace(tzinfo=UTC).astimezone(GRENADA)
    return local.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")


async def _listing_audience(
    events: AsyncSession, row: Outbox, listing: Listing
) -> set[uuid.UUID]:
    if row.kind == PUBLISHED:
        if listing.status != "published" or listing.visibility != "public":
            return set()
        return set(
            (
                await events.scalars(
                    select(Follow.user_id).where(
                        Follow.organiser_id == listing.organiser_id
                    )
                )
            ).all()
        )
    going = await events.scalars(
        select(Rsvp.user_id).where(Rsvp.listing_id == listing.id)
    )
    saved = await events.scalars(
        select(SavedListing.user_id).where(SavedListing.listing_id == listing.id)
    )
    audience = set(going.all()) | set(saved.all())
    # Ticket holders (including those just cancelled by the event) hear too.
    holders = await events.scalars(
        select(Ticket.user_id).where(
            Ticket.listing_id == listing.id, Ticket.user_id.is_not(None)
        )
    )
    return audience | {holder for holder in holders.all() if holder is not None}


async def _deliver(events: AsyncSession, platform: AsyncSession, row: Outbox) -> int:
    payload = row.payload
    actor = payload.get("actor_id")
    exclude = [uuid.UUID(actor)] if actor else []
    if row.kind == ORGANISER_APPROVED:
        organiser = await events.get(Organiser, uuid.UUID(row.entity_id))
        if organiser is None or organiser.organisation_id is None:
            return 0
        recipients = set(
            (
                await platform.scalars(
                    select(Membership.user_id).where(
                        Membership.organisation_id == organiser.organisation_id,
                        Membership.status == MembershipStatus.ACTIVE.value,
                        Membership.role.in_(
                            [MembershipRole.OWNER.value, MembershipRole.ADMIN.value]
                        ),
                    )
                )
            ).all()
        )
        return await notification_service.notify(
            platform,
            event_key=_EVENT_KEYS[row.kind],
            organisation_id=organiser.organisation_id,
            recipients=recipients,
            context={"organiser": organiser.name},
            entity_type="organiser",
            entity_id=row.entity_id,
            dedupe_key=row.dedupe_key,
        )
    if row.kind == TICKET_ISSUED:
        return await _deliver_tickets(events, platform, row)
    listing = await events.get(Listing, uuid.UUID(row.entity_id))
    if listing is None:
        return 0
    organiser = await events.get(Organiser, listing.organiser_id)
    return await notification_service.notify(
        platform,
        event_key=_EVENT_KEYS[row.kind],
        organisation_id=organiser.organisation_id if organiser else None,
        recipients=await _listing_audience(events, row, listing),
        context={
            "title": listing.title,
            "organiser": organiser.name if organiser else "The organiser",
            "starts": _when(payload.get("starts_at")),
        },
        entity_type="listing",
        entity_id=row.entity_id,
        dedupe_key=row.dedupe_key,
        exclude=exclude,
    )


async def _deliver_tickets(
    events: AsyncSession, platform: AsyncSession, row: Outbox
) -> int:
    order = await events.get(Order, uuid.UUID(row.entity_id))
    if order is None or order.user_id is None:
        return 0
    listing = await events.get(Listing, order.listing_id)
    if listing is None:
        return 0
    organiser = await events.get(Organiser, listing.organiser_id)
    return await notification_service.notify(
        platform,
        event_key=_EVENT_KEYS[row.kind],
        organisation_id=organiser.organisation_id if organiser else None,
        recipients={order.user_id},
        context={
            "title": listing.title,
            "count": row.payload.get("count", "1"),
            "starts": _when(row.payload.get("starts_at")),
        },
        entity_type="order",
        entity_id=row.entity_id,
        dedupe_key=row.dedupe_key,
    )


async def drain(
    events: AsyncSession,
    platform: AsyncSession,
    *,
    limit: int = BATCH_SIZE,
    max_attempts: int = MAX_ATTEMPTS,
) -> int:
    """Notify for due rows, one transaction per row. Returns rows completed."""
    done = 0
    for _ in range(limit):
        now = utc_now()
        row = await events.scalar(
            select(Outbox)
            .where(
                Outbox.processed_at.is_(None),
                Outbox.failed_at.is_(None),
                Outbox.available_at <= now,
            )
            .order_by(Outbox.available_at, Outbox.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if row is None:
            break
        row_id = row.id
        try:
            await _deliver(events, platform, row)
            await platform.commit()
        except _RETRYABLE as exc:
            await platform.rollback()
            await events.rollback()
            # Reload: the failure may have aborted the Events transaction.
            row = await events.get(Outbox, row_id, with_for_update=True)
            if row is None:
                continue
            row.attempts += 1
            row.last_error = f"{type(exc).__name__}: {exc}"[:300]
            if row.attempts >= max_attempts:
                row.failed_at = now
                logger.error(
                    "Events outbox row gave up", extra={"outbox_id": str(row.id)}
                )
            else:
                row.available_at = now + timedelta(
                    seconds=retry_delay_seconds(row.attempts)
                )
        else:
            row.processed_at = now
            row.last_error = None
            done += 1
        await events.commit()
    return done
