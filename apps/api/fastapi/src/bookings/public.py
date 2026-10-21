"""Public booking lifecycle (B3): create, look up, cancel, reschedule, ICS.

Customers have no account. A booking is reached through its manage token, a
256-bit random secret returned once; only its SHA-256 is stored. Every function
flushes and the router commits. Create runs inside ``idempotency.run_idempotent``
so a retried request replays instead of double-booking, and every email is queued
on the platform outbox in the same transaction as the booking change.
"""

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.email_verification import require_verified_email
from src.auth.models import User
from src.contacts import service as contacts_service
from src.contacts.models import ConsentPurpose, Contact
from src.notifications import outbox_handlers
from src.organisations import sites
from src.rewards import service as rewards_service
from src.utils.datetime import utc_now
from src.utils.timezones import utc_to_local, zone
from src.webhooks_out import service as webhook_service

from . import deposit_payments, emails, ics, service, transitions
from .exceptions import BookingConflictError, BookingNotFoundError
from .models import (
    ACTIVE_STATUSES,
    Booking,
    BookingEvent,
    BookingProfile,
    BookingSource,
    BookingStatus,
    Customer,
    Provider,
    Service,
)
from .schemas import (
    BookingPublicCreate,
    BookingPublicDetail,
    BookingPublicReceipt,
)

logger = logging.getLogger(__name__)

SLOT_TAKEN = "That time is no longer available. Please choose another."
TOKEN_BYTES = 32


@dataclass(frozen=True)
class Managed:
    """A booking found by token, with the rows its views need."""

    booking: Booking
    profile: BookingProfile
    service: Service
    provider: Provider
    customer: Customer
    #: The customer's contact-book record: the only home of name, email and phone.
    contact: Contact


def new_manage_token() -> tuple[str, str]:
    """A fresh ``(token, sha256 hex)``. Only the hash is ever stored."""
    token = secrets.token_urlsafe(TOKEN_BYTES)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def manage_url(profile: BookingProfile, token: str) -> str | None:
    if not profile.manage_url_template:
        return None
    return profile.manage_url_template.replace("{token}", token)


def _single_line(value: str) -> str:
    return " ".join(value.split())


# --- state machine ---------------------------------------------------------------------


async def transition(
    session: AsyncSession,
    booking: Booking,
    target: BookingStatus,
    *,
    actor_user_id: uuid.UUID | None = None,
    note: str | None = None,
    now: datetime | None = None,
) -> None:
    """Move a booking along ``transitions.TRANSITIONS`` and record a BookingEvent."""
    current = BookingStatus(booking.status)
    if not transitions.can_transition(current, target):
        raise BookingConflictError(
            f"A {current.value.replace('_', ' ')} booking cannot become "
            f"{target.value.replace('_', ' ')}"
        )
    moment = now or utc_now()
    booking.status = target.value
    if target is BookingStatus.CANCELLED:
        booking.cancelled_at = moment
    record_event(
        session, booking, current, target, actor_user_id=actor_user_id, note=note
    )
    await session.flush()
    if target is BookingStatus.COMPLETED:
        await _emit_completed_reward(session, booking)


async def emit_webhook(
    session: AsyncSession,
    booking: Booking,
    event_type: str,
    *,
    previous_starts_at: datetime | None = None,
    previous_ends_at: datetime | None = None,
    event_id: str,
) -> None:
    """Tell the organisation's webhook endpoints. Identifiers and times only: no
    customer name, email or phone ever leaves in an event."""
    data: dict[str, object] = {
        "booking_id": str(booking.id),
        "status": booking.status,
        "service_id": str(booking.service_id),
        "provider_id": str(booking.provider_id),
        "starts_at": booking.starts_at.isoformat(),
        "ends_at": booking.ends_at.isoformat(),
    }
    if previous_starts_at is not None and previous_ends_at is not None:
        data["previous_starts_at"] = previous_starts_at.isoformat()
        data["previous_ends_at"] = previous_ends_at.isoformat()
    await webhook_service.emit_event_safely(
        session, booking.organisation_id, event_type, data, event_id=event_id
    )


