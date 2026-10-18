"""Orders and tickets for free and registration tiers (E1).

Inventory is the number of ``valid`` tickets per tier. A claim locks the
requested tier rows (``FOR UPDATE``, in id order so concurrent claims cannot
deadlock), then checks allocation and the per-account limit against the counts,
so sold never exceeds allocation. Cancelling a ticket marks it ``cancelled``,
which releases the seat for the next claim. Paid tiers are refused until online
payment exists.
"""

import uuid
from collections import Counter
from datetime import datetime
from typing import Literal

from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import outbox, schemas, tickets
from ..exceptions import EventsConflict, EventsNotFound
from ..models import Admission, Listing, Order, OrderItem, Ticket, TicketTier
from .common import _naive_utc, _pairs

_PARISH = TypeAdapter(schemas.Parish)
_CURRENCY = TypeAdapter(Literal["XCD", "USD"])
_STATUS = TypeAdapter(Literal["valid", "cancelled"])


async def _claimable_listing(db: AsyncSession, slug: str) -> Listing:
    listing = await db.scalar(
        select(Listing).where(Listing.slug == slug, Listing.status == "published")
    )
    if listing is None:
        raise EventsNotFound("Event not found")
    if listing.admission != "ticketed":
        raise EventsConflict("This event doesn't use tickets")
    if listing.ends_at <= _naive_utc(utc_now()):
        raise EventsConflict("This event has already ended")
    return listing


async def claim_tickets(
    db: AsyncSession, user: User, slug: str, body: schemas.OrderCreate
) -> schemas.OrderPublic:
    listing = await _claimable_listing(db, slug)
    wanted = Counter[uuid.UUID]()
    for item in body.items:
        wanted[item.tier_id] += item.quantity
    tiers = list(
        (
            await db.scalars(
                select(TicketTier)
                .where(TicketTier.listing_id == listing.id, TicketTier.id.in_(wanted))
                .order_by(TicketTier.id)
                .with_for_update()
            )
        ).all()
    )
    if len(tiers) != len(wanted):
        raise EventsNotFound("Ticket tier not found")
    valid = Ticket.status == "valid"
    sold = _pairs(
        await db.execute(
            select(Ticket.tier_id, func.count())
            .where(Ticket.tier_id.in_(wanted), valid)
            .group_by(Ticket.tier_id)
        )
    )
    held = _pairs(
        await db.execute(
            select(Ticket.tier_id, func.count())
            .where(Ticket.tier_id.in_(wanted), Ticket.user_id == user.id, valid)
            .group_by(Ticket.tier_id)
        )
    )
    total = 0
    for tier in tiers:
        quantity = wanted[tier.id]
        if tier.price_minor > 0:
            raise EventsConflict(
                f"{tier.name} is a paid ticket; online payment isn't available yet"
            )
        left = tier.allocation - sold.get(tier.id, 0)
        if left <= 0:
            raise EventsConflict(f"{tier.name} is sold out")
        if quantity > left:
            raise EventsConflict(f"Only {left} {tier.name} tickets are left")
        already = held.get(tier.id, 0)
        if already + quantity > tier.per_account_limit:
            raise EventsConflict(
                f"You can hold up to {tier.per_account_limit} {tier.name} tickets"
                f" (you have {already})"
            )
        total += quantity * tier.price_minor
    order = Order(
        listing_id=listing.id,
        user_id=user.id,
        total_minor=total,
        currency=tiers[0].currency,
    )
    db.add(order)
    await db.flush()
    issued: list[Ticket] = []
    for tier in tiers:
        db.add(
            OrderItem(
                order_id=order.id,
                tier_id=tier.id,
                quantity=wanted[tier.id],
                unit_price_minor=tier.price_minor,
            )
        )
        issued.extend(
            Ticket(
                order_id=order.id,
                listing_id=listing.id,
                tier_id=tier.id,
                user_id=user.id,
                code=tickets.new_code(),
            )
            for _ in range(wanted[tier.id])
        )
    db.add_all(issued)
    await outbox.enqueue(
        db,
        kind=outbox.TICKET_ISSUED,
        entity_type="order",
        entity_id=str(order.id),
        dedupe_key=f"ticket.issued:{order.id}",
        payload={
            "count": str(len(issued)),
            "listing_id": str(listing.id),
            "starts_at": listing.starts_at.isoformat(),
        },
    )
    await db.commit()
    names = {tier.id: tier.name for tier in tiers}
    return schemas.OrderPublic(
        id=order.id,
        listing_slug=listing.slug,
        total_minor=order.total_minor,
        currency=_CURRENCY.validate_python(order.currency),
        created_at=order.created_at,
        tickets=[_summary(row, listing, names[row.tier_id]) for row in issued],
    )


