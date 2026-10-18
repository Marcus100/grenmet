"""Outlet cash sales (E3): the organiser's own staff sell tickets for cash.

Who may sell: the same people who may scan at the door, namely the organiser's
active platform admins and owners (or legacy organiser members). Plain
``member`` staff are deliberately not enough yet because they would handle
cash; widen it with a decision, not by accident. Outlet buyers need no
account, so their tickets belong to an order with a null ``user_id`` and an
optional buyer name and phone.

Outlet and online claims share one inventory: both lock the requested tier rows
(``FOR UPDATE``, in id order) and count ``valid`` tickets per tier, so the
total can never exceed the allocation. The per-account limit does not apply.
Sales happen inside a till session (one per staff member, listing and Grenada
day) with an opening float and a closing count, which settlement (E4) reads.
"""

import uuid
from collections import Counter
from datetime import UTC, date
from typing import Any, Literal

from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import activity, schemas, tickets
from ..exceptions import EventsConflict, EventsNotFound
from ..models import (
    Admission,
    Listing,
    Order,
    OrderItem,
    Refund,
    Ticket,
    TicketTier,
    TillSession,
)
from .admission import _door_listing, _names
from .common import GRENADA, _naive_utc, _pairs

OUTLET_RECENT_SALES = 100
_LISTING_STATUS = TypeAdapter(Literal["draft", "published", "cancelled"])
_CURRENCY = TypeAdapter(Literal["XCD", "USD"])
_TICKET_STATUS = TypeAdapter(Literal["valid", "cancelled", "refunded"])
_REFUND_METHOD = TypeAdapter(Literal["cash", "bank"])
_DAY_CLOSED = "Your till is closed for today"
_NO_TILL = "Open your till before selling"


def _today() -> date:
    return utc_now().replace(tzinfo=UTC).astimezone(GRENADA).date()


def money(minor: int) -> str:
    return f"EC${minor / 100:,.2f}"


async def _stock(db: AsyncSession, tier_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    return _pairs(
        await db.execute(
            select(Ticket.tier_id, func.count())
            .where(Ticket.tier_id.in_(tier_ids), Ticket.status == "valid")
            .group_by(Ticket.tier_id)
        )
    )


def _selling(listing: Listing) -> bool:
    return (
        listing.status == "published"
        and listing.admission == "ticketed"
        and listing.ends_at > _naive_utc(utc_now())
    )


# --- Till sessions ---------------------------------------------------------------------


async def _till_stats(
    db: AsyncSession, till_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int, int, int]]:
    """``{till: (sales, tickets, collected_minor, cash_refunds_minor)}``."""
    if not till_ids:
        return {}
    orders = await db.execute(
        select(
            Order.till_session_id,
            func.count(),
            func.coalesce(func.sum(Order.collected_minor), 0),
        )
        .where(Order.till_session_id.in_(till_ids))
        .group_by(Order.till_session_id)
    )
    sold = _pairs(
        await db.execute(
            select(Order.till_session_id, func.count(Ticket.id))
            .join(Ticket, Ticket.order_id == Order.id)
            .where(Order.till_session_id.in_(till_ids))
            .group_by(Order.till_session_id)
        )
    )
    refunded = _pairs(
        await db.execute(
            select(Refund.till_session_id, func.sum(Refund.amount_minor))
            .where(Refund.till_session_id.in_(till_ids), Refund.method == "cash")
            .group_by(Refund.till_session_id)
        )
    )
    stats = {
        row[0]: (int(row[1]), int(sold.get(row[0], 0)), int(row[2]), 0)
        for row in orders.all()
    }
    for till_id, amount in refunded.items():
        sales, tickets_sold, collected, _ = stats.get(till_id, (0, 0, 0, 0))
        stats[till_id] = (sales, tickets_sold, collected, int(amount))
    return stats