async def _emit_completed_reward(session: AsyncSession, booking: Booking) -> None:
    """Queue a `bookings.completed` earn for the customer's Barrels account (PF8).

    The account is known only through the customer's organisation contact
    (`contact.user_id`, PF3). Without a live contact or a linked account the
    booking earns nothing and nothing is queued."""
    contact_id = await session.scalar(
        select(Customer.contact_id).where(Customer.id == booking.customer_id)
    )
    if contact_id is None:
        return
    user_id = await session.scalar(
        select(Contact.user_id).where(
            Contact.id == contact_id,
            Contact.organisation_id == booking.organisation_id,
            Contact.erased_at.is_(None),
        )
    )
    if user_id is None:
        return
    await rewards_service.emit_qualifying_action(
        session,
        source_type="bookings.completed",
        source_id=str(booking.id),
        organisation_id=booking.organisation_id,
        user_id=user_id,
    )


def record_event(
    session: AsyncSession,
    booking: Booking,
    from_status: BookingStatus | None,
    to_status: BookingStatus,
    *,
    actor_user_id: uuid.UUID | None = None,
    note: str | None = None,
) -> None:
    session.add(
        BookingEvent(
            booking_id=booking.id,
            organisation_id=booking.organisation_id,
            from_status=from_status.value if from_status else None,
            to_status=to_status.value,
            actor_user_id=actor_user_id,
            note=note[:300] if note else None,
        )
    )


# --- turnstile -------------------------------------------------------------------------


async def turnstile_policy(
    session: AsyncSession, profile: BookingProfile
) -> sites.TurnstilePolicy | None:
    """The organisation's Turnstile policy, or None to use the global setting.

    The public site named like the profile's slug wins; otherwise the
    organisation's only site. Several unrelated sites make the choice ambiguous,
    so the global setting applies."""
    keys = [
        site.key
        for site in await sites.list_sites(
            session, organisation_id=profile.organisation_id
        )
    ]
    if profile.public_slug in keys:
        key = profile.public_slug
    elif len(keys) == 1:
        key = keys[0]
    else:
        return None
    resolved = await sites.resolve_public_site(session, key)
    return resolved.turnstile if resolved else None


# --- views -----------------------------------------------------------------------------


def _can_cancel(booking: Booking, profile: BookingProfile, now: datetime) -> bool:
    return BookingStatus(
        booking.status
    ) in ACTIVE_STATUSES and booking.starts_at - now >= timedelta(
        hours=profile.cancel_cutoff_hours
    )


def detail(managed: Managed, now: datetime) -> BookingPublicDetail:
    booking, profile = managed.booking, managed.profile
    return BookingPublicDetail(
        id=booking.id,
        status=BookingStatus(booking.status),
        service_id=booking.service_id,
        service_name=managed.service.name,
        provider_id=booking.provider_id,
        provider_name=managed.provider.name,
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        timezone=profile.timezone,
        customer_name=display_name(managed.contact),
        price_minor=booking.price_minor,
        deposit_minor=booking.deposit_minor,
        currency=booking.currency,
        cancel_cutoff_hours=profile.cancel_cutoff_hours,
        can_cancel=_can_cancel(booking, profile, now),
    )


def decoy_receipt(
    profile: BookingProfile, payload: BookingPublicCreate
) -> BookingPublicReceipt:
    """What a bot that filled the honeypot sees: success, with nothing stored."""
    token, _ = new_manage_token()
    starts_at = service.as_naive_utc(payload.starts_at)
    return BookingPublicReceipt(
        booking=BookingPublicDetail(
            id=uuid.uuid4(),
            status=BookingStatus.PENDING,
            service_id=payload.service_id,
            service_name="Appointment",
            provider_id=payload.provider_id or uuid.uuid4(),
            provider_name=profile.display_name,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=1),
            timezone=profile.timezone,
            customer_name=_single_line(payload.customer_name),
            price_minor=0,
            deposit_minor=0,
            currency=profile.currency,
            cancel_cutoff_hours=profile.cancel_cutoff_hours,
            can_cancel=False,
        ),
        manage_token=token,
        manage_url=manage_url(profile, token),
    )


