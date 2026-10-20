"""Studio actions (B5): the business's view of a booking and its decisions.

Every status change goes through ``public.transition``, the only place that
changes status and writes the ``BookingEvent``. ``actor_user_id`` is the
signed-in member, or ``None`` when an API key acts. Another organisation's booking
id answers 404. Service functions flush; routers commit.
"""

import uuid
from collections.abc import Callable
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments import service as payments_service
from src.utils.datetime import utc_now
from src.utils.timezones import local_to_utc, utc_to_local, zone

from . import deposit_payments, emails, public, service
from .exceptions import BookingConflictError, BookingValidationError
from .models import (
    Booking,
    BookingEvent,
    BookingSource,
    BookingStatus,
    Customer,
    Service,
)
from .schemas import (
    BookingAgenda,
    BookingAgendaDay,
    BookingAgendaItem,
    BookingStudioCustomer,
    BookingStudioDetail,
    BookingStudioEvent,
)

MAX_AGENDA_DAYS = 62


# --- reading -------------------------------------------------------------------------


async def get_detail(
    session: AsyncSession, organisation_id: str, booking_id: uuid.UUID
) -> BookingStudioDetail:
    managed = await public.load_by_id(session, booking_id, organisation_id)
    return await _detail(session, managed)


async def _detail(
    session: AsyncSession, managed: public.Managed
) -> BookingStudioDetail:
    booking, customer = managed.booking, managed.customer
    events = (
        await session.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == booking.id)
            .order_by(BookingEvent.created_at, BookingEvent.id)
        )
    ).all()
    intent = await payments_service.find_by_source(
        session,
        organisation_id=booking.organisation_id,
        source_type=deposit_payments.SOURCE_TYPE,
        source_id=str(booking.id),
    )
    return BookingStudioDetail(
        id=booking.id,
        status=BookingStatus(booking.status),
        source=BookingSource(booking.source),
        service_id=booking.service_id,
        service_name=managed.service.name,
        provider_id=booking.provider_id,
        provider_name=managed.provider.name,
        customer=BookingStudioCustomer(
            id=customer.id,
            name=customer.name,
            email=customer.email,
            phone=customer.phone,
        ),
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        timezone=managed.profile.timezone,
        price_minor=booking.price_minor,
        deposit_minor=booking.deposit_minor,
        currency=booking.currency,
        notes=booking.notes,
        cancel_reason=booking.cancel_reason,
        cancelled_at=booking.cancelled_at,
        created_at=booking.created_at,
        deposit_intent_id=intent.id if intent else None,
        deposit_captured_minor=intent.captured_minor if intent else 0,
        deposit_refunded_minor=intent.refunded_minor if intent else 0,
        events=[
            BookingStudioEvent(
                from_status=BookingStatus(e.from_status) if e.from_status else None,
                to_status=BookingStatus(e.to_status),
                actor_user_id=e.actor_user_id,
                note=e.note,
                created_at=e.created_at,
            )
            for e in events
        ],
    )


