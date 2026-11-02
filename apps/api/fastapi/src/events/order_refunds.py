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

Locking: every Events money path takes the listing lock (shared, or exclusive for
an event cancel), then the order lock, and only then touches that order's payments
intent or tickets. Intent and tickets are not always reached in the same order,
but both sit behind the order lock, which serialises the paths that matter. The one
lock taken across that order is the outbox row of a queued refund, and only NOWAIT:
the outbox holds that row while it sends to the provider, so a request that finds
it busy answers 409 instead of waiting behind the provider call.
"""

import uuid
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User
from src.payments import exceptions as payments_exceptions
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.models import ProviderKey
from src.utils.datetime import utc_now

from . import order_fulfilment, order_payments
from .config import events_settings
from .exceptions import EventsConflict
from .models import Order

REQUESTED_TOPIC = "events.order_refund_requested"
CANCEL_KEY = "cancel"

#: Postgres ``lock_not_available`` (a NOWAIT lock that another transaction holds).
_LOCK_NOT_AVAILABLE = "55P03"

RefundResult = Literal["refunded", "queued", "none"]
ReasonCode = Literal["event_cancelled", "order_cancelled", "organiser_refund"]

#: What the payments ledger says for a queued refund. The outbox payload carries
#: only the code, never the organiser's free text.
_REASONS: dict[str, str] = {
    "event_cancelled": "Event cancelled by the organiser",
    "order_cancelled": "Order cancelled by the organiser",
    "organiser_refund": "Refund issued by the organiser",
}


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


class RefundAlreadyPending(EventsConflict):
    """Another refund of this order is still waiting for the payment provider."""


def _lock_not_available(error: DBAPIError) -> bool:
    code = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
    return code == _LOCK_NOT_AVAILABLE


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
    reason_code: ReasonCode,
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
    left = intent.captured_minor - intent.refunded_minor
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
    # One provider refund at a time per order: a second request (another amount
    # or key) would race the first one's remaining amount.
    waiting = await db.scalar(
        select(outbox.Outbox.id)
        .where(
            outbox.pending_for_order(REQUESTED_TOPIC, str(order.id)),
            outbox.Outbox.dedupe_key != str(refund_id),
        )
        .limit(1)
    )
    if waiting is not None:
        raise RefundAlreadyPending(
            "A refund for this order is already waiting for the payment provider"
        )
    if amount_minor is not None and amount_minor > left:
        raise EventsConflict(f"Only {left} minor units can still be refunded")
    payload = {
        "order_id": str(order.id),
        "intent_id": str(intent.id),
        "refund_id": str(refund_id),
        "actor_id": str(actor.id),
        "reason_code": reason_code,
        # Fixed now, so the provider never sees another amount under this refund id.
        "amount_minor": amount_minor if amount_minor is not None else left,
    }
    added = await outbox.enqueue(
        db,
        topic=REQUESTED_TOPIC,
        payload=payload,
        dedupe_key=str(refund_id),
        organisation_id=organisation_id,
    )
    if added:
        return "queued", 0
    # The same request is already on the outbox: report what it is really doing.
    # The outbox holds this row while it sends to the provider, so never wait for
    # it here (we hold the order lock): a send in progress answers 409 and the
    # caller tries again.
    try:
        async with db.begin_nested():
            row = await db.scalar(
                select(outbox.Outbox)
                .where(
                    outbox.Outbox.topic == REQUESTED_TOPIC,
                    outbox.Outbox.dedupe_key == str(refund_id),
                )
                .with_for_update(nowait=True)
                .execution_options(populate_existing=True)
            )
    except DBAPIError as error:
        if not _lock_not_available(error):
            raise
        raise EventsConflict(
            "This refund is being sent to the payment provider; try again in a moment"
        ) from None
    if row is None or row.status == outbox.OutboxStatus.DONE.value:
        return "none", 0
    if row.status == outbox.OutboxStatus.DEAD.value:
        # Re-arm a refund the outbox gave up on, so a re-cancel retries it. The amount
        # stays the one fixed when it was requested: the provider's idempotency key is
        # bound to it, so another amount under this refund id would be refused.
        row.status = outbox.OutboxStatus.PENDING.value
        row.attempts = 0
        row.next_attempt_at = utc_now()
        row.last_error = None
    return "queued", 0


async def perform_requested(
    db: AsyncSession,
    *,
    organisation_id: str,
    order_id: uuid.UUID,
    intent_id: uuid.UUID,
    refund_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    reason_code: str,
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
    if amount_minor is not None and amount_minor > left:
        # Money moved elsewhere meanwhile. Sending another amount under the same
        # provider idempotency key is unsafe: fail so the outbox dead-letters it.
        raise EventsConflict("The refundable amount changed; refund again by hand")
    actor = await db.get(User, actor_id) if actor_id else None
    try:
        await _refund_now(
            db,
            organisation_id=organisation_id,
            order=order,
            intent_id=intent.id,
            actor=actor,
            reason=_REASONS.get(reason_code, _REASONS["organiser_refund"]),
            amount_minor=amount_minor,
            refund_id=refund_id,
        )
    except payments_exceptions.RefundFailedAtProvider as error:
        # Terminal: the provider's refund under this id failed and Stripe replays
        # that answer. Dead-letter now; the organiser refunds again with a new key.
        raise outbox.TerminalFailure(
            "the provider refund under this id failed; refund again"
        ) from error
    return "refunded"
