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
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.models import IntentStatus, ProviderKey
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
    ProviderService,
    Service,
)
from .schemas import (
    BookingAgenda,
    BookingAgendaDay,
    BookingAgendaItem,
    BookingStudioCreate,
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
    booking, customer, contact = managed.booking, managed.customer, managed.contact
    events = (
        await session.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == booking.id)
            .order_by(BookingEvent.created_at, BookingEvent.id)
        )
    ).all()
    intent = await deposit_payments.find_deposit(session, booking)
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
            name=public.display_name(contact),
            email=contact.email,
            phone=contact.phone,
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
        select(Booking, Service.name, func.coalesce(Contact.name, ""))
        .join(Service, Service.id == Booking.service_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
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


# --- create ------------------------------------------------------------------------


async def create_booking(
    session: AsyncSession,
    organisation_id: str,
    payload: BookingStudioCreate,
    *,
    actor_user_id: uuid.UUID | None,
    now: datetime | None = None,
) -> tuple[int, dict[str, object]]:
    """The business books a slot itself. Returns ``(201, detail as JSON)`` for
    ``run_idempotent``.

    Staff may book inside the lead time, past the horizon and outside the
    weekly hours (a walk-in, an after-hours favour, an appointment re-entered
    from another system), so the availability engine is not consulted. What
    still protects the diary is the ``booking_no_overlap`` constraint: a
    provider's time (buffers included) is never double-booked. The booking is
    ``confirmed`` with no deposit; the customer is emailed only on request."""
    moment = now or utc_now()
    profile = await service.get_profile(session, organisation_id)
    svc = await service.get_service(
        session, payload.service_id, organisation_id=organisation_id
    )
    provider = await service.get_provider(
        session, payload.provider_id, organisation_id=organisation_id
    )
    if not svc.active or not provider.active:
        raise BookingValidationError("That service or provider is not active")
    offered = await session.scalar(
        select(ProviderService).where(
            ProviderService.provider_id == provider.id,
            ProviderService.service_id == svc.id,
        )
    )
    if offered is None:
        raise BookingValidationError(f"{provider.name} does not offer {svc.name}")
    if payload.send_confirmation and payload.customer_email is None:
        raise BookingValidationError("A confirmation email needs customer_email")

    customer, contact = await _studio_customer(
        session, organisation_id, payload, moment
    )
    token, token_hash = public.new_manage_token()
    starts_at = service.as_naive_utc(payload.starts_at)
    ends_at = starts_at + timedelta(minutes=svc.duration_min)
    booking = Booking(
        organisation_id=organisation_id,
        provider_id=provider.id,
        service_id=svc.id,
        customer_id=customer.id,
        starts_at=starts_at,
        ends_at=ends_at,
        blocked_from=starts_at - timedelta(minutes=svc.buffer_before_min),
        blocked_until=ends_at + timedelta(minutes=svc.buffer_after_min),
        status=BookingStatus.CONFIRMED.value,
        source=BookingSource.STUDIO.value,
        price_minor=svc.price_minor,
        deposit_minor=0,
        currency=profile.currency,
        notes=payload.notes.strip() if payload.notes else None,
        manage_token_hash=token_hash,
    )
    try:
        async with session.begin_nested():
            session.add(booking)
            await session.flush()
    except DBAPIError as error:
        if not service.is_overlap_violation(error):
            raise
        raise BookingConflictError(public.SLOT_TAKEN) from error

    public.record_event(
        session,
        booking,
        None,
        BookingStatus.CONFIRMED,
        actor_user_id=actor_user_id,
        note="Entered by the business",
    )
    await public.emit_webhook(
        session, booking, "booking.created", event_id=f"booking.created:{booking.id}"
    )
    managed = public.Managed(booking, profile, svc, provider, customer, contact)
    if payload.send_confirmation:
        await public.queue_customer_email(
            session,
            managed,
            emails.customer_received(public.build_mail(managed, token), confirmed=True),
            f"booking-confirmation:{booking.id}",
        )
    await session.flush()
    detail = await _detail(session, managed)
    return 201, detail.model_dump(mode="json")


async def _studio_customer(
    session: AsyncSession,
    organisation_id: str,
    payload: BookingStudioCreate,
    now: datetime,
) -> tuple[Customer, Contact]:
    """Reuse the contact with this email; without an email each entry is a new
    contact (a walk-in cannot be matched safely by name). No marketing consent is
    recorded: staff did not ask."""
    name = " ".join(payload.customer_name.split())
    phone = payload.customer_phone.strip() if payload.customer_phone else None
    if payload.customer_email:
        contact = await contacts_service.upsert_contact(
            session,
            organisation_id,
            email=str(payload.customer_email).strip().lower(),
            name=name,
            phone=phone,
            source="bookings",
        )
    else:
        contact = await contacts_service.create_without_email(
            session, organisation_id, name=name, phone=phone, source="bookings"
        )
    customer = await public.customer_for_contact(session, organisation_id, contact, now)
    return customer, contact


# --- manual deposit ------------------------------------------------------------------

_DEPOSIT_OPEN = (
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
)


async def record_manual_deposit(
    session: AsyncSession,
    organisation_id: str,
    booking_id: uuid.UUID,
    payload: payment_schemas.ManualPaymentCreate,
    *,
    actor: User,
) -> tuple[int, dict[str, object]]:
    """Staff took the deposit outside Stripe (cash, bank transfer, cheque).

    Records it through the payments manual rail so the ledger, the
    ``bookings.deposit_paid`` outbox topic and ``deposit_captured_minor`` in the
    studio detail all follow from one charge. Locks the booking row, so two
    racing calls end with one charge and one 409. A deposit already captured
    (by Stripe or by hand) is 409; a ``pending_payment`` booking is confirmed by
    the outbox handler, exactly as for any other paid deposit."""
    managed = await public.load_by_id(session, booking_id, organisation_id, lock=True)
    booking = managed.booking
    if booking.deposit_minor <= 0:
        raise BookingConflictError("This booking has no deposit to record")
    if BookingStatus(booking.status) not in _DEPOSIT_OPEN:
        raise BookingConflictError("A closed booking cannot take a deposit")
    key = deposit_payments.intent_key(booking.id)
    intent = await payments_service.lock_intent_by_key(
        session, organisation_id=organisation_id, idempotency_key=key
    )
    if intent is None:
        await deposit_payments.start_manual_deposit(session, booking)
        intent = await payments_service.lock_intent_by_key(
            session, organisation_id=organisation_id, idempotency_key=key
        )
        if intent is None:  # pragma: no cover - create_intent just wrote it
            raise BookingConflictError("The deposit could not be started")
    if intent.status == IntentStatus.SUCCEEDED.value:
        raise BookingConflictError("The deposit has already been paid")
    if intent.status in (IntentStatus.FAILED.value, IntentStatus.CANCELLED.value):
        raise BookingConflictError(
            "The card payment for this deposit has failed or expired, so it "
            "cannot be recorded by hand; the customer needs to book again"
        )
    if (
        intent.amount_minor != booking.deposit_minor
        or intent.currency != booking.currency
    ):
        raise BookingConflictError(
            "The deposit payment does not match the booking's deposit"
        )
    if intent.provider != ProviderKey.MANUAL.value:
        raise BookingConflictError(
            "The deposit is being paid online; that payment must expire or fail "
            "first (up to 30 minutes) before it can be recorded by hand"
        )
    paid = await payments_service.record_manual_payment(
        session,
        organisation_id=organisation_id,
        intent_id=intent.id,
        actor=actor,
        payload=payload,
    )
    audit_service.set_actor(session, actor.id)
    await audit_service.record_change(
        session,
        entity_type="booking",
        entity_id=str(booking.id),
        record_type="booking",
        record_id=str(booking.id),
        action="manual_deposit",
        changes={
            "deposit_captured_minor": (0, paid.captured_minor),
            "method": (None, payload.method.value),
            "reference": (None, payload.reference),
        },
        sensitive=frozenset({"reference"}),
        organisation_id=organisation_id,
    )
    status = BookingStatus(booking.status)
    public.record_event(
        session,
        booking,
        status,
        status,
        actor_user_id=actor.id,
        note=f"Deposit recorded by hand ({payload.method.value})",
    )
    await session.flush()
    detail = await _detail(session, managed)
    return 200, detail.model_dump(mode="json")
