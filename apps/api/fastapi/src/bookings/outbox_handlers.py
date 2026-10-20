"""Outbox topics owned by bookings (ADR-0026).

``bookings.deposit_paid`` is enqueued by payments, in the transaction that
records a ``bookings.deposit`` charge. Payload: ``source_id`` (the booking id) and
``intent_id``. The handler only writes to the main database, so it runs once;
``deposits.confirm_paid`` is idempotent anyway.

Import this module (the worker does at startup) to register the handler.
"""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

from . import deposit_payments, deposits

logger = logging.getLogger(__name__)


@outbox.handler(deposit_payments.PAID_TOPIC)
async def deposit_paid(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    if message.organisation_id is None:
        logger.warning("deposit_paid message without an organisation; dropped")
        return
    try:
        booking_id = uuid.UUID(str(message.payload.get("source_id")))
    except ValueError:
        logger.warning("deposit_paid message with a bad booking id; dropped")
        return
    await deposits.confirm_paid(
        session, organisation_id=message.organisation_id, booking_id=booking_id
    )
