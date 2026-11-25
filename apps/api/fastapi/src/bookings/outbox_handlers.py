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
from .models import Booking

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
    booking = await session.get(Booking, booking_id)
    if booking is None or booking.organisation_id != message.organisation_id:
        logger.warning("deposit_paid for an unknown booking; dropped")
        return
    own = await deposit_payments.find_deposit(session, booking)
    if own is None or str(own.id) != str(message.payload.get("intent_id")):
        logger.warning(
            "deposit_paid for an intent that is not the booking's deposit; ignored",
            extra={"intent_id": str(message.payload.get("intent_id"))},
        )
        return
    await deposits.confirm_paid(
        session, organisation_id=message.organisation_id, booking_id=booking_id
    )


class DeferredRefundFailed(Exception):
    """A queued deposit refund failed this run; the outbox retries it."""


@outbox.handler(deposit_payments.REFUND_TOPIC)
async def deposit_refund(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    """Refund a declined booking's deposit after the cancel committed (slice 2 follow-up
    a). ``refund_deposit`` is idempotent per booking and intent, so a repeat run does
    nothing new; a refund it could not make is raised so the outbox retries it."""
    if message.organisation_id is None:
        logger.warning("deposit_refund message without an organisation; dropped")
        return
    try:
        booking_id = uuid.UUID(str(message.payload.get("booking_id")))
    except ValueError:
        logger.warning("deposit_refund message with a bad booking id; dropped")
        return
    booking = await session.get(Booking, booking_id)
    if booking is None or booking.organisation_id != message.organisation_id:
        logger.warning("deposit_refund for an unknown booking; dropped")
        return
    if not await deposit_payments.refund_deposit(
        session, booking, reason="Booking cancelled"
    ):
        # Raising rolls back and lets the outbox retry with backoff (dead after
        # ``outbox.MAX_ATTEMPTS``). Each run reconciles with the provider's refunds
        # before sending, so a retry cannot pay twice.
        raise DeferredRefundFailed(str(booking.id))