def build_mail(managed: Managed, token: str | None = None) -> emails.BookingEmail:
    profile = managed.profile
    return emails.BookingEmail(
        business=profile.display_name,
        customer_name=display_name(managed.contact),
        service_name=managed.service.name,
        provider_name=managed.provider.name,
        starts_at=managed.booking.starts_at,
        tz=zone(profile.timezone),
        manage_url=manage_url(profile, token) if token else None,
        customer_email=managed.contact.email,
        customer_phone=managed.contact.phone,
        notes=managed.booking.notes,
    )


async def queue_customer_email(
    session: AsyncSession,
    managed: Managed,
    message: tuple[str, str],
    dedupe_key: str,
) -> None:
    if not managed.contact.email:
        return
    subject, body = message
    await outbox_handlers.enqueue_email(
        session,
        to_email=managed.contact.email,
        subject=subject,
        html=body,
        transactional=True,
        dedupe_key=dedupe_key,
        organisation_id=managed.booking.organisation_id,
    )


async def queue_studio_email(
    session: AsyncSession,
    managed: Managed,
    message: tuple[str, str],
    dedupe_key: str,
) -> None:
    if not managed.profile.notify_email:
        return
    subject, body = message
    await outbox_handlers.enqueue_email(
        session,
        to_email=managed.profile.notify_email,
        subject=subject,
        html=body,
        transactional=True,
        dedupe_key=dedupe_key,
        organisation_id=managed.booking.organisation_id,
    )


# --- create ----------------------------------------------------------------------------


