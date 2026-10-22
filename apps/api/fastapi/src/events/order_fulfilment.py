"""What happens to a paid-tier order when money moves (N4b, ADR-0003, ADR-0027).

Three reactions, each safe to run more than once:

- ``fulfil_paid`` (outbox topic ``events.order_paid``): issue the tickets, move the
  order to ``confirmed`` and queue the receipt. A payment that arrives after the
  hold expired, or for an event that is no longer on sale, is refunded in full and
  issues nothing.
- ``apply_refund`` (outbox topic ``events.order_refunded``): mirror the ledger onto
  the order and, once everything is refunded, mark the tickets ``refunded``.
- ``expire_unpaid`` (ARQ job ``expire_unpaid_event_orders``): cancel orders still
  unpaid past their hold and release the stock.

One database, one transaction (ADR-0003). The outbox handlers run on the
platform session and the outbox row commits with their writes, so a reaction saves
the order, tickets, queued receipt and refund together or not at all. The order row
lock plus its status make a replay idempotent; the receipt and the refund carry
their own idempotency keys too. ``expire_unpaid`` (an ARQ job) commits once per
order.
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.notifications.config import notification_settings
from src.notifications.outbox_handlers import enqueue_email
from src.payments.models import ProviderKey, Refund
from src.utils.datetime import utc_now

from . import emails, order_payments, rewards_hook, tickets
from .models import Listing, Order, OrderItem, Organiser, Ticket

logger = logging.getLogger(__name__)

PENDING = "pending_payment"
EXPIRY_BATCH = 100


async def _locked_order(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def lock_order(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    """Lock an order the way every Events money path does: the listing first (a
    shared lock, so claims and sales still run but an organiser's cancel waits),
    then the order. One order everywhere keeps cancel, payment and refund from
    deadlocking."""
    listing_id = await db.scalar(select(Order.listing_id).where(Order.id == order_id))
    if listing_id is None:
        return None
    await db.execute(
        select(Listing.id).where(Listing.id == listing_id).with_for_update(read=True)
    )
    return await _locked_order(db, order_id)


def _is_online_paid(order: Order) -> bool:
    return order.channel == "online" and order.payment_method == "online"


async def _organisation_id(db: AsyncSession, order: Order) -> str | None:
    return await db.scalar(
        select(Organiser.organisation_id)
        .join(Listing, Listing.organiser_id == Organiser.id)
        .where(Listing.id == order.listing_id)
    )


async def _mirror_ledger(
    db: AsyncSession, order: Order, organisation_id: str, now: datetime
) -> None:
    """Copy what the ledger holds onto the order (absolute, so a replay is a no-op)."""
    intent = await order_payments.intent_for(
        db, organisation_id=organisation_id, order_id=order.id
    )
    if intent is None:
        return
    order.collected_minor = intent.captured_minor
    order.refunded_minor = intent.refunded_minor
    if intent.captured_minor > 0 and order.paid_at is None:
        order.paid_at = now


async def _issue_tickets(db: AsyncSession, order: Order, listing: Listing) -> int:
    """Create the order's tickets once. Returns how many exist afterwards."""
    existing = await db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.order_id == order.id)
    )
    if existing:
        return int(existing)
    items = list(
        await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))
    )
    issued = [
        Ticket(
            order_id=order.id,
            listing_id=listing.id,
            tier_id=item.tier_id,
            user_id=order.user_id,
            code=tickets.new_code(),
        )
        for item in items
        for _ in range(item.quantity)
    ]
    db.add_all(issued)
    await db.flush()
    return len(issued)


async def _queue_receipt(
    db: AsyncSession,
    order: Order,
    listing: Listing,
    organisation_id: str,
    count: int,
) -> None:
    """Email the buyer through the platform outbox (deduplicated per order)."""
    if order.user_id is None:
        return
    buyer = await db.get(User, order.user_id)
    if buyer is None or not buyer.email:
        return
    subject, body = emails.order_confirmation(
        buyer_name=buyer.first_name,
        title=listing.title,
        starts_at=listing.starts_at,
        ticket_count=count,
        total_minor=order.total_minor,
        currency=order.currency,
    )
    await enqueue_email(
        db,
        to_email=buyer.email,
        subject=subject,
        html=body,
        transactional=True,
        dedupe_key=f"events-order-paid:{order.id}",
        organisation_id=organisation_id,
    )


