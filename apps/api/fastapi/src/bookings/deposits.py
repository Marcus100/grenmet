"""Booking reactions to deposit money (B6): payment received, hold expired.

``confirm_paid`` runs from the ``bookings.deposit_paid`` outbox topic that
payments enqueues in the transaction that records the charge. ``expire_unpaid``
is the ARQ job ``expire_unpaid_bookings``. Both are idempotent and leave commits
to their caller.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import (
    ColumnElement,
    Integer,
    String,
    case,
    cast,
    exists,
    func,
    literal,
    literal_column,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments.models import Intent, ProviderKey
from src.utils.datetime import utc_now

from . import deposit_payments, emails, lifecycle, public
from .config import bookings_settings
from .exceptions import BookingNotFoundError
from .models import Booking, BookingDepositCollection, BookingProfile, BookingStatus

logger = logging.getLogger(__name__)

#: One minute as a Postgres interval, so the hold is computed in the database.
_ONE_MINUTE: ColumnElement[timedelta] = literal_column("interval '1 minute'")

EXPIRY_BATCH = 100


async def confirm_paid(
    session: AsyncSession, *, organisation_id: str, booking_id: uuid.UUID
) -> str:
    """A deposit was captured: move ``pending_payment`` to ``confirmed`` and queue
    the emails. Returns ``confirmed``, ``pending``, ``refunded`` or ``ignored``.

    A request paid after the business accepted it (``pay_after_acceptance``) is
    confirmed: the acceptance already happened. ``pending`` is only for a booking
    made before requests were paid after acceptance, which was paid first and
    still waits for the business to confirm it by hand.

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
    if status is BookingStatus.PENDING and booking.pay_after_acceptance:
        # Paid before the business accepted (staff recorded it by hand): nothing
        # is left to ask for on acceptance, so accepting confirms it directly.
        booking.pay_after_acceptance = False
        await session.flush()
        return "ignored"
    if status is not BookingStatus.PENDING_PAYMENT:
        return "ignored"
    if booking.pay_after_acceptance:
        return await _confirm_accepted(session, managed)
    target = (
        BookingStatus.PENDING
        if profile.requires_confirmation
        else BookingStatus.CONFIRMED
    )
    await public.transition(
        session,
        booking,
        target,
        note=f"{deposit_payments.payment_noun(booking)} paid",
    )
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


async def _confirm_accepted(session: AsyncSession, managed: public.Managed) -> str:
    """The customer paid a request the business had accepted: it is confirmed.
    The request and its acceptance were mailed already, so these mails have keys
    of their own (the booking's ``booking-confirmation`` key is used)."""
    booking = managed.booking
    await public.transition(
        session,
        booking,
        BookingStatus.CONFIRMED,
        note=f"{deposit_payments.payment_noun(booking)} paid",
    )
    mail = public.build_mail(managed)
    await public.queue_customer_email(
        session,
        managed,
        emails.customer_confirmed(mail, paid=True),
        f"booking-confirmed:{booking.id}",
    )
    await public.queue_studio_email(
        session,
        managed,
        emails.studio_notice(mail, event="paid"),
        f"booking-studio-paid:{booking.id}",
    )
    await session.flush()
    return BookingStatus.CONFIRMED.value


async def _tell_lapsed(session: AsyncSession, booking: Booking) -> None:
    """An accepted request was not paid in time. Its customer was told it was
    accepted and the business accepted it, so both are told it lapsed. (A checkout
    abandoned at booking mails nobody: nobody was ever told about that booking.)"""
    managed = await public.load_by_id(session, booking.id, booking.organisation_id)
    mail = public.build_mail(managed)
    await public.queue_customer_email(
        session,
        managed,
        emails.customer_payment_lapsed(mail, lifecycle.book_again_url(managed.profile)),
        f"booking-payment-lapsed:{booking.id}",
    )
    await public.queue_studio_email(
        session,
        managed,
        emails.studio_notice(mail, event="unpaid"),
        f"booking-studio-unpaid:{booking.id}",
    )


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
    # Each booking's own hold, computed in SQL: the business's ``deposit_hold_minutes``
    # (null = the default), capped at the online limit when its deposit intent is a
    # Stripe checkout. ``hold_minutes`` overrides every booking (tests).
    hold: ColumnElement[int]
    if hold_minutes is not None:
        hold = literal(hold_minutes, Integer)
    else:
        online = exists().where(
            Intent.source_type == deposit_payments.SOURCE_TYPE,
            Intent.source_id == cast(Booking.id, String),
            Intent.provider == ProviderKey.STRIPE.value,
        )
        profile_hold = func.coalesce(
            BookingProfile.deposit_hold_minutes,
            bookings_settings.DEPOSIT_HOLD_MINUTES,
        )
        # The snapshot taken at creation wins; a booking with none (made before it
        # existed) uses the profile's value now.
        fallback = case(
            (
                online,
                func.least(profile_hold, deposit_payments.ONLINE_HOLD_CAP_MINUTES),
            ),
            else_=profile_hold,
        )
        hold = func.coalesce(Booking.hold_minutes, fallback)
    # The same clock as ``deposit_payments.hold_started_at``: a request paid after
    # acceptance is held from the acceptance, every other booking from its creation.
    hold_started = case(
        (
            Booking.pay_after_acceptance.is_(True),
            func.coalesce(Booking.accepted_at, Booking.created_at),
        ),
        else_=Booking.created_at,
    )
    query = (
        select(Booking)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .where(
            Booking.status == BookingStatus.PENDING_PAYMENT.value,
            # Business-collected deposits are never held (same rule as the read
            # side). A request accepted for an online payment is, whatever the
            # profile collects now: the booking decides, not a later setting.
            or_(
                Booking.pay_after_acceptance.is_(True),
                BookingProfile.deposit_collection
                != BookingDepositCollection.BUSINESS.value,
            ),
            hold_started + hold * _ONE_MINUTE <= moment,
        )
        .order_by(hold_started, Booking.id)
        .limit(limit)
        .with_for_update(skip_locked=True, of=Booking)
    )
    if organisation_id is not None:
        query = query.where(Booking.organisation_id == organisation_id)
    due = (await session.scalars(query)).all()
    cancelled = 0
    for booking in due:
        unpaid = await deposit_payments.cancel_unpaid_deposit(session, booking)
        if not unpaid:
            continue
        noun = deposit_payments.payment_noun(booking)
        booking.cancel_reason = f"{noun} not paid in time"
        await public.transition(
            session,
            booking,
            BookingStatus.CANCELLED,
            note=f"{noun} not paid in time; slot released",
            now=moment,
        )
        await public.emit_webhook(
            session,
            booking,
            "booking.cancelled",
            event_id=f"booking.cancelled:{booking.id}",
        )
        if booking.pay_after_acceptance:
            await _tell_lapsed(session, booking)
        cancelled += 1
    await session.flush()
    return cancelled