async def till_views(
    db: AsyncSession, tills: list[TillSession]
) -> list[schemas.TillPublic]:
    stats = await _till_stats(db, [till.id for till in tills])
    names = await _names(db, {till.staff_id for till in tills})
    views: list[schemas.TillPublic] = []
    for till in tills:
        sales, sold, collected, refunded = stats.get(till.id, (0, 0, 0, 0))
        expected = till.opening_float_minor + collected - refunded
        views.append(
            schemas.TillPublic(
                id=till.id,
                staff_id=till.staff_id,
                staff_name=names.get(till.staff_id),
                day=till.day,
                status="closed" if till.closed_at else "open",
                opening_float_minor=till.opening_float_minor,
                opened_at=till.opened_at,
                closed_at=till.closed_at,
                sales_count=sales,
                tickets_sold=sold,
                collected_minor=collected,
                cash_refunds_minor=refunded,
                expected_minor=expected,
                counted_minor=till.counted_minor,
                difference_minor=(
                    till.counted_minor - expected
                    if till.counted_minor is not None
                    else None
                ),
                close_note=till.close_note,
            )
        )
    return views


async def _my_till(
    db: AsyncSession, listing: Listing, user: User, *, lock: bool = False
) -> TillSession | None:
    """The staff member's open till, else the one they opened today."""
    stmt = select(TillSession).where(
        TillSession.listing_id == listing.id, TillSession.staff_id == user.id
    )
    open_till: TillSession | None = await db.scalar(
        stmt.where(TillSession.closed_at.is_(None))
        .order_by(TillSession.opened_at.desc())
        .limit(1)
        .with_for_update(read=not lock)
    )
    if open_till is not None:
        return open_till
    today: TillSession | None = await db.scalar(stmt.where(TillSession.day == _today()))
    return today


