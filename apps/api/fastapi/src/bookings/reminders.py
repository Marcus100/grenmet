"""24-hour booking reminders (hourly job ``enqueue_booking_reminders``).

Confirmed bookings that start within the next 24 hours get one reminder email on
the platform outbox. The outbox's unique ``(topic, dedupe_key)`` with
``booking-reminder:<booking id>`` makes the job safe to repeat: each booking is
queued once however often it runs. The reminder has no manage link, because the
manage token exists only as a hash.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import outbox_handlers
from src.utils.datetime import utc_now
from src.utils.timezones import zone

from . import emails
from .models import Booking, BookingProfile, BookingStatus, Customer, Provider, Service

REMINDER_WINDOW = timedelta(hours=24)


async def enqueue_due_reminders(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    organisation_id: str | None = None,
) -> int:
    """Queue reminders for bookings starting within 24 hours. The caller commits.

    Returns how many reminders were newly queued. ``organisation_id`` limits the run
    to one organisation (tests, backfills)."""
    moment = now or utc_now()
    query = (
        select(Booking, BookingProfile, Service, Provider, Customer)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .join(Service, Service.id == Booking.service_id)
        .join(Provider, Provider.id == Booking.provider_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .where(
            Booking.status == BookingStatus.CONFIRMED.value,
            Booking.starts_at > moment,
            Booking.starts_at <= moment + REMINDER_WINDOW,
            Customer.email.is_not(None),
        )
        .order_by(Booking.starts_at)
    )
    if organisation_id is not None:
        query = query.where(Booking.organisation_id == organisation_id)
    queued = 0
    for booking, profile, service, provider, customer in (
        await session.execute(query)
    ).all():
        if not customer.email:
            continue
        subject, body = emails.customer_reminder(
            emails.BookingEmail(
                business=profile.display_name,
                customer_name=customer.name,
                service_name=service.name,
                provider_name=provider.name,
                starts_at=booking.starts_at,
                tz=zone(profile.timezone),
            )
        )
        if await outbox_handlers.enqueue_email(
            session,
            to_email=customer.email,
            subject=subject,
            html=body,
            transactional=True,
            dedupe_key=f"booking-reminder:{booking.id}",
            organisation_id=booking.organisation_id,
        ):
            queued += 1
    return queued
