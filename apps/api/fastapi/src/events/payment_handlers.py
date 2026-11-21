"""Outbox topics Events consumes from payments (ADR-0026, N4b).

``events.order_paid`` and ``events.order_refunded`` are enqueued by payments, in the
transaction that records the charge or the refund. Payload: ``source_id`` (the
order id) and ``intent_id``. The handler runs on the outbox session, so the order,
tickets and queued receipt commit with the outbox row (``order_fulfilment``).

Import this module (the worker does at startup and in ``drain_outbox``) to
register the handlers.
"""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

from . import order_fulfilment, order_payments, order_refunds

logger = logging.getLogger(__name__)


def _ids(message: outbox.OutboxMessage) -> tuple[str, uuid.UUID] | None:
    if message.organisation_id is None:
        logger.warning("event order message without an organisation; dropped")
        return None
    try:
        return message.organisation_id, uuid.UUID(str(message.payload.get("source_id")))
    except ValueError:
        logger.warning("event order message with a bad order id; dropped")
        return None


@outbox.handler(order_payments.PAID_TOPIC)
async def order_paid(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    ids = _ids(message)
    if ids is None:
        return
    try:
        intent_id = uuid.UUID(str(message.payload.get("intent_id")))
    except ValueError:
        logger.warning("event order paid message with a bad intent id; dropped")
        return
    await order_fulfilment.fulfil_paid(
        session, organisation_id=ids[0], order_id=ids[1], intent_id=intent_id
    )


@outbox.handler(order_payments.REFUNDED_TOPIC)
async def order_refunded(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    ids = _ids(message)
    if ids is None:
        return
    try:
        refund_id = uuid.UUID(str(message.payload.get("refund_id")))
    except ValueError:
        refund_id = None  # no receipt without a refund to describe
    await order_fulfilment.apply_refund(
        session, organisation_id=ids[0], order_id=ids[1], refund_id=refund_id
    )


@outbox.handler(order_refunds.REQUESTED_TOPIC)
async def order_refund_requested(
    session: AsyncSession, message: outbox.OutboxMessage
) -> None:
    """An organiser's refund for a provider-rail order (never sent under request
    locks). Errors propagate: the outbox retries, then dead-letters."""
    if message.organisation_id is None:
        logger.warning("event order refund message without an organisation; dropped")
        return
    payload = message.payload
    try:
        order_id = uuid.UUID(str(payload["order_id"]))
        intent_id = uuid.UUID(str(payload["intent_id"]))
        refund_id = uuid.UUID(str(payload["refund_id"]))
        actor = payload.get("actor_id")
        actor_id = uuid.UUID(str(actor)) if actor else None
        amount = payload.get("amount_minor")
        amount_minor = int(amount) if amount is not None else None
        reason_code = str(payload["reason_code"])
    except KeyError, ValueError, TypeError:
        logger.warning("event order refund message with a bad payload; dropped")
        return
    await order_refunds.perform_requested(
        session,
        organisation_id=message.organisation_id,
        order_id=order_id,
        intent_id=intent_id,
        refund_id=refund_id,
        actor_id=actor_id,
        amount_minor=amount_minor,
        reason_code=reason_code,
    )
