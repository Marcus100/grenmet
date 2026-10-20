"""Outbox topics Events consumes from payments (ADR-0026, N4b).

``events.order_paid`` and ``events.order_refunded`` are enqueued by payments, in the
transaction that records the charge or the refund. Payload: ``source_id`` (the
order id) and ``intent_id``. The handler runs against the main database and opens
its own Events session; see ``order_fulfilment`` for how the two are kept
consistent without a distributed transaction.

Import this module (the worker does at startup and in ``drain_outbox``) to
register the handlers.
"""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

from . import database, order_fulfilment, order_payments

logger = logging.getLogger(__name__)


class EventsDatabaseUnavailableError(RuntimeError):
    """The Events database is not configured; the outbox retries the message."""


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
    events = database.create_session()
    if events is None:
        raise EventsDatabaseUnavailableError
    async with events:
        await order_fulfilment.fulfil_paid(
            session,
            events,
            organisation_id=ids[0],
            order_id=ids[1],
            intent_id=intent_id,
        )


@outbox.handler(order_payments.REFUNDED_TOPIC)
async def order_refunded(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    ids = _ids(message)
    if ids is None:
        return
    events = database.create_session()
    if events is None:
        raise EventsDatabaseUnavailableError
    async with events:
        await order_fulfilment.apply_refund(
            session, events, organisation_id=ids[0], order_id=ids[1]
        )
