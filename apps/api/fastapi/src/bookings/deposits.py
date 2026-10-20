"""Booking reactions to deposit money (B6): payment received, hold expired.

``confirm_paid`` runs from the ``bookings.deposit_paid`` outbox topic that
payments enqueues in the transaction that records the charge. ``expire_unpaid``
is the ARQ job ``expire_unpaid_bookings``. Both are idempotent and leave commits
to their caller.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments import service as payments_service
from src.utils.datetime import utc_now

from . import deposit_payments, emails, public
from .config import bookings_settings
from .exceptions import BookingNotFoundError
from .models import Booking, BookingStatus

logger = logging.getLogger(__name__)

EXPIRY_BATCH = 100


async def confirm_paid(
    session: AsyncSession, *, organisation_id: str, booking_id: uuid.UUID
) -> str:
    """A deposit was captured: move ``pending_payment`` to ``confirmed`` (or to
    ``pending`` when the business confirms requests by hand) and queue the
    emails. Returns ``confirmed``, ``pending``, ``refunded`` or ``ignored``.

    A replay finds the booking already moved and does nothing. A booking that
    was cancelled before the payment landed (late callback after the hold
    expired) gets the deposit refunded in full."""
    try:
        managed = await public.load_by_id(
            session, booking_id, organisation_id, lock=True
        )
    except BookingNotFoundError:
        logger.warning("deposit paid for an unknown booking")
        return "ignored"
    booking, profile = managed.booking, managed.profile
    status = BookingStatus(booking.status)
    if status is BookingStatus.CANCELLED:
        await deposit_payments.refund_deposit(
            session, booking, reason="Booking was cancelled before payment arrived"
        )
        return "refunded"
    if status is not BookingStatus.PENDING_PAYMENT:
        return "ignored"
    target = (
        BookingStatus.PENDING
        if profile.requires_confirmation
        else BookingStatus.CONFIRMED
    )
    await public.transition(session, booking, target, note="Deposit paid")
    mail = public.build_mail(managed)
    confirmed = target is BookingStatus.CONFIRMED
    await public.queue_customer_email(
        session,
        managed,
        emails.customer_received(mail, confirmed=confirmed),
        f"booking-confirmation:{booking.id}",
    )
    await public.queue_studio_email(
        session,
        managed,
        emails.studio_notice(mail, event="created" if confirmed else "requested"),
        f"booking-studio-created:{booking.id}",
    )
    await session.flush()
    return target.value


async def expire_unpaid(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    hold_minutes: int | None = None,
    limit: int = EXPIRY_BATCH,
    organisation_id: str | None = None,
) -> int:
    """Cancel ``pending_payment`` bookings older than the hold, cancelling their
    open intent and so releasing the slot. Returns how many were cancelled.

    A booking whose payment has just succeeded is skipped: the
    ``bookings.deposit_paid`` handler confirms it. Safe to repeat.
    ``organisation_id`` limits the run to one organisation (tests)."""
    moment = now or utc_now()
    hold = (
        bookings_settings.DEPOSIT_HOLD_MINUTES if hold_minutes is None else hold_minutes
    )
    query = (
        select(Booking)
        .where(
            Booking.status == BookingStatus.PENDING_PAYMENT.value,
            Booking.created_at <= moment - timedelta(minutes=hold),
        )
        .order_by(Booking.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    if organisation_id is not None:
        query = query.where(Booking.organisation_id == organisation_id)
    due = (await session.scalars(query)).all()
    cancelled = 0
    for booking in due:
        unpaid = await payments_service.cancel_open_intent(
            session,
            organisation_id=booking.organisation_id,
            source_type=deposit_payments.SOURCE_TYPE,
            source_id=str(booking.id),
        )
        if not unpaid:
            continue
        booking.cancel_reason = "Deposit not paid in time"
        await public.transition(
            session,
            booking,
            BookingStatus.CANCELLED,
            note="Deposit not paid in time; slot released",
            now=moment,
        )
        await public.emit_webhook(
            session,
            booking,
            "booking.cancelled",
            event_id=f"booking.cancelled:{booking.id}",
        )
        cancelled += 1
    await session.flush()
    return cancelled