async def agenda(
    session: AsyncSession,
    organisation_id: str,
    *,
    from_date: date,
    to_date: date,
    provider_id: uuid.UUID | None,
    statuses: list[BookingStatus] | None,
    limit: int,
    offset: int,
) -> BookingAgenda:
    """Bookings that start on the local days ``from_date..to_date`` (inclusive),
    grouped by local day. Filtering, ordering and paging happen in SQL."""
    if to_date < from_date:
        raise BookingValidationError("to_date must not be before from_date")
    if (to_date - from_date).days >= MAX_AGENDA_DAYS:
        raise BookingValidationError(
            f"Ask for at most {MAX_AGENDA_DAYS} days at a time"
        )
    profile = await service.get_profile(session, organisation_id)
    tz = zone(profile.timezone)
    first = local_to_utc(from_date, time(0), tz)
    last = local_to_utc(to_date + timedelta(days=1), time(0), tz)
    conditions = [
        Booking.organisation_id == organisation_id,
        Booking.starts_at >= first,
        Booking.starts_at < last,
    ]
    if provider_id is not None:
        conditions.append(Booking.provider_id == provider_id)
    if statuses:
        conditions.append(Booking.status.in_([s.value for s in statuses]))
    total = (
        await session.scalar(
            select(func.count()).select_from(Booking).where(*conditions)
        )
        or 0
    )
    rows = await session.execute(
        select(Booking, Service.name, Customer.name)
        .join(Service, Service.id == Booking.service_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .where(*conditions)
        .order_by(Booking.starts_at, Booking.id)
        .limit(limit)
        .offset(offset)
    )
    days: dict[date, list[BookingAgendaItem]] = {}
    for booking, service_name, customer_name in rows:
        local_day = utc_to_local(booking.starts_at, tz).date()
        days.setdefault(local_day, []).append(
            BookingAgendaItem(
                id=booking.id,
                provider_id=booking.provider_id,
                service_id=booking.service_id,
                service_name=service_name,
                customer_id=booking.customer_id,
                customer_name=customer_name,
                starts_at=booking.starts_at,
                ends_at=booking.ends_at,
                status=BookingStatus(booking.status),
                source=BookingSource(booking.source),
                price_minor=booking.price_minor,
                deposit_minor=booking.deposit_minor,
                currency=booking.currency,
            )
        )
    return BookingAgenda(
        timezone=profile.timezone,
        from_date=from_date,
        to_date=to_date,
        total=total,
        limit=limit,
        offset=offset,
        days=[BookingAgendaDay(day=day, bookings=days[day]) for day in sorted(days)],
    )


# --- actions -------------------------------------------------------------------------


async def confirm(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
) -> BookingStudioDetail:
    """``pending`` becomes ``confirmed``. Nothing is sent to webhooks (the
    booking was announced when it was made); the customer is emailed."""
    managed = await public.load_by_id(session, booking_id, organisation_id, lock=True)
    booking = managed.booking
    if BookingStatus(booking.status) is BookingStatus.PENDING_PAYMENT:
        raise BookingConflictError("This booking is waiting for its deposit")
    await public.transition(
        session,
        booking,
        BookingStatus.CONFIRMED,
        actor_user_id=actor_user_id,
        note="Confirmed by the business",
    )
    await public.queue_customer_email(
        session,
        managed,
        emails.customer_confirmed(public.build_mail(managed)),
        f"booking-confirmed:{booking.id}",
    )
    await session.flush()
    return await _detail(session, managed)


async def decline(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
    reason: str,
    now: datetime | None = None,
) -> BookingStudioDetail:
    """A ``pending`` request is refused: cancelled, slot released, any captured
    deposit refunded in full, the customer emailed once."""
    managed = await public.load_by_id(session, booking_id, organisation_id, lock=True)
    if BookingStatus(managed.booking.status) is not BookingStatus.PENDING:
        raise BookingConflictError("Only a booking request can be declined")
    return await _cancel(
        session,
        managed,
        actor_user_id=actor_user_id,
        reason=reason,
        refund=True,
        note="Declined by the business",
        email=emails.customer_declined,
        dedupe_key=f"booking-declined:{managed.booking.id}",
        now=now or utc_now(),
    )


async def cancel(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
    reason: str,
    refund_deposit: bool | None,
    now: datetime | None = None,
) -> BookingStudioDetail:
    """The business cancels an active booking. A captured deposit follows the
    cutoff policy unless ``refund_deposit`` says otherwise."""
    managed = await public.load_by_id(session, booking_id, organisation_id, lock=True)
    return await _cancel(
        session,
        managed,
        actor_user_id=actor_user_id,
        reason=reason,
        refund=refund_deposit,
        note="Cancelled by the business",
        email=emails.customer_cancelled_by_studio,
        dedupe_key=f"booking-cancelled-by-studio:{managed.booking.id}",
        now=now or utc_now(),
    )


async def _cancel(
    session: AsyncSession,
    managed: public.Managed,
    *,
    actor_user_id: uuid.UUID | None,
    reason: str,
    refund: bool | None,
    note: str,
    email: Callable[[emails.BookingEmail, str | None], tuple[str, str]],
    dedupe_key: str,
    now: datetime,
) -> BookingStudioDetail:
    booking = managed.booking
    previous = BookingStatus(booking.status)
    booking.cancel_reason = reason.strip()[:300]
    await public.transition(
        session,
        booking,
        BookingStatus.CANCELLED,
        actor_user_id=actor_user_id,
        note=note,
        now=now,
    )
    money = await deposit_payments.settle_cancellation(
        session, booking, managed.profile, previous=previous, refund=refund, now=now
    )
    if money:
        public.record_event(
            session,
            booking,
            BookingStatus.CANCELLED,
            BookingStatus.CANCELLED,
            actor_user_id=actor_user_id,
            note=money,
        )
    await public.emit_webhook(
        session,
        booking,
        "booking.cancelled",
        event_id=f"booking.cancelled:{booking.id}",
    )
    await public.queue_customer_email(
        session,
        managed,
        email(public.build_mail(managed), booking.cancel_reason),
        dedupe_key,
    )
    await session.flush()
    return await _detail(session, managed)


async def no_show(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
) -> BookingStudioDetail:
    return await _finish(
        session, organisation_id, booking_id, BookingStatus.NO_SHOW, actor_user_id
    )


async def complete(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
) -> BookingStudioDetail:
    """Mark a confirmed booking done; the rewards action is emitted by
    ``public.transition``."""
    return await _finish(
        session, organisation_id, booking_id, BookingStatus.COMPLETED, actor_user_id
    )


async def _finish(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    target: BookingStatus,
    actor_user_id: uuid.UUID | None,
) -> BookingStudioDetail:
    managed = await public.load_by_id(session, booking_id, organisation_id, lock=True)
    await public.transition(
        session,
        managed.booking,
        target,
        actor_user_id=actor_user_id,
        note="Marked by the business",
    )
    return await _detail(session, managed)