async def _candidate_providers(
    session: AsyncSession,
    profile: BookingProfile,
    *,
    service_id: uuid.UUID,
    provider_id: uuid.UUID | None,
    starts_at: datetime,
    now: datetime,
    exclude_booking_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """Providers whose open slots include exactly ``starts_at``; availability is
    recomputed inside the booking transaction, never trusted from the client."""
    day = utc_to_local(starts_at, zone(profile.timezone)).date()
    slots = await service.available_slots(
        session,
        profile,
        service_id=service_id,
        provider_id=provider_id,
        first_day=day,
        last_day=day,
        now=now,
        exclude_booking_id=exclude_booking_id,
    )
    for slot in slots:
        if slot.starts_at == starts_at:
            return [uuid.UUID(pid) for pid in slot.provider_ids]
    return []


async def customer_for_contact(
    session: AsyncSession, organisation_id: str, contact: Contact, now: datetime
) -> Customer:
    """The organisation's booking-side role for this contact, created on first use.

    One customer per contact and organisation (unique key): the insert ignores a
    row a concurrent first booking just created, then both read the same one."""
    await session.execute(
        pg_insert(Customer)
        .values(
            id=uuid.uuid4(),
            organisation_id=organisation_id,
            contact_id=contact.id,
            created_at=now,
            last_booked_at=now,
        )
        .on_conflict_do_nothing(constraint="customer_org_contact_key")
    )
    customer = (
        await session.execute(
            select(Customer)
            .where(
                Customer.organisation_id == organisation_id,
                Customer.contact_id == contact.id,
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    customer.last_booked_at = now
    await session.flush()
    return customer


def display_name(contact: Contact) -> str:
    """A contact's name for views and mail; erased contacts have none."""
    return contact.name or ""


async def _upsert_customer(
    session: AsyncSession,
    profile: BookingProfile,
    payload: BookingPublicCreate,
    now: datetime,
) -> tuple[Customer, Contact]:
    """Find or create the contact for this email (exact hash match only), record
    the marketing decision on it, and return the organisation's customer role."""
    phone = payload.customer_phone.strip() if payload.customer_phone else None
    contact = await contacts_service.upsert_contact(
        session,
        profile.organisation_id,
        email=str(payload.customer_email).strip(),
        name=_single_line(payload.customer_name),
        phone=phone,
        source="bookings",
        consents={ConsentPurpose.MARKETING: payload.marketing_consent},
    )
    customer = await customer_for_contact(
        session, profile.organisation_id, contact, now
    )
    return customer, contact


async def create_booking(
    session: AsyncSession,
    profile: BookingProfile,
    payload: BookingPublicCreate,
    *,
    payer: User | None = None,
    now: datetime | None = None,
) -> tuple[int, dict[str, Any]]:
    """Book a slot. A signed-in ``payer`` needs a verified email when a deposit
    is due (ADR-0018); a guest has no account to check. Returns ``(201, receipt as JSON)`` for ``run_idempotent``."""
    moment = now or utc_now()
    starts_at = service.as_naive_utc(payload.starts_at)
    svc = await service.get_service(
        session, payload.service_id, organisation_id=profile.organisation_id
    )
    if not svc.active:
        raise BookingNotFoundError("Service")
    candidates = await _candidate_providers(
        session,
        profile,
        service_id=svc.id,
        provider_id=payload.provider_id,
        starts_at=starts_at,
        now=moment,
    )
    if not candidates:
        raise BookingConflictError(SLOT_TAKEN)

    customer, contact = await _upsert_customer(session, profile, payload, moment)
    token, token_hash = new_manage_token()
    ends_at = starts_at + timedelta(minutes=svc.duration_min)
    deposit = await deposit_payments.effective_deposit(
        session, profile.organisation_id, svc
    )
    if deposit > 0:
        if payer is not None:
            require_verified_email(payer, "pay a deposit")
        # The exclusion constraint already holds the slot while the deposit is
        # paid; the expiry sweeper releases it if it is not.
        initial = BookingStatus.PENDING_PAYMENT
    elif profile.requires_confirmation:
        initial = BookingStatus.PENDING
    else:
        initial = BookingStatus.CONFIRMED
    booking: Booking | None = None
    for provider_id in candidates:
        attempt = Booking(
            organisation_id=profile.organisation_id,
            provider_id=provider_id,
            service_id=svc.id,
            customer_id=customer.id,
            starts_at=starts_at,
            ends_at=ends_at,
            blocked_from=starts_at - timedelta(minutes=svc.buffer_before_min),
            blocked_until=ends_at + timedelta(minutes=svc.buffer_after_min),
            status=initial.value,
            source=BookingSource.ONLINE.value,
            price_minor=svc.price_minor,
            deposit_minor=deposit,
            currency=profile.currency,
            notes=payload.notes.strip() if payload.notes else None,
            manage_token_hash=token_hash,
        )
        try:
            # A savepoint: losing a race to the exclusion constraint rolls back
            # only this attempt, then the next free provider is tried.
            async with session.begin_nested():
                session.add(attempt)
                await session.flush()
        except DBAPIError as error:
            if not service.is_overlap_violation(error):
                raise
            continue
        booking = attempt
        break
    if booking is None:
        raise BookingConflictError(SLOT_TAKEN)

    record_event(session, booking, None, initial, note="Booked online")
    await emit_webhook(
        session, booking, "booking.created", event_id=f"booking.created:{booking.id}"
    )
    provider = await session.get(Provider, booking.provider_id)
    assert provider is not None
    managed = Managed(booking, profile, svc, provider, customer, contact)
    checkout_url: str | None = None
    if initial is BookingStatus.PENDING_PAYMENT:
        # No emails yet: they are queued when the deposit is paid
        # (deposits.confirm_paid), so an abandoned checkout mails nobody.
        checkout_url = await deposit_payments.start_deposit(
            session, booking, contact.email
        )
    else:
        mail = build_mail(managed, token)
        confirmed = initial is BookingStatus.CONFIRMED
        await queue_customer_email(
            session,
            managed,
            emails.customer_received(mail, confirmed=confirmed),
            f"booking-confirmation:{booking.id}",
        )
        await queue_studio_email(
            session,
            managed,
            emails.studio_notice(mail, event="created" if confirmed else "requested"),
            f"booking-studio-created:{booking.id}",
        )
    await session.flush()
    receipt = BookingPublicReceipt(
        booking=detail(managed, moment),
        manage_token=token,
        manage_url=manage_url(profile, token),
        payment_required=initial is BookingStatus.PENDING_PAYMENT,
        checkout_url=checkout_url,
    )
    return 201, receipt.model_dump(mode="json")


# --- manage ----------------------------------------------------------------------------


async def load_by_token(
    session: AsyncSession, token: str, *, lock: bool = False
) -> Managed:
    """The booking behind ``token``. Unknown, cleared and unentitled tokens all
    answer the same 404."""
    query = (
        select(Booking, BookingProfile, Service, Provider, Customer, Contact)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .join(Service, Service.id == Booking.service_id)
        .join(Provider, Provider.id == Booking.provider_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(Booking.manage_token_hash == hash_token(token))
    )
    if lock:
        query = query.with_for_update(of=Booking)
    row = (await session.execute(query)).first()
    if row is None:
        raise BookingNotFoundError("Booking")
    booking, profile, svc, provider, customer, contact = row
    await service.require_bookings_entitlement(session, profile, what="Booking")
    return Managed(booking, profile, svc, provider, customer, contact)


async def load_by_id(
    session: AsyncSession,
    booking_id: uuid.UUID,
    organisation_id: str,
    *,
    lock: bool = False,
) -> Managed:
    """One of the organisation's bookings by id; another organisation's id and
    an unknown id both answer 404. No entitlement check: callers did that."""
    query = (
        select(Booking, BookingProfile, Service, Provider, Customer, Contact)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .join(Service, Service.id == Booking.service_id)
        .join(Provider, Provider.id == Booking.provider_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(Booking.id == booking_id, Booking.organisation_id == organisation_id)
    )
    if lock:
        query = query.with_for_update(of=Booking)
    row = (await session.execute(query)).first()
    if row is None:
        raise BookingNotFoundError("Booking")
    booking, profile, svc, provider, customer, contact = row
    return Managed(booking, profile, svc, provider, customer, contact)


async def get_booking(session: AsyncSession, token: str) -> BookingPublicDetail:
    return detail(await load_by_token(session, token), utc_now())


def _require_active(booking: Booking) -> None:
    if BookingStatus(booking.status) not in ACTIVE_STATUSES:
        raise BookingConflictError("This booking can no longer be changed")


def _require_before_cutoff(managed: Managed, now: datetime, action: str) -> None:
    profile = managed.profile
    if managed.booking.starts_at - now < timedelta(hours=profile.cancel_cutoff_hours):
        raise BookingConflictError(
            f"Bookings can be {action} online up to {profile.cancel_cutoff_hours} "
            f"hours before they start. Please contact {profile.display_name}."
        )


async def cancel_booking(
    session: AsyncSession,
    token: str,
    *,
    reason: str | None = None,
    now: datetime | None = None,
) -> BookingPublicDetail:
    moment = now or utc_now()
    managed = await load_by_token(session, token, lock=True)
    booking = managed.booking
    if booking.status == BookingStatus.CANCELLED.value:
        return detail(managed, moment)  # a repeated cancel is a no-op
    _require_active(booking)
    _require_before_cutoff(managed, moment, "cancelled")
    booking.cancel_reason = reason.strip()[:300] if reason and reason.strip() else None
    previous = BookingStatus(booking.status)
    await transition(
        session,
        booking,
        BookingStatus.CANCELLED,
        note="Cancelled by customer",
        now=moment,
    )
    money = await deposit_payments.settle_cancellation(
        session,
        booking,
        managed.profile,
        previous=previous,
        refund=None,
        now=moment,
    )
    if money:
        record_event(
            session,
            booking,
            BookingStatus.CANCELLED,
            BookingStatus.CANCELLED,
            note=money,
        )
    await emit_webhook(
        session,
        booking,
        "booking.cancelled",
        event_id=f"booking.cancelled:{booking.id}",
    )
    mail = build_mail(managed)
    await queue_customer_email(
        session,
        managed,
        emails.customer_cancelled(mail),
        f"booking-cancelled:{booking.id}",
    )
    await queue_studio_email(
        session,
        managed,
        emails.studio_notice(mail, event="cancelled"),
        f"booking-studio-cancelled:{booking.id}",
    )
    await session.flush()
    return detail(managed, moment)


async def reschedule_booking(
    session: AsyncSession,
    token: str,
    new_starts_at: datetime,
    *,
    now: datetime | None = None,
) -> BookingPublicDetail:
    """Move a booking to another open slot with the same provider and service."""
    moment = now or utc_now()
    managed = await load_by_token(session, token, lock=True)
    booking, svc = managed.booking, managed.service
    _require_active(booking)
    _require_before_cutoff(managed, moment, "changed")
    starts_at = service.as_naive_utc(new_starts_at)
    if starts_at == booking.starts_at:
        return detail(managed, moment)
    open_providers = await _candidate_providers(
        session,
        managed.profile,
        service_id=svc.id,
        provider_id=booking.provider_id,
        starts_at=starts_at,
        now=moment,
        exclude_booking_id=booking.id,
    )
    if booking.provider_id not in open_providers:
        raise BookingConflictError(SLOT_TAKEN)

    previous = booking.starts_at
    previous_ends = booking.ends_at
    ends_at = starts_at + timedelta(minutes=svc.duration_min)
    try:
        async with session.begin_nested():
            booking.starts_at = starts_at
            booking.ends_at = ends_at
            booking.blocked_from = starts_at - timedelta(minutes=svc.buffer_before_min)
            booking.blocked_until = ends_at + timedelta(minutes=svc.buffer_after_min)
            await session.flush()
    except DBAPIError as error:
        if not service.is_overlap_violation(error):
            raise
        raise BookingConflictError(SLOT_TAKEN) from error
    current = BookingStatus(booking.status)
    record_event(
        session,
        booking,
        current,
        current,
        note=f"Rescheduled from {previous:%Y-%m-%dT%H:%MZ} by customer",
    )
    stamp = f"{starts_at:%Y%m%dT%H%M}"
    await emit_webhook(
        session,
        booking,
        "booking.rescheduled",
        previous_starts_at=previous,
        previous_ends_at=previous_ends,
        event_id=f"booking.rescheduled:{booking.id}:{stamp}",
    )
    mail = build_mail(managed)
    await queue_customer_email(
        session,
        managed,
        emails.customer_rescheduled(mail),
        f"booking-rescheduled:{booking.id}:{stamp}",
    )
    await queue_studio_email(
        session,
        managed,
        emails.studio_notice(mail, event="rescheduled"),
        f"booking-studio-rescheduled:{booking.id}:{stamp}",
    )
    await session.flush()
    return detail(managed, moment)


async def booking_ics(
    session: AsyncSession, token: str, *, now: datetime | None = None
) -> str:
    managed = await load_by_token(session, token)
    booking = managed.booking
    changes = await session.scalar(
        select(func.count())
        .select_from(BookingEvent)
        .where(BookingEvent.booking_id == booking.id)
    )
    status = BookingStatus(booking.status)
    ics_status: ics.IcsStatus = "CONFIRMED"
    if status is BookingStatus.CANCELLED:
        ics_status = "CANCELLED"
    elif status in (BookingStatus.PENDING, BookingStatus.PENDING_PAYMENT):
        ics_status = "TENTATIVE"
    return ics.build_booking_ics(
        uid=f"booking-{booking.id}@barrels.gd",
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        summary=f"{managed.service.name} at {managed.profile.display_name}",
        description=f"With {managed.provider.name}.",
        stamp=now or utc_now(),
        status=ics_status,
        sequence=max((changes or 1) - 1, 0),
    )
