"""Booking hygiene (issue #1808): two sweeps the worker runs on the bookings.

``expire_stale_requests`` (job ``expire_pending_bookings``) cancels a booking request
(``pending``) the business did not confirm within the profile's
``pending_expiry_hours``, and every request whose start has passed. The customer is
emailed a short note with a link to book again. ``complete_finished_bookings`` (job
``complete_finished_bookings``) closes a confirmed booking that ended more than 48 hours
ago as ``completed``, recorded as the system's own move: no reward, no email, no webhook.

Both are idempotent: rows are locked (``SKIP LOCKED``) and each move goes through
``public.transition``, which refuses a move the state machine forbids. A confirm that
races an expiry is serialised by the booking's row lock: whichever commits first wins,
and the other finds the new status (a confirm then answers 409). Pending payments
(``pending_payment``) are the deposit sweeper's job (``deposits.expire_unpaid``).
Commits are left to the caller.
"""

from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, and_, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.datetime import utc_now

from . import deposit_payments, emails, public
from .config import bookings_settings
from .models import Booking, BookingProfile, BookingStatus

#: A small batch: a deposit refund calls the provider inside the locked transaction.
EXPIRY_BATCH = 25
COMPLETION_BATCH = 500
#: How long after a booking ends the system closes it as completed.
COMPLETE_AFTER = timedelta(hours=48)
EXPIRED_NOTE = "Not confirmed by the business in time; slot released"
COMPLETED_NOTE = "Completed automatically 48 hours after the booking ended"
EXPIRED_REASON = "Not confirmed in time"
#: One hour as a Postgres interval, so ``hours * _ONE_HOUR`` is computed in the database.
_ONE_HOUR: ColumnElement[timedelta] = literal_column("interval '1 hour'")


def pending_expires_at(booking: Booking, profile: BookingProfile) -> datetime | None:
    """When ``expire_stale_requests`` will cancel this request: its window
    (``created_at`` plus ``pending_expiry_hours``) or its start, whichever is first.
    None when the booking is not a pending request. The same rule as the sweep."""
    if booking.status != BookingStatus.PENDING.value:
        return None
    if profile.pending_expiry_hours is None:
        return booking.starts_at
    window = booking.created_at + timedelta(hours=profile.pending_expiry_hours)
    return min(window, booking.starts_at)


def book_again_url(profile: BookingProfile) -> str:
    """The business's booking page on the bookings app (the storefront)."""
    return f"{bookings_settings.APP_URL.rstrip('/')}/{profile.public_slug}"


async def expire_stale_requests(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    organisation_id: str | None = None,
    limit: int = EXPIRY_BATCH,
) -> int:
    """Cancel pending requests past their window or start. Returns how many expired."""
    moment = now or utc_now()
    # created_at + N hours, computed in Postgres with the profile's N.
    window_passed = and_(
        BookingProfile.pending_expiry_hours.is_not(None),
        Booking.created_at + BookingProfile.pending_expiry_hours * _ONE_HOUR <= moment,
    )
    query = (
        select(Booking)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .where(
            Booking.status == BookingStatus.PENDING.value,
            or_(Booking.starts_at <= moment, window_passed),
        )
        .order_by(Booking.starts_at, Booking.id)
        .limit(limit)
        .with_for_update(of=Booking, skip_locked=True)
    )
    if organisation_id is not None:
        query = query.where(Booking.organisation_id == organisation_id)
    expired = 0
    for booking in (await session.scalars(query)).all():
        managed = await public.load_by_id(
            session, booking.id, booking.organisation_id, lock=True
        )
        if BookingStatus(managed.booking.status) is not BookingStatus.PENDING:
            continue
        booking.cancel_reason = EXPIRED_REASON
        await public.transition(
            session,
            booking,
            BookingStatus.CANCELLED,
            note=EXPIRED_NOTE,
            now=moment,
        )
        money = await deposit_payments.settle_cancellation(
            session,
            booking,
            managed.profile,
            previous=BookingStatus.PENDING,
            refund=True,
            now=moment,
        )
        if money:
            public.record_event(
                session,
                booking,
                BookingStatus.CANCELLED,
                BookingStatus.CANCELLED,
                note=money,
            )
        await public.emit_webhook(
            session,
            booking,
            "booking.cancelled",
            event_id=f"booking.cancelled:{booking.id}",
        )
        # A request whose start has already passed gets no mail: on the first run after
        # deploy an old request would otherwise mail a customer about a time gone by.
        if booking.starts_at > moment:
            await public.queue_customer_email(
                session,
                managed,
                emails.customer_expired(
                    public.build_mail(managed), book_again_url(managed.profile)
                ),
                f"booking-expired:{booking.id}",
            )
        expired += 1
    await session.flush()
    return expired


async def complete_finished_bookings(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    organisation_id: str | None = None,
    limit: int = COMPLETION_BATCH,
) -> int:
    """Close confirmed bookings that ended more than 48 hours ago. Returns the count.

    No reward, email or webhook: the move is the system's, not the business's."""
    moment = now or utc_now()
    query = (
        select(Booking)
        .where(
            Booking.status == BookingStatus.CONFIRMED.value,
            Booking.ends_at <= moment - COMPLETE_AFTER,
        )
        .order_by(Booking.ends_at, Booking.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    if organisation_id is not None:
        query = query.where(Booking.organisation_id == organisation_id)
    due = (await session.scalars(query)).all()
    for booking in due:
        await public.transition(
            session,
            booking,
            BookingStatus.COMPLETED,
            note=COMPLETED_NOTE,
            now=moment,
            earns_reward=False,
        )
    await session.flush()
    return len(due)
