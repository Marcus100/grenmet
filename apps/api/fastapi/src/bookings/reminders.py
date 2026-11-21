"""24-hour booking reminders (hourly job ``enqueue_booking_reminders``).

Confirmed bookings, and bookings still waiting for the business to confirm
(``pending``), that start within the next 24 hours get one reminder email on
the platform outbox. A pending booking's reminder says the business has not
confirmed it yet. The outbox's unique ``(topic, dedupe_key)`` with
``booking-reminder:<booking id>`` makes the job safe to repeat: each booking is
queued once however often it runs, so a booking that was reminded as pending and
is confirmed later is not reminded a second time. The reminder carries a signed
manage link (``manage_link``, minted now) and, for a guest, the account invitation.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.contacts.models import Contact
from src.email import business_sender
from src.notifications import outbox_handlers
from src.utils.datetime import utc_now

from . import emails, public
from .models import (
    Booking,
    BookingProfile,
    BookingStatus,
    Customer,
    Provider,
    Service,
)

REMINDER_WINDOW = timedelta(hours=24)
REMINDED_STATUSES = (BookingStatus.CONFIRMED.value, BookingStatus.PENDING.value)


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
        select(Booking, BookingProfile, Service, Provider, Customer, Contact)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .join(Service, Service.id == Booking.service_id)
        .join(Provider, Provider.id == Booking.provider_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(
            Booking.status.in_(REMINDED_STATUSES),
            Booking.starts_at > moment,
            Booking.starts_at <= moment + REMINDER_WINDOW,
            Contact.email.is_not(None),
        )
        .order_by(Booking.starts_at)
    )
    if organisation_id is not None:
        query = query.where(Booking.organisation_id == organisation_id)
    queued = 0
    for booking, profile, service, provider, customer, contact in (
        await session.execute(query)
    ).all():
        if not contact.email:
            continue
        managed = public.Managed(booking, profile, service, provider, customer, contact)
        message = emails.customer_reminder(
            public.build_mail(managed),
            confirmed=booking.status == BookingStatus.CONFIRMED.value,
        )
        sender = business_sender(profile.display_name, profile.contact_email)
        if await outbox_handlers.enqueue_email(
            session,
            to_email=contact.email,
            subject=message.subject,
            template=layout.CARD_TEMPLATE,
            props=layout.to_props(message),
            transactional=True,
            dedupe_key=f"booking-reminder:{booking.id}",
            organisation_id=booking.organisation_id,
            from_name=sender.from_name,
            reply_to=sender.reply_to,
        ):
            queued += 1
    return queued
