"""Orders and tickets: free and registration claims (E1) and paid tiers (N4b).

Inventory is the number of ``valid`` tickets per tier plus the stock held by unpaid
online orders (``holds``). A claim locks the requested tier rows (``FOR UPDATE``,
in id order so concurrent claims cannot deadlock), then checks allocation and the
per-account limit against those counts, so sold never exceeds allocation.
Cancelling a ticket marks it ``cancelled``, which releases the seat.

A paid tier creates the order ``pending_payment`` and holds its stock. The intent
is created on the shared payments core (``order_payments``); the
``events.order_paid`` handler issues the tickets, the sweeper releases an unpaid
hold. The order commits first (it holds the stock), then the intent is created and
linked; a retry finds the intent by its key.
"""

import uuid
from collections import Counter
from datetime import datetime, timedelta
from typing import Literal

from pydantic import TypeAdapter
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException
from src.utils.datetime import utc_now

from .. import order_payments, outbox, rewards_hook, schemas, tickets
from ..config import events_settings
from ..exceptions import EventsConflict, EventsNotFound
from ..models import (
    Admission,
    Listing,
    Order,
    OrderItem,
    Organiser,
    Ticket,
    TicketTier,
)
from . import holds
from .common import _naive_utc, _pairs

_PARISH = TypeAdapter(schemas.Parish)
_CURRENCY = TypeAdapter(Literal["XCD", "USD"])
_STATUS = TypeAdapter(Literal["valid", "cancelled", "refunded"])
_ORDER_STATUS = TypeAdapter(
    Literal["confirmed", "pending_payment", "expired", "refunded"]
)
_DEADLOCK_SQLSTATE = "40P01"


async def _claimable_listing(db: AsyncSession, slug: str) -> Listing:
    # A shared lock on the listing row serialises a claim against an organiser
    # cancelling the event (which takes the exclusive lock).
    listing = await db.scalar(
        select(Listing)
        .where(Listing.slug == slug, Listing.status == "published")
        .with_for_update(read=True)
    )
    if listing is None:
        raise EventsNotFound("Event not found")
    if listing.admission != "ticketed":
        raise EventsConflict("This event doesn't use tickets")
    if listing.ends_at <= _naive_utc(utc_now()):
        raise EventsConflict("This event has already ended")
    return listing


def is_deadlock(error: DBAPIError) -> bool:
    """True when Postgres resolved a lock cycle by aborting this transaction.

    The victim lost the race for the stock just as if the last ticket had been
    taken (the same rule as the bookings slot race)."""
    code = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
    return code == _DEADLOCK_SQLSTATE or "deadlock detected" in str(error.orig)


async def claim_tickets(
    db: AsyncSession,
    user: User,
    slug: str,
    body: schemas.OrderCreate,
    *,
    idempotency_key: str | None = None,
) -> schemas.OrderPublic:
    """Claim free tickets, or order paid ones.

    A free order issues its tickets at once. A paid order is created
    ``pending_payment`` and holds its stock; the payments core collects the money
    and the ``events.order_paid`` handler issues the tickets.
    ``idempotency_key`` makes a retry return the same order."""
    listing = await _claimable_listing(db, slug)
    wanted = Counter[uuid.UUID]()
    for item in body.items:
        wanted[item.tier_id] += item.quantity
    try:
        order, tiers, issued = await _create_order(
            db, user, listing, wanted, idempotency_key
        )
    except DBAPIError as error:
        if not is_deadlock(error):
            raise
        await db.rollback()
        raise EventsConflict(
            "Those tickets were just taken; please try again"
        ) from None
    checkout_url = None
    if order.status == holds.PENDING:
        checkout_url = await _payment_link(db, user, listing, order)
    return _order_public(listing, order, tiers, issued, checkout_url)


