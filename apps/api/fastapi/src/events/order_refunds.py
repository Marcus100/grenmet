"""Refund choices for organiser cancels and order refunds (money, ADR-0027).

``RefundChoice`` is ``full`` | ``none`` | ``follow_policy`` (the same three-way
meaning as the bookings studio cancel's ``refund_deposit`` true / false / left
out). The policy: an event the organiser cancels is refunded in full; a single
order is refunded when the event starts at least ``REFUND_CUTOFF_HOURS`` away.

Money moves only through the payments core. The refund is applied to the order
inline (``order_fulfilment.apply_refund``) as well as by the outbox reaction, so
the response already shows the final order; the second run is a no-op.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service

from . import order_fulfilment, order_payments
from .config import events_settings
from .models import Order

logger = logging.getLogger(__name__)


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


async def refund_order(
    db: AsyncSession,
    *,
    organisation_id: str,
    order: Order,
    actor: User,
    reason: str,
    amount_minor: int | None = None,
) -> int:
    """Refund ``amount_minor`` (default: all that is left) of an online order.

    Returns the minor units handed back (0 when nothing was left). A payments
    error propagates; the caller decides whether that aborts its transaction."""
    intent = await order_payments.intent_for(
        db, organisation_id=organisation_id, order_id=order.id
    )
    if intent is None or intent.captured_minor - intent.refunded_minor <= 0:
        return 0
    refund = await payments_service.refund_intent(
        db,
        organisation_id=organisation_id,
        intent_id=intent.id,
        actor=actor,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=amount_minor, reason=reason
        ),
    )
    await order_fulfilment.apply_refund(
        db, organisation_id=organisation_id, order_id=order.id
    )
    return refund.amount_minor
