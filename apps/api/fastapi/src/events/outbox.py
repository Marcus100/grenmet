"""Events notifications on the platform outbox (ADR-0026, ADR-0038).

``enqueue`` adds a ``events.notify`` row to the caller's transaction, so it commits
or rolls back with the change itself. The platform ``drain_outbox`` job runs
``deliver`` for each due row: recipients are resolved at drain time and
``notifications.notify`` receives the row's ``dedupe_key``, so a repeat tells nobody
twice. Retries, back-off and dead-lettering belong to ``src.outbox``. Payloads hold
ids and public labels only.

Import this module (the worker does at startup and in ``drain_outbox``) to register
the handler.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.notifications import service as notification_service
from src.organisations.models import Membership, MembershipRole, MembershipStatus

from . import notifications
from .models import (
    Follow,
    Listing,
    Order,
    Organiser,
    Rsvp,
    SavedListing,
    Ticket,
)
from .service.common import GRENADA

TOPIC = "events.notify"

PUBLISHED = "listing.published"
CANCELLED = "listing.cancelled"
POSTPONED = "listing.postponed"
ORGANISER_APPROVED = "organiser.approved"
ORGANISER_REJECTED = "organiser.rejected"
TICKET_ISSUED = "ticket.issued"

_EVENT_KEYS = {
    PUBLISHED: notifications.LISTING_PUBLISHED,
    CANCELLED: notifications.LISTING_CANCELLED,
    POSTPONED: notifications.LISTING_POSTPONED,
    ORGANISER_APPROVED: notifications.ORGANISER_APPROVED,
    ORGANISER_REJECTED: notifications.ORGANISER_REJECTED,
    TICKET_ISSUED: notifications.TICKET_ISSUED,
}


@dataclass(frozen=True)
class Row:
    """What ``_deliver`` needs from an outbox message."""

    kind: str
    entity_id: str
    payload: dict[str, str]
    dedupe_key: str


async def enqueue(
    db: AsyncSession,
    *,
    kind: str,
    entity_type: str,
    entity_id: str,
    dedupe_key: str,
    payload: dict[str, str],
) -> None:
    """Add a platform outbox row to the caller's transaction (no commit). A repeated
    ``dedupe_key`` is ignored, so retried requests queue each effect once."""
    await outbox.enqueue(
        db,
        topic=TOPIC,
        dedupe_key=dedupe_key,
        payload={
            **payload,
            "kind": kind,
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
    )


def _when(value: str | None) -> str:
    if not value:
        return "a time to be confirmed"
    local = datetime.fromisoformat(value).replace(tzinfo=UTC).astimezone(GRENADA)
    return local.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")


async def _listing_audience(
    db: AsyncSession, row: Row, listing: Listing
) -> set[uuid.UUID]:
    if row.kind == PUBLISHED:
        if listing.status != "published" or listing.visibility != "public":
            return set()
        return set(
            (
                await db.scalars(
                    select(Follow.user_id).where(
                        Follow.organiser_id == listing.organiser_id
                    )
                )
            ).all()
        )
    going = await db.scalars(select(Rsvp.user_id).where(Rsvp.listing_id == listing.id))
    saved = await db.scalars(
        select(SavedListing.user_id).where(SavedListing.listing_id == listing.id)
    )
    audience = set(going.all()) | set(saved.all())
    # Ticket holders (including those just cancelled by the event) hear too.
    holders = await db.scalars(
        select(Ticket.user_id).where(
            Ticket.listing_id == listing.id, Ticket.user_id.is_not(None)
        )
    )
    return audience | {holder for holder in holders.all() if holder is not None}


async def _deliver(db: AsyncSession, row: Row) -> int:
    payload = row.payload
    actor = payload.get("actor_id")
    exclude = [uuid.UUID(actor)] if actor else []
    if row.kind in (ORGANISER_APPROVED, ORGANISER_REJECTED):
        organiser = await db.get(Organiser, uuid.UUID(row.entity_id))
        if organiser is None or organiser.organisation_id is None:
            return 0
        recipients = set(
            (
                await db.scalars(
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
            db,
            event_key=_EVENT_KEYS[row.kind],
            organisation_id=organiser.organisation_id,
            recipients=recipients,
            context={
                "organiser": organiser.name,
                **(
                    {"reason": payload.get("reason", "")}
                    if row.kind == ORGANISER_REJECTED
                    else {}
                ),
            },
            entity_type="organiser",
            entity_id=row.entity_id,
            dedupe_key=row.dedupe_key,
        )
    if row.kind == TICKET_ISSUED:
        return await _deliver_tickets(db, row)
    listing = await db.get(Listing, uuid.UUID(row.entity_id))
    if listing is None:
        return 0
    organiser = await db.get(Organiser, listing.organiser_id)
    return await notification_service.notify(
        db,
        event_key=_EVENT_KEYS[row.kind],
        organisation_id=organiser.organisation_id if organiser else None,
        recipients=await _listing_audience(db, row, listing),
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


async def _deliver_tickets(db: AsyncSession, row: Row) -> int:
    order = await db.get(Order, uuid.UUID(row.entity_id))
    if order is None or order.user_id is None:
        return 0
    listing = await db.get(Listing, order.listing_id)
    if listing is None:
        return 0
    organiser = await db.get(Organiser, listing.organiser_id)
    return await notification_service.notify(
        db,
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


@outbox.handler(TOPIC)
async def deliver(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    payload = {key: str(value) for key, value in message.payload.items()}
    await _deliver(
        session,
        Row(
            kind=payload["kind"],
            entity_id=payload["entity_id"],
            payload=payload,
            dedupe_key=message.dedupe_key,
        ),
    )