async def _create_order(
    db: AsyncSession,
    user: User,
    listing: Listing,
    wanted: Counter[uuid.UUID],
    idempotency_key: str | None,
) -> tuple[Order, list[TicketTier], list[Ticket]]:
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
    if idempotency_key is not None:
        # Looked up under the tier locks, so a concurrent twin has finished.
        again = await _existing_order(db, user, listing, idempotency_key, wanted)
        if again is not None:
            return again, tiers, await _tickets_of(db, again)
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
    unpaid = await holds.held_by_tier(db, list(wanted))
    unpaid_mine = await holds.held_by_tier(db, list(wanted), user_id=user.id)
    total = 0
    for tier in tiers:
        quantity = wanted[tier.id]
        left = tier.allocation - sold.get(tier.id, 0) - unpaid.get(tier.id, 0)
        if left <= 0:
            raise EventsConflict(f"{tier.name} is sold out")
        if quantity > left:
            raise EventsConflict(f"Only {left} {tier.name} tickets are left")
        already = held.get(tier.id, 0) + unpaid_mine.get(tier.id, 0)
        if already + quantity > tier.per_account_limit:
            raise EventsConflict(
                f"You can hold up to {tier.per_account_limit} {tier.name} tickets"
                f" (you have {already})"
            )
        total += quantity * tier.price_minor
    paid = total > 0
    if paid:
        await _require_collectable(db, listing, tiers)
    order = Order(
        listing_id=listing.id,
        user_id=user.id,
        total_minor=total,
        currency=tiers[0].currency,
        idempotency_key=idempotency_key,
    )
    if paid:
        order.status = holds.PENDING
        order.payment_method = "online"
        order.payment_expires_at = utc_now() + timedelta(
            minutes=events_settings.ORDER_HOLD_MINUTES
        )
    db.add(order)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise EventsConflict("That order was just placed; refresh to see it") from None
    for tier in tiers:
        db.add(
            OrderItem(
                order_id=order.id,
                tier_id=tier.id,
                quantity=wanted[tier.id],
                unit_price_minor=tier.price_minor,
            )
        )
    issued: list[Ticket] = []
    if not paid:
        for tier in tiers:
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
    return order, tiers, issued


async def _require_collectable(
    db: AsyncSession,
    listing: Listing,
    tiers: list[TicketTier],
) -> None:
    """A paid order needs one currency and an organiser the payments core can pay."""
    paid = next(tier for tier in tiers if tier.price_minor > 0)
    unavailable = EventsConflict(
        f"{paid.name} is a paid ticket; online payment isn't available for this event"
    )
    organiser = await db.get(Organiser, listing.organiser_id)
    if organiser is None or not await order_payments.can_collect(
        db, organiser.organisation_id
    ):
        raise unavailable
    if len({tier.currency for tier in tiers}) != 1:
        raise EventsConflict("Order one currency at a time")


async def _existing_order(
    db: AsyncSession,
    user: User,
    listing: Listing,
    key: str,
    wanted: Counter[uuid.UUID],
) -> Order | None:
    order = await db.scalar(
        select(Order).where(
            Order.listing_id == listing.id,
            Order.user_id == user.id,
            Order.channel == "online",
            Order.idempotency_key == key,
        )
    )
    if order is None:
        return None
    items = Counter[uuid.UUID]()
    for tier_id, quantity in await db.execute(
        select(OrderItem.tier_id, OrderItem.quantity).where(
            OrderItem.order_id == order.id
        )
    ):
        items[tier_id] += quantity
    if items != wanted:
        raise EventsConflict("This Idempotency-Key was already used for another order")
    if order.status == "expired":
        # Never hand back a dead order as a successful claim; the client starts over.
        raise EventsConflict("That attempt expired. Start a new one.")
    return order


async def _tickets_of(db: AsyncSession, order: Order) -> list[Ticket]:
    return list(
        await db.scalars(
            select(Ticket)
            .where(Ticket.order_id == order.id)
            .order_by(Ticket.created_at, Ticket.id)
        )
    )


