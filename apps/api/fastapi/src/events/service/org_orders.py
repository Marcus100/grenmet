"""Organiser order desk (org zone): read orders and attendees, record a manual
payment, refund and cancel an order.

Every function takes the resolved ``organisation_id`` (from ``OrgContext``) and
reaches an event or order only through the organiser linked to that
organisation; anything else is a 404. Money moves through the payments core
(``order_payments``, ``order_refunds``); each change writes one activity row with
ids, amounts and method (never the reference, names or emails) in the same
transaction. The caller commits.
"""

import uuid
from typing import Any, Literal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.utils.datetime import utc_now

from .. import activity, order_fulfilment, order_payments, order_refunds, schemas
from ..exceptions import EventsConflict, EventsNotFound
from ..models import (
    Admission,
    Listing,
    MemberProfile,
    Order,
    OrderItem,
    Organiser,
    Ticket,
    TicketTier,
)


def _is_online_paid(order: Order) -> bool:
    return order.channel == "online" and order.payment_method == "online"


async def _listing(
    db: AsyncSession, organisation_id: str, listing_id: uuid.UUID
) -> Listing:
    listing = await db.scalar(
        select(Listing)
        .join(Organiser, Organiser.id == Listing.organiser_id)
        .where(Listing.id == listing_id, Organiser.organisation_id == organisation_id)
    )
    if listing is None:
        raise EventsNotFound("Event not found")
    return listing


async def _order(
    db: AsyncSession,
    organisation_id: str,
    order_id: uuid.UUID,
    *,
    lock: bool = False,
) -> tuple[Order, Listing]:
    query = (
        select(Order, Listing)
        .join(Listing, Listing.id == Order.listing_id)
        .join(Organiser, Organiser.id == Listing.organiser_id)
        .where(Order.id == order_id, Organiser.organisation_id == organisation_id)
    )
    if lock:
        query = query.with_for_update(of=Order).execution_options(
            populate_existing=True
        )
    row = (await db.execute(query)).first()
    if row is None:
        raise EventsNotFound("Order not found")
    return row[0], row[1]


async def _buyer_names(
    db: AsyncSession, orders: list[Order]
) -> dict[uuid.UUID, str | None]:
    user_ids = {order.user_id for order in orders if order.user_id is not None}
    if not user_ids:
        return {}
    rows = await db.execute(
        select(MemberProfile.user_id, MemberProfile.display_name).where(
            MemberProfile.user_id.in_(user_ids)
        )
    )
    return {row[0]: row[1] for row in rows.all()}


def _row(
    order: Order,
    ticket_count: int,
    active_ticket_count: int,
    names: dict[uuid.UUID, str | None],
) -> dict[str, Any]:
    name = order.buyer_name
    if name is None and order.user_id is not None:
        name = names.get(order.user_id)
    return {
        "id": order.id,
        "listing_id": order.listing_id,
        "status": order.status,
        "channel": order.channel,
        "payment_method": order.payment_method,
        "buyer_name": name,
        "total_minor": order.total_minor,
        "currency": order.currency,
        "collected_minor": order.collected_minor,
        "refunded_minor": order.refunded_minor,
        "ticket_count": ticket_count,
        "active_ticket_count": active_ticket_count,
        "created_at": order.created_at,
        "paid_at": order.paid_at,
    }


async def list_orders(
    db: AsyncSession,
    organisation_id: str,
    listing_id: uuid.UUID,
    *,
    status: str | None,
    page: int,
    size: int,
) -> schemas.OrgOrderList:
    listing = await _listing(db, organisation_id, listing_id)
    conditions = [Order.listing_id == listing.id]
    if status is not None:
        conditions.append(Order.status == status)
    count = await db.scalar(select(func.count()).select_from(Order).where(*conditions))
    tickets = (
        select(
            Ticket.order_id,
            func.count().label("n"),
            func.count().filter(Ticket.status == "valid").label("valid"),
        )
        .group_by(Ticket.order_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(
                Order,
                func.coalesce(tickets.c.n, 0),
                func.coalesce(tickets.c.valid, 0),
            )
            .outerjoin(tickets, tickets.c.order_id == Order.id)
            .where(*conditions)
            .order_by(Order.created_at.desc(), Order.id)
            .limit(size)
            .offset((page - 1) * size)
        )
    ).all()
    names = await _buyer_names(db, [row[0] for row in rows])
    return schemas.OrgOrderList(
        data=[
            schemas.OrgOrderRow(**_row(order, int(n), int(valid), names))
            for order, n, valid in rows
        ],
        count=int(count or 0),
        page=page,
        size=size,
    )