def _summary(
    ticket: Ticket,
    listing: Listing,
    tier_name: str,
    admitted_at: datetime | None = None,
) -> schemas.TicketSummary:
    can_cancel = (
        ticket.status == "valid"
        and admitted_at is None
        and listing.starts_at > _naive_utc(utc_now())
    )
    return schemas.TicketSummary.model_validate(
        {
            "id": ticket.id,
            "code": tickets.display_code(ticket.code),
            "status": _STATUS.validate_python(ticket.status),
            "tier_name": tier_name,
            "listing_slug": listing.slug,
            "listing_title": listing.title,
            "venue": listing.venue,
            "parish": _PARISH.validate_python(listing.parish),
            "starts_at": listing.starts_at,
            "ends_at": listing.ends_at,
            "can_cancel": can_cancel,
            "admitted_at": admitted_at,
        }
    )


async def _my_ticket_rows(
    db: AsyncSession, user: User, ticket_id: uuid.UUID | None = None
) -> list[tuple[Ticket, Listing, str, datetime | None]]:
    stmt = (
        select(Ticket, Listing, TicketTier.name, Admission.admitted_at)
        .join(Listing, Listing.id == Ticket.listing_id)
        .join(TicketTier, TicketTier.id == Ticket.tier_id)
        .outerjoin(Admission, Admission.ticket_id == Ticket.id)
        .where(Ticket.user_id == user.id)
        .order_by(Listing.starts_at, Ticket.created_at, Ticket.id)
    )
    if ticket_id is not None:
        stmt = stmt.where(Ticket.id == ticket_id)
    return [(row[0], row[1], row[2], row[3]) for row in (await db.execute(stmt)).all()]


async def my_tickets(db: AsyncSession, user: User) -> list[schemas.TicketSummary]:
    return [
        _summary(ticket, listing, tier, admitted)
        for ticket, listing, tier, admitted in await _my_ticket_rows(db, user)
    ]


async def my_ticket(
    db: AsyncSession, user: User, ticket_id: uuid.UUID
) -> schemas.TicketDetail:
    rows = await _my_ticket_rows(db, user, ticket_id)
    if not rows:
        raise EventsNotFound("Ticket not found")
    ticket, listing, tier, admitted = rows[0]
    return schemas.TicketDetail(
        **_summary(ticket, listing, tier, admitted).model_dump(),
        qr_token=tickets.qr_token(ticket.code),
    )


async def cancel_ticket(
    db: AsyncSession, user: User, ticket_id: uuid.UUID
) -> schemas.TicketSummary:
    ticket = await db.scalar(
        select(Ticket)
        .where(Ticket.id == ticket_id, Ticket.user_id == user.id)
        .with_for_update()
    )
    if ticket is None:
        raise EventsNotFound("Ticket not found")
    listing = await db.get(Listing, ticket.listing_id)
    tier = await db.get(TicketTier, ticket.tier_id)
    assert listing is not None
    assert tier is not None
    if ticket.status != "valid":
        raise EventsConflict("This ticket is already cancelled")
    if await db.scalar(select(Admission.id).where(Admission.ticket_id == ticket.id)):
        raise EventsConflict("This ticket has already been used at the door")
    if listing.starts_at <= _naive_utc(utc_now()):
        raise EventsConflict("Tickets can't be cancelled once the event has started")
    ticket.status = "cancelled"
    ticket.cancelled_at = utc_now()
    db.add(ticket)
    await db.commit()
    return _summary(ticket, listing, tier.name)