async def _payment_link(
    db: AsyncSession,
    user: User | None,
    listing: Listing,
    order: Order,
) -> str | None:
    """Find or create the order's intent and return its checkout URL (None on the
    manual rail).

    The order is already committed and holds its stock; the intent is keyed by the
    order id (a retry finds it) and an order that never gets one is expired by the
    sweeper. If the money side cannot start, the stock is given back at once."""
    organiser = await db.get(Organiser, listing.organiser_id)
    if organiser is None or organiser.organisation_id is None:
        return None
    order_id = order.id
    try:
        intent_id, checkout_url = await order_payments.ensure_intent(
            db,
            organisation_id=organiser.organisation_id,
            order=order,
            customer_email=user.email if user else None,
            listing_title=listing.title,
        )
        if order.payment_intent_id != intent_id:
            order.payment_intent_id = intent_id
            db.add(order)
        await db.commit()
    except AppException:
        await db.rollback()
        await db.execute(
            update(Order).where(Order.id == order_id).values(status="expired")
        )
        await db.commit()
        raise
    return checkout_url


def _order_public(
    listing: Listing,
    order: Order,
    tiers: list[TicketTier],
    issued: list[Ticket],
    checkout_url: str | None,
) -> schemas.OrderPublic:
    names = {tier.id: tier.name for tier in tiers}
    pending = order.status == holds.PENDING
    return schemas.OrderPublic(
        id=order.id,
        listing_slug=listing.slug,
        total_minor=order.total_minor,
        currency=_CURRENCY.validate_python(order.currency),
        created_at=order.created_at,
        tickets=[_summary(row, listing, names[row.tier_id]) for row in issued],
        status=_ORDER_STATUS.validate_python(order.status),
        payment_required=pending,
        checkout_url=checkout_url if pending else None,
        payment_expires_at=order.payment_expires_at if pending else None,
    )


async def my_order(
    db: AsyncSession, user: User, order_id: uuid.UUID
) -> schemas.OrderPublic:
    """One of the member's own orders, for polling after checkout."""
    order = await db.scalar(
        select(Order).where(
            Order.id == order_id, Order.user_id == user.id, Order.channel == "online"
        )
    )
    if order is None:
        raise EventsNotFound("Order not found")
    listing = await db.get(Listing, order.listing_id)
    assert listing is not None
    tiers = list(
        await db.scalars(
            select(TicketTier).where(
                TicketTier.id.in_(
                    select(OrderItem.tier_id).where(OrderItem.order_id == order.id)
                )
            )
        )
    )
    checkout_url = None
    if order.status == holds.PENDING:
        checkout_url = await _payment_link(db, user, listing, order)
    return _order_public(
        listing, order, tiers, await _tickets_of(db, order), checkout_url
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
    if await db.scalar(
        select(Order.id).where(
            Order.id == ticket.order_id, Order.payment_method == "online"
        )
    ):
        # Cancelling would drop the seat but keep the money; a refund through the
        # payments core cancels the tickets instead.
        raise EventsConflict(
            "This ticket was paid online; ask the organiser for a refund"
        )
    if await db.scalar(select(Admission.id).where(Admission.ticket_id == ticket.id)):
        raise EventsConflict("This ticket has already been used at the door")
    if listing.starts_at <= _naive_utc(utc_now()):
        raise EventsConflict("Tickets can't be cancelled once the event has started")
    ticket.status = "cancelled"
    ticket.cancelled_at = utc_now()
    db.add(ticket)
    await db.commit()
    return _summary(ticket, listing, tier.name)


async def cancel_valid_tickets(db: AsyncSession, listing_id: uuid.UUID) -> int:
    """Cancel every valid ticket of a cancelled event; returns how many.

    The caller holds the listing row lock (it just changed the listing), and
    claims and outlet sales take a shared lock on it, so none can slip in.
    """
    result = await db.execute(
        update(Ticket)
        .where(Ticket.listing_id == listing_id, Ticket.status == "valid")
        .values(status="cancelled", cancelled_at=utc_now())
        .returning(Ticket.id)
    )
    cancelled = list(result.scalars())
    # Tickets already scanned at the door lose their stamps with the event.
    await rewards_hook.reverse_for_tickets(db, cancelled)
    return len(cancelled)