async def _detail(
    db: AsyncSession, organisation_id: str, order: Order, listing: Listing
) -> schemas.OrgOrderDetail:
    items = (
        await db.execute(
            select(OrderItem, TicketTier.name)
            .join(TicketTier, TicketTier.id == OrderItem.tier_id)
            .where(OrderItem.order_id == order.id)
            .order_by(TicketTier.name, OrderItem.id)
        )
    ).all()
    tickets = (
        await db.execute(
            select(Ticket, TicketTier.name, Admission.admitted_at)
            .join(TicketTier, TicketTier.id == Ticket.tier_id)
            .outerjoin(Admission, Admission.ticket_id == Ticket.id)
            .where(Ticket.order_id == order.id)
            .order_by(Ticket.created_at, Ticket.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    names = await _buyer_names(db, [order])
    email = None
    if order.user_id is not None:
        email = await db.scalar(select(User.email).where(User.id == order.user_id))
    intent = (
        await order_payments.intent_for(
            db, organisation_id=organisation_id, order_id=order.id
        )
        if _is_online_paid(order)
        else None
    )
    payment = (
        schemas.OrgOrderPayment(
            intent_id=intent.id,
            provider=str(intent.provider),
            status=str(intent.status),
            captured_minor=intent.captured_minor,
            refunded_minor=intent.refunded_minor,
            refundable_minor=max(intent.captured_minor - intent.refunded_minor, 0),
        )
        if intent is not None
        else None
    )
    return schemas.OrgOrderDetail(
        **_row(
            order,
            len(tickets),
            sum(1 for ticket, _, _ in tickets if ticket.status == "valid"),
            names,
        ),
        listing_title=listing.title,
        buyer_email=email,
        buyer_phone=order.buyer_phone,
        payment_expires_at=order.payment_expires_at,
        items=[
            schemas.OrgOrderItem(
                tier_id=item.tier_id,
                tier_name=name,
                quantity=item.quantity,
                unit_price_minor=item.unit_price_minor,
            )
            for item, name in items
        ],
        tickets=[
            schemas.OrgOrderTicket(
                id=ticket.id,
                code=ticket.code,
                status=ticket.status,
                tier_name=tier,
                admitted_at=admitted,
            )
            for ticket, tier, admitted in tickets
        ],
        payment=payment,
    )


async def get_order(
    db: AsyncSession, organisation_id: str, order_id: uuid.UUID
) -> schemas.OrgOrderDetail:
    order, listing = await _order(db, organisation_id, order_id)
    return await _detail(db, organisation_id, order, listing)


async def list_attendees(
    db: AsyncSession,
    organisation_id: str,
    listing_id: uuid.UUID,
    *,
    status: str | None,
    tier_id: uuid.UUID | None,
    page: int,
    size: int,
) -> schemas.OrgAttendeeList:
    listing = await _listing(db, organisation_id, listing_id)
    conditions = [Ticket.listing_id == listing.id]
    if status is not None:
        conditions.append(Ticket.status == status)
    if tier_id is not None:
        conditions.append(Ticket.tier_id == tier_id)
    count = await db.scalar(select(func.count()).select_from(Ticket).where(*conditions))
    rows = (
        await db.execute(
            select(
                Ticket,
                TicketTier.name,
                Order.channel,
                func.coalesce(Order.buyer_name, MemberProfile.display_name),
                Admission.admitted_at,
            )
            .join(TicketTier, TicketTier.id == Ticket.tier_id)
            .join(Order, Order.id == Ticket.order_id)
            .outerjoin(MemberProfile, MemberProfile.user_id == Ticket.user_id)
            .outerjoin(Admission, Admission.ticket_id == Ticket.id)
            .where(*conditions)
            .order_by(Ticket.created_at, Ticket.id)
            .limit(size)
            .offset((page - 1) * size)
        )
    ).all()
    return schemas.OrgAttendeeList(
        data=[
            schemas.OrgAttendee(
                ticket_id=ticket.id,
                order_id=ticket.order_id,
                code=ticket.code,
                status=ticket.status,
                tier_id=ticket.tier_id,
                tier_name=tier,
                holder_name=holder,
                channel=channel,
                admitted_at=admitted,
            )
            for ticket, tier, channel, holder, admitted in rows
        ],
        count=int(count or 0),
        page=page,
        size=size,
    )


async def record_payment(
    db: AsyncSession,
    organisation_id: str,
    actor: User,
    order_id: uuid.UUID,
    body: schemas.OrgManualPaymentCreate,
) -> schemas.OrgOrderDetail:
    """Staff received cash or a bank transfer for a ``pending_payment`` order.

    The payment succeeds now and the order is fulfilled in this transaction
    (tickets issued, receipt queued); the outbox reaction that follows is a no-op.
    """
    order, listing = await _order(db, organisation_id, order_id, lock=True)
    if not _is_online_paid(order):
        raise EventsConflict("Only an online order waits for a payment")
    if order.status == "confirmed":
        raise EventsConflict("This order is already paid")
    if order.status != order_fulfilment.PENDING:
        raise EventsConflict(
            f"This order is {order.status}; a payment can't be recorded"
        )
    if listing.status != "published" or listing.ends_at <= utc_now():
        raise EventsConflict("The event is no longer on sale")
    intent = await order_payments.intent_for(
        db, organisation_id=organisation_id, order_id=order.id
    )
    if intent is None:
        raise EventsConflict("This order has no payment to record against")
    await payments_service.record_manual_payment(
        db,
        organisation_id=organisation_id,
        intent_id=intent.id,
        actor=actor,
        payload=payment_schemas.ManualPaymentCreate(
            method=payment_schemas.ManualMethod(body.method),
            reference=body.reference,
        ),
    )
    await order_fulfilment.fulfil_paid(
        db,
        organisation_id=organisation_id,
        order_id=order.id,
        intent_id=intent.id,
    )
    activity.record(
        db,
        actor_id=actor.id,
        action="order.payment_recorded",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={
            "order_id": str(order.id),
            "amount_minor": order.total_minor,
            "method": body.method,
        },
    )
    await db.flush()
    return await _detail(db, organisation_id, order, listing)


async def refund_order(
    db: AsyncSession,
    organisation_id: str,
    actor: User,
    order_id: uuid.UUID,
    body: schemas.OrgOrderRefundCreate,
) -> schemas.OrgOrderDetail:
    """Hand back money for a paid online order (all of it, or ``amount_minor``).

    Only a full refund cancels the tickets and marks the order ``refunded``."""
    order, listing = await _order(db, organisation_id, order_id, lock=True)
    if not _is_online_paid(order):
        raise EventsConflict(
            "Only paid online orders are refunded here; an outlet cash ticket is"
            " refunded from the event's refund screen"
        )
    if order.collected_minor <= 0 or order.collected_minor <= order.refunded_minor:
        raise EventsConflict("There is nothing left to refund on this order")
    refunded = await order_refunds.refund_order(
        db,
        organisation_id=organisation_id,
        order=order,
        actor=actor,
        reason=body.reason,
        amount_minor=body.amount_minor,
    )
    activity.record(
        db,
        actor_id=actor.id,
        action="order.refunded",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={"order_id": str(order.id), "amount_minor": refunded},
    )
    await db.flush()
    return await _detail(db, organisation_id, order, listing)


async def cancel_order(
    db: AsyncSession,
    organisation_id: str,
    actor: User,
    order_id: uuid.UUID,
    body: schemas.OrgOrderCancel,
) -> schemas.OrgOrderCancelResult:
    """The organiser cancels one order: its tickets stop working, the seats go
    back on sale and the refund choice decides the money.

    A failed refund aborts the cancel (nothing is saved), so a retry is safe."""
    now = utc_now()
    order, listing = await _order(db, organisation_id, order_id, lock=True)
    if order.status in ("expired", "refunded"):
        raise EventsConflict(f"This order is already {order.status}")
    issued = await db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.order_id == order.id)
    )
    live = await db.scalar(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.order_id == order.id, Ticket.status == "valid")
    )
    if order.status == "confirmed" and issued and not live:
        raise EventsConflict("This order is already cancelled")
    outcome: Literal["refunded", "kept", "not_due"] = "not_due"
    if order.status == order_fulfilment.PENDING:
        unpaid = await order_payments.stop_collecting(
            db, organisation_id=organisation_id, order_id=order.id
        )
        if not unpaid:
            raise EventsConflict("This order was just paid; try again")
        order.status = "expired"  # the hold is released; nothing was paid
    else:
        admitted = await db.scalar(
            select(func.count())
            .select_from(Admission)
            .join(Ticket, Ticket.id == Admission.ticket_id)
            .where(Ticket.order_id == order.id)
        )
        if admitted:
            raise EventsConflict("A ticket on this order was already used at the door")
        if (
            order.payment_method == "cash_outlet"
            and order.collected_minor > 0
            and body.refund != "none"
        ):
            raise EventsConflict(
                "Cash taken at the outlet is handed back by hand: refund each"
                " ticket from the event's refund screen, or cancel with refund"
                " set to none"
            )
        await db.execute(
            update(Ticket)
            .where(Ticket.order_id == order.id, Ticket.status == "valid")
            .values(status="cancelled", cancelled_at=now)
        )
        refundable = (
            order.collected_minor - order.refunded_minor
            if _is_online_paid(order)
            else 0
        )
        if refundable > 0:
            if order_refunds.should_refund(
                body.refund,
                event_cancelled=listing.status == "cancelled",
                starts_at=listing.starts_at,
                now=now,
            ):
                await order_refunds.refund_order(
                    db,
                    organisation_id=organisation_id,
                    order=order,
                    actor=actor,
                    reason=(body.reason or "Order cancelled by the organiser")[:500],
                )
                outcome = "refunded"
            else:
                outcome = "kept"
    activity.record(
        db,
        actor_id=actor.id,
        action="order.cancelled",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={"order_id": str(order.id), "refund": outcome, "choice": body.refund},
    )
    await db.flush()
    detail = await _detail(db, organisation_id, order, listing)
    return schemas.OrgOrderCancelResult(
        order=detail,
        refund_outcome=outcome,
    )
