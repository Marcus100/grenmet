"""Refund choices for organiser cancels and order refunds (money, ADR-0027).

``RefundChoice`` is ``full`` | ``none`` | ``follow_policy`` (the same three-way
meaning as the bookings studio cancel's ``refund_deposit`` true / false / left
out). The policy: an event the organiser cancels is refunded in full; a single
order is refunded when the event starts at least ``REFUND_CUTOFF_HOURS`` away.

Where the money moves:
- The manual rail (staff hand the money back) has no network, so it settles
  inline in the caller's transaction.
- Any provider rail (Stripe) is never called under request locks: ``request_refund``
  queues one ``events.order_refund_requested`` outbox message and the platform
  outbox performs it with retries and dead-lettering. The refund's id is derived
  from the order and the request key (``refund_id_for``), so a retry after a lost
  response reuses the same refund row and the same provider idempotency key and
  can never refund twice.

Lock order everywhere in Events money code: listing, then order, then the
payments intent, then tickets.
"""

import uuid
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.models import ProviderKey

from . import order_fulfilment, order_payments
from .config import events_settings
from .models import Order

REQUESTED_TOPIC = "events.order_refund_requested"
CANCEL_KEY = "cancel"

RefundResult = Literal["refunded", "queued", "none"]


def should_refund(
    choice: str, *, event_cancelled: bool, starts_at: datetime, now: datetime
) -> bool:
    if choice == "full":
        return True
    if choice == "none":
        return False
    if event_cancelled:
        return True
    return starts_at - now >= timedelta(hours=events_settings.REFUND_CUTOFF_HOURS)


def refund_id_for(order_id: uuid.UUID, key: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"events.order-refund:{order_id}:{key}")


async def _refund_now(
    db: AsyncSession,
    *,
    organisation_id: str,
    order: Order,
    intent_id: uuid.UUID,
    actor: User | None,
    reason: str,
    amount_minor: int | None,
    refund_id: uuid.UUID,
) -> int:
    refund = await payments_service.refund_intent(
        db,
        organisation_id=organisation_id,
        intent_id=intent_id,
        actor=actor,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=amount_minor, reason=reason
        ),
        refund_id=refund_id,
    )
    await order_fulfilment.apply_refund(
        db, organisation_id=organisation_id, order_id=order.id
    )
    return refund.amount_minor


async def request_refund(
    db: AsyncSession,
    *,
    organisation_id: str,
    order: Order,
    actor: User,
    reason: str,
    key: str,
    amount_minor: int | None = None,
) -> tuple[RefundResult, int]:
    """Refund ``amount_minor`` (default: all that is left) of an online order.

    Returns ``("refunded", minor units)`` when the money moved in this
    transaction (manual rail), ``("queued", 0)`` when a provider refund was
    handed to the outbox, ``("none", 0)`` when nothing is left. The caller holds
    the order lock. A payments error on the manual rail propagates."""
    intent = await order_payments.intent_for(
        db, organisation_id=organisation_id, order_id=order.id
    )
    if intent is None or intent.captured_minor - intent.refunded_minor <= 0:
        return "none", 0
    refund_id = refund_id_for(order.id, key)
    if intent.provider == ProviderKey.MANUAL:
        moved = await _refund_now(
            db,
            organisation_id=organisation_id,
            order=order,
            intent_id=intent.id,
            actor=actor,
            reason=reason,
            amount_minor=amount_minor,
            refund_id=refund_id,
        )
        return "refunded", moved
    await outbox.enqueue(
        db,
        topic=REQUESTED_TOPIC,
        payload={
            "order_id": str(order.id),
            "intent_id": str(intent.id),
            "refund_id": str(refund_id),
            "actor_id": str(actor.id),
            "reason": reason,
            "amount_minor": amount_minor,
        },
        dedupe_key=str(refund_id),
        organisation_id=organisation_id,
    )
    return "queued", 0


async def perform_requested(
    db: AsyncSession,
    *,
    organisation_id: str,
    order_id: uuid.UUID,
    intent_id: uuid.UUID,
    refund_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    reason: str,
    amount_minor: int | None,
) -> str:
    """Outbox side of ``request_refund``: send the refund to the provider.

    Safe to repeat: the same ``refund_id`` is returned as it is. A provider error
    propagates so the outbox retries (and finally dead-letters)."""
    order = await order_fulfilment.lock_order(db, order_id)
    if order is None:
        return "ignored"
    intent = await order_payments.intent_for(
        db, organisation_id=organisation_id, order_id=order.id
    )
    if intent is None or intent.id != intent_id:
        return "ignored"
    left = intent.captured_minor - intent.refunded_minor
    if left <= 0:
        return "duplicate"
    actor = await db.get(User, actor_id) if actor_id else None
    await _refund_now(
        db,
        organisation_id=organisation_id,
        order=order,
        intent_id=intent.id,
        actor=actor,
        reason=reason,
        amount_minor=min(amount_minor, left) if amount_minor is not None else None,
        refund_id=refund_id,
    )
    return "refunded"