async def open_till(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    body: schemas.TillOpen,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.TillPublic:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    if not _selling(listing):
        raise EventsConflict("Tickets can't be sold for this event")
    if await _my_till(db, listing, user) is not None:
        raise EventsConflict("You already opened a till today")
    till = TillSession(
        listing_id=listing.id,
        staff_id=user.id,
        day=_today(),
        opening_float_minor=body.opening_float_minor,
    )
    db.add(till)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise EventsConflict("You already opened a till today") from None
    activity.record(
        db,
        actor_id=user.id,
        action="till.opened",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={"till_id": str(till.id), "float_minor": till.opening_float_minor},
    )
    await db.commit()
    return (await till_views(db, [till]))[0]


async def close_till(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    body: schemas.TillClose,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.TillPublic:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    till = await _my_till(db, listing, user, lock=True)
    if till is None or till.closed_at is not None:
        raise EventsConflict("You have no open till to close")
    till.closed_at = utc_now()
    till.counted_minor = body.counted_minor
    till.close_note = (body.note or "").strip() or None
    view = (await till_views(db, [till]))[0]
    activity.record(
        db,
        actor_id=user.id,
        action="till.closed",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={
            "till_id": str(till.id),
            "expected_minor": view.expected_minor,
            "counted_minor": body.counted_minor,
            "difference_minor": body.counted_minor - view.expected_minor,
        },
    )
    await db.commit()
    return view


# --- Sales -----------------------------------------------------------------------------


def refundable(listing: Listing, status: str, price_minor: int, admitted: bool) -> bool:
    """A paid outlet ticket that is still valid, or was cancelled with its event.

    Used door tickets are refundable only when the event itself was cancelled.
    """
    cancelled_event = listing.status == "cancelled"
    if price_minor <= 0 or status not in {"valid", "cancelled"}:
        return False
    if status == "cancelled" and not cancelled_event:
        return False
    return not admitted or cancelled_event


async def refund_views(
    db: AsyncSession, refunds: list[Refund]
) -> list[schemas.RefundPublic]:
    if not refunds:
        return []
    rows = (
        await db.execute(
            select(Ticket.id, Ticket.code, TicketTier.name)
            .join(TicketTier, TicketTier.id == Ticket.tier_id)
            .where(Ticket.id.in_([refund.ticket_id for refund in refunds]))
        )
    ).all()
    detail = {row[0]: (row[1], row[2]) for row in rows}
    names = await _names(db, {refund.refunded_by for refund in refunds})
    return [
        schemas.RefundPublic(
            id=refund.id,
            ticket_id=refund.ticket_id,
            code=tickets.display_code(detail[refund.ticket_id][0]),
            tier_name=detail[refund.ticket_id][1],
            amount_minor=refund.amount_minor,
            method=_REFUND_METHOD.validate_python(refund.method),
            reference=refund.reference,
            refunded_by_name=names.get(refund.refunded_by),
            refunded_at=refund.refunded_at,
            till_session_id=refund.till_session_id,
        )
        for refund in sorted(refunds, key=lambda row: (row.refunded_at, row.id))
    ]


async def sale_views(
    db: AsyncSession, listing: Listing, orders: list[Order]
) -> list[schemas.OutletSale]:
    if not orders:
        return []
    rows: list[Any] = list(
        (
            await db.execute(
                select(
                    Ticket,
                    TicketTier.name,
                    OrderItem.unit_price_minor,
                    Admission.admitted_at,
                )
                .join(TicketTier, TicketTier.id == Ticket.tier_id)
                .join(
                    OrderItem,
                    (OrderItem.order_id == Ticket.order_id)
                    & (OrderItem.tier_id == Ticket.tier_id),
                )
                .outerjoin(Admission, Admission.ticket_id == Ticket.id)
                .where(Ticket.order_id.in_([order.id for order in orders]))
                .order_by(Ticket.created_at, Ticket.id)
            )
        ).all()
    )
    refunds = {
        view.ticket_id: view
        for view in await refund_views(
            db,
            list(
                (
                    await db.scalars(
                        select(Refund).where(
                            Refund.ticket_id.in_([row[0].id for row in rows])
                        )
                    )
                ).all()
            ),
        )
    }
    by_order: dict[uuid.UUID, list[schemas.OutletTicket]] = {}
    for ticket, tier_name, price, admitted_at in rows:
        by_order.setdefault(ticket.order_id, []).append(
            schemas.OutletTicket(
                id=ticket.id,
                code=tickets.display_code(ticket.code),
                qr_token=tickets.qr_token(ticket.code),
                tier_name=tier_name,
                price_minor=price,
                status=_TICKET_STATUS.validate_python(ticket.status),
                admitted_at=admitted_at,
                refund=refunds.get(ticket.id),
                can_refund=refundable(
                    listing, ticket.status, price, admitted_at is not None
                ),
            )
        )
    names = await _names(db, {order.sold_by for order in orders})
    return [
        schemas.OutletSale(
            order_id=order.id,
            listing_id=listing.id,
            listing_title=listing.title,
            venue=listing.venue,
            starts_at=listing.starts_at,
            currency=_CURRENCY.validate_python(order.currency),
            total_minor=order.total_minor,
            collected_minor=order.collected_minor,
            buyer_name=order.buyer_name,
            buyer_phone=order.buyer_phone,
            sold_by_name=names.get(order.sold_by) if order.sold_by else None,
            till_session_id=order.till_session_id,
            created_at=order.created_at,
            tickets=by_order.get(order.id, []),
        )
        for order in orders
    ]


async def sell_tickets(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    body: schemas.OutletSaleCreate,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.OutletSale:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    # Shared lock: serialises against an organiser cancelling the event.
    await db.refresh(listing, with_for_update={"read": True})
    if body.idempotency_key is not None:
        earlier = await db.scalar(
            select(Order).where(
                Order.listing_id == listing.id,
                Order.sold_by == user.id,
                Order.idempotency_key == body.idempotency_key,
            )
        )
        if earlier is not None:
            sale = (await sale_views(db, listing, [earlier]))[0]
            return sale.model_copy(update={"repeat": True})
    if listing.admission != "ticketed":
        raise EventsConflict("This event doesn't use tickets")
    if listing.status != "published":
        raise EventsConflict("Tickets can only be sold for a published event")
    if not _selling(listing):
        raise EventsConflict("This event has already ended")
    till = await _my_till(db, listing, user)
    if till is None:
        raise EventsConflict(_NO_TILL)
    if till.closed_at is not None:
        raise EventsConflict(_DAY_CLOSED)
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
    if len({tier.currency for tier in tiers}) != 1:
        raise EventsConflict("Sell one currency at a time")
    sold = await _stock(db, list(wanted))
    total = 0
    for tier in tiers:
        left = tier.allocation - sold.get(tier.id, 0)
        if left <= 0:
            raise EventsConflict(f"{tier.name} is sold out")
        if wanted[tier.id] > left:
            raise EventsConflict(f"Only {left} {tier.name} tickets are left")
        total += wanted[tier.id] * tier.price_minor
    if body.amount_collected_minor != total:
        raise EventsConflict(
            f"Collect exactly {money(total)} for these tickets"
            f" (you entered {money(body.amount_collected_minor)})"
        )
    order = Order(
        listing_id=listing.id,
        user_id=None,
        channel="outlet",
        payment_method="cash_outlet",
        total_minor=total,
        collected_minor=body.amount_collected_minor,
        currency=tiers[0].currency,
        buyer_name=(body.buyer_name or "").strip() or None,
        buyer_phone=(body.buyer_phone or "").strip() or None,
        sold_by=user.id,
        till_session_id=till.id,
        idempotency_key=body.idempotency_key,
    )
    db.add(order)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise EventsConflict("That sale was just recorded; refresh to see it") from None
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
                user_id=None,
                code=tickets.new_code(),
            )
            for _ in range(wanted[tier.id])
        )
    db.add_all(issued)
    activity.record(
        db,
        actor_id=user.id,
        action="ticket.sold_outlet",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={
            "order_id": str(order.id),
            "tickets": len(issued),
            "total_minor": total,
            "till_id": str(till.id),
        },
    )
    await db.commit()
    return (await sale_views(db, listing, [order]))[0]


async def get_sale(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    order_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.OutletSale:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    order = await db.get(Order, order_id)
    if order is None or order.listing_id != listing.id or order.channel != "outlet":
        raise EventsNotFound("Sale not found")
    return (await sale_views(db, listing, [order]))[0]


async def overview(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.OutletOverview:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    tiers = list(
        (
            await db.scalars(
                select(TicketTier)
                .where(TicketTier.listing_id == listing.id)
                .order_by(TicketTier.sort_order, TicketTier.id)
            )
        ).all()
    )
    sold = await _stock(db, [tier.id for tier in tiers])
    till = await _my_till(db, listing, user)
    orders = list(
        (
            await db.scalars(
                select(Order)
                .where(Order.listing_id == listing.id, Order.channel == "outlet")
                .order_by(Order.created_at.desc(), Order.id)
                .limit(OUTLET_RECENT_SALES)
            )
        ).all()
    )
    return schemas.OutletOverview(
        listing_id=listing.id,
        title=listing.title,
        starts_at=listing.starts_at,
        status=_LISTING_STATUS.validate_python(listing.status),
        selling=_selling(listing),
        tiers=[
            schemas.OutletTierStock(
                id=tier.id,
                name=tier.name,
                price_minor=tier.price_minor,
                currency=_CURRENCY.validate_python(tier.currency),
                allocation=tier.allocation,
                sold=sold.get(tier.id, 0),
                remaining=max(tier.allocation - sold.get(tier.id, 0), 0),
            )
            for tier in tiers
        ],
        till=(await till_views(db, [till]))[0] if till else None,
        sales=await sale_views(db, listing, orders),
    )
