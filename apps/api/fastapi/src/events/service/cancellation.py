"""Organiser cancel, postpone and manual refund (E5).

Cancelling a published event takes the exclusive lock on the listing row (claims
and outlet sales hold a shared lock on it), marks the event cancelled, cancels
every valid ticket and queues one ``listing.cancelled`` outbox row; the drain
notifies going, saved and ticket-holding members. Postponing keeps every ticket
valid, moves the times and queues ``listing.postponed``.

Refunds are manual records, not payment movements: an organiser hands cash or
makes a bank transfer and records it here. Only outlet cash tickets can be
refunded (online tickets are free). A refund moves the ticket to ``refunded``
(so it cannot be admitted and its seat is released), stores who, when, how much
and a reference, and writes an activity row. A cash refund is linked to the
refunding staff member's open till so settlement subtracts it from expected cash.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import activity, outbox, schemas
from ..exceptions import EventsConflict, EventsNotFound
from ..models import Admission, Listing, Order, OrderItem, Organiser, Refund, Ticket
from . import event_cancel
from .admission import _door_listing
from .common import _naive_utc
from .outlet import _my_till, money, refund_views


async def _locked_listing(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None,
) -> Listing:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    await db.refresh(listing, with_for_update=True)
    return listing


async def cancel_event(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None = None,
    *,
    refund: str,
) -> schemas.CancelResult:
    listing = await _locked_listing(db, user, listing_id, org_ids, slug)
    return await cancel_locked_event(db, user, listing, refund)


async def cancel_event_for_organisation(
    db: AsyncSession,
    user: User,
    organisation_id: str,
    listing_id: uuid.UUID,
    refund: str,
) -> schemas.CancelResult:
    """Org-zone cancel: the event must belong to the organiser of ``organisation_id``."""
    listing = await db.scalar(
        select(Listing)
        .join(Organiser, Organiser.id == Listing.organiser_id)
        .where(Listing.id == listing_id, Organiser.organisation_id == organisation_id)
    )
    if listing is None:
        raise EventsNotFound("Event not found")
    await db.refresh(listing, with_for_update=True)
    return await cancel_locked_event(db, user, listing, refund)


async def cancel_locked_event(
    db: AsyncSession, user: User, listing: Listing, refund: str
) -> schemas.CancelResult:
    now = utc_now()
    if listing.status != "published":
        raise EventsConflict("Only a published event can be cancelled")
    listing.status = "cancelled"
    listing.updated_at = utc_now()
    settled = await event_cancel.cancel_event_orders(db, user, listing, refund, now)
    cancelled = settled.tickets_cancelled
    key = str(listing.id)
    await outbox.enqueue(
        db,
        kind=outbox.CANCELLED,
        entity_type="listing",
        entity_id=key,
        dedupe_key=f"listing.cancelled:{key}",
        payload={
            "actor_id": str(user.id),
            "starts_at": listing.starts_at.isoformat(),
        },
    )
    activity.record(
        db,
        actor_id=user.id,
        action="listing.cancelled",
        entity_type="listing",
        entity_id=key,
        organiser_id=listing.organiser_id,
        summary={
            "changed": ["status"],
            "from": {"status": "published"},
            "to": {"status": "cancelled"},
            "tickets_cancelled": cancelled,
            "refund": refund,
            "orders_refunded": settled.refunded,
            "orders_queued": settled.queued,
            "refunds_failed": settled.failed,
            "orders_pending": settled.pending,
        },
    )
    await db.commit()
    return schemas.CancelResult(
        listing_id=listing.id,
        status="cancelled",
        tickets_cancelled=cancelled,
        orders_refunded=settled.refunded,
        orders_queued=settled.queued,
        orders_kept=settled.kept,
        refunds_failed=settled.failed,
        orders_released=settled.released,
        orders_pending=settled.pending,
    )


async def postpone_event(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    body: schemas.PostponeEvent,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.PostponeResult:
    listing = await _locked_listing(db, user, listing_id, org_ids, slug)
    if listing.status != "published":
        raise EventsConflict("Only a published event can be postponed")
    starts, ends = _naive_utc(body.starts_at), _naive_utc(body.ends_at)
    if ends <= starts:
        raise EventsConflict("End time must be after the start time")
    if starts <= _naive_utc(utc_now()):
        raise EventsConflict("The new start must be in the future")
    if starts == listing.starts_at:
        raise EventsConflict("The event already starts at that time")
    before = {
        "starts_at": listing.starts_at.isoformat(),
        "ends_at": listing.ends_at.isoformat(),
    }
    listing.starts_at = starts
    listing.ends_at = ends
    listing.updated_at = utc_now()
    after = {"starts_at": starts.isoformat(), "ends_at": ends.isoformat()}
    key = str(listing.id)
    await outbox.enqueue(
        db,
        kind=outbox.POSTPONED,
        entity_type="listing",
        entity_id=key,
        dedupe_key=f"listing.postponed:{key}:{after['starts_at']}",
        payload={"actor_id": str(user.id), "starts_at": after["starts_at"]},
    )
    activity.record(
        db,
        actor_id=user.id,
        action="listing.rescheduled",
        entity_type="listing",
        entity_id=key,
        organiser_id=listing.organiser_id,
        summary=activity.diff(before, after),
    )
    await db.commit()
    return schemas.PostponeResult(
        listing_id=listing.id, starts_at=listing.starts_at, ends_at=listing.ends_at
    )


async def refund_ticket(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    ticket_id: uuid.UUID,
    body: schemas.RefundCreate,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.RefundPublic:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    ticket = await db.scalar(
        select(Ticket)
        .where(Ticket.id == ticket_id, Ticket.listing_id == listing.id)
        .with_for_update()
    )
    if ticket is None:
        raise EventsNotFound("Ticket not found")
    order = await db.get(Order, ticket.order_id)
    assert order is not None
    if order.payment_method != "cash_outlet":
        raise EventsConflict(
            "Only outlet cash tickets can be refunded here; refund an online"
            " payment from the payments page"
        )
    if ticket.status == "refunded":
        raise EventsConflict("This ticket was already refunded")
    event_cancelled = listing.status == "cancelled"
    if ticket.status == "cancelled" and not event_cancelled:
        raise EventsConflict("This ticket was cancelled and has nothing to refund")
    admitted = await db.scalar(
        select(Admission.id).where(Admission.ticket_id == ticket.id)
    )
    if admitted is not None and not event_cancelled:
        raise EventsConflict("This ticket was already used at the door")
    price = await db.scalar(
        select(OrderItem.unit_price_minor).where(
            OrderItem.order_id == order.id, OrderItem.tier_id == ticket.tier_id
        )
    )
    if not price:
        raise EventsConflict("This ticket was free; there is nothing to refund")
    if body.amount_minor > price:
        raise EventsConflict(f"A refund can't exceed the ticket price ({money(price)})")
    reference = (body.reference or "").strip() or None
    if body.method == "bank" and reference is None:
        raise EventsConflict("Enter the bank transfer reference")
    till = await _my_till(db, listing, user) if body.method == "cash" else None
    refund = Refund(
        listing_id=listing.id,
        order_id=order.id,
        ticket_id=ticket.id,
        amount_minor=body.amount_minor,
        method=body.method,
        reference=reference,
        refunded_by=user.id,
        till_session_id=till.id if till and till.closed_at is None else None,
    )
    db.add(refund)
    ticket.status = "refunded"
    if ticket.cancelled_at is None:
        ticket.cancelled_at = utc_now()
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise EventsConflict("This ticket was already refunded") from None
    activity.record(
        db,
        actor_id=user.id,
        action="ticket.refunded",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={
            "ticket_id": str(ticket.id),
            "order_id": str(order.id),
            "amount_minor": body.amount_minor,
            "method": body.method,
        },
    )
    await db.commit()
    return (await refund_views(db, [refund]))[0]