async def fulfil_paid(
    db: AsyncSession,
    *,
    organisation_id: str,
    order_id: uuid.UUID,
    intent_id: uuid.UUID,
) -> str:
    """The order's payment was captured. Returns ``confirmed``, ``duplicate``,
    ``refunded`` or ``ignored``."""
    now = utc_now()
    order = await lock_order(db, order_id)
    if order is None or not _is_online_paid(order):
        logger.warning("event order paid for an unknown order")
        return "ignored"
    if order.payment_intent_id not in (None, intent_id):
        logger.warning("event order paid by an intent it does not own")
        return "ignored"
    order.payment_intent_id = intent_id
    # A shared lock on the listing orders this against an organiser cancelling.
    listing = await db.scalar(
        select(Listing).where(Listing.id == order.listing_id).with_for_update(read=True)
    )
    assert listing is not None
    selling = listing.status == "published" and listing.ends_at > now

    outcome = "duplicate"
    if order.status == PENDING and selling:
        order.status = "confirmed"
        outcome = "confirmed"
    elif order.status == "expired" or (order.status == PENDING and not selling):
        # Expired before the money arrived, or the event is off sale: give it back.
        await order_payments.refund_in_full(
            db,
            organisation_id=organisation_id,
            order_id=order.id,
            reason="Order was not completed before payment arrived",
        )
        order.status = "expired"
        outcome = "refunded"

    await _mirror_ledger(db, order, organisation_id, now)
    if order.status == "confirmed":
        # Tickets are created once (guarded by the order lock and a count). The
        # receipt is queued on every replay too: it is deduplicated, and an
        # earlier attempt may have lost it when the main transaction rolled back.
        count = await _issue_tickets(db, order, listing)
        await _queue_receipt(db, order, listing, organisation_id, count)
    return outcome


async def _queue_refund_receipt(
    db: AsyncSession,
    order: Order,
    organisation_id: str,
    intent_id: uuid.UUID,
    intent_provider: str,
    refund_id: uuid.UUID,
    *,
    full: bool,
) -> None:
    """Email the buyer one receipt per refund. The dedupe key is the refund id, so
    the inline manual path and the ``events.order_refunded`` reaction (and any
    replay) queue it once. Skipped when the refund is unknown to the order's intent
    or the buyer has no deliverable email."""
    if order.user_id is None:
        return
    refund = await db.get(Refund, refund_id)
    if refund is None or refund.intent_id != intent_id:
        return
    buyer = await db.get(User, order.user_id)
    listing = await db.get(Listing, order.listing_id)
    if (
        buyer is None
        or listing is None
        or not buyer.email
        or not notification_settings.email_allowed(buyer.email)
    ):
        return
    subject, body = emails.order_refunded(
        buyer_name=buyer.first_name,
        title=listing.title,
        order_ref=str(order.id)[:8].upper(),
        refund_minor=refund.amount_minor,
        currency=order.currency,
        full=full,
        card=intent_provider != ProviderKey.MANUAL,
        event_cancelled=listing.status == "cancelled",
    )
    await enqueue_email(
        db,
        to_email=buyer.email,
        subject=subject,
        html=body,
        transactional=True,
        dedupe_key=f"events-order-refunded:{refund_id}",
        organisation_id=organisation_id,
    )


async def apply_refund(
    db: AsyncSession,
    *,
    organisation_id: str,
    order_id: uuid.UUID,
    refund_id: uuid.UUID | None = None,
) -> str:
    """A refund was recorded on the order's intent. Returns ``refunded`` (tickets
    cancelled), ``partial``, ``duplicate`` or ``ignored``.

    With ``refund_id`` the buyer also gets that refund's receipt email (queued on
    every replay, deduplicated by the refund id)."""
    now = utc_now()
    order = await _locked_order(db, order_id)
    if order is None or not _is_online_paid(order):
        logger.warning("event order refunded for an unknown order")
        return "ignored"
    intent = await order_payments.intent_for(
        db, organisation_id=organisation_id, order_id=order.id
    )
    if intent is None:
        return "ignored"
    order.collected_minor = intent.captured_minor
    order.refunded_minor = intent.refunded_minor
    outcome = "partial"
    if intent.captured_minor > 0 and intent.refunded_minor >= intent.captured_minor:
        released = await db.execute(
            update(Ticket)
            .where(Ticket.order_id == order.id, Ticket.status == "valid")
            .values(status="refunded", cancelled_at=now)
            .returning(Ticket.id)
        )
        refunded_ids = list(released.scalars())
        outcome = "refunded" if refunded_ids else "duplicate"
        await rewards_hook.reverse_for_tickets(db, refunded_ids)
        if order.status == "confirmed":
            order.status = "refunded"
    if refund_id is not None:
        await _queue_refund_receipt(
            db,
            order,
            organisation_id,
            intent.id,
            intent.provider,
            refund_id,
            full=outcome != "partial",
        )
    return outcome


async def expire_unpaid(
    db: AsyncSession,
    *,
    now: datetime | None = None,
    limit: int = EXPIRY_BATCH,
) -> int:
    """Cancel orders still ``pending_payment`` past their hold, cancel the open
    intent and release the stock. Returns how many were expired.

    A payment that just succeeded is skipped (``events.order_paid`` issues the
    tickets). Each order is one transaction: the intent is cancelled and the order
    expired together."""
    moment = now or utc_now()
    skipped: list[uuid.UUID] = []
    expired = 0
    for _ in range(limit):
        order = await db.scalar(
            select(Order)
            .where(
                Order.status == PENDING,
                Order.payment_expires_at <= moment,
                Order.id.not_in(skipped),
            )
            .order_by(Order.payment_expires_at, Order.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if order is None:
            break
        organisation_id = await _organisation_id(db, order)
        if organisation_id is not None:
            unpaid = await order_payments.stop_collecting(
                db, organisation_id=organisation_id, order_id=order.id
            )
            if not unpaid:
                skipped.append(order.id)
                await db.rollback()
                continue
        order.status = "expired"
        await db.commit()
        expired += 1
    return expired
