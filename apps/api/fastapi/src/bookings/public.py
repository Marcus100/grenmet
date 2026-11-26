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
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote, urlencode

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.audit import service as audit_service
from src.auth.config import auth_settings
from src.auth.models import User
from src.contacts import service as contacts_service
from src.contacts.models import ConsentPurpose, Contact
from src.notifications import outbox_handlers
from src.notifications.sender_identity import business_identity
from src.organisations import sites
from src.rewards import service as rewards_service
from src.utils.datetime import utc_now
from src.utils.timezones import utc_to_local, zone
from src.webhooks_out import service as webhook_service

from . import (
    deposit_payments,
    email_code,
    emails,
    ics,
    manage_link,
    service,
    transitions,
)
from .config import bookings_settings
from .exceptions import BookingConflictError, BookingNotFoundError
from .models import (
    ACTIVE_STATUSES,
    Booking,
    BookingAddOn,
    BookingEvent,
    BookingProfile,
    BookingSource,
    BookingStatus,
    Customer,
    Provider,
    Service,
)
from .schemas import (
    BookingAddOnLine,
    BookingBusinessContact,
    BookingEmailCodeConfirm,
    BookingEmailCodeRequest,
    BookingEmailCodeSent,
    BookingEmailProof,
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
    #: The booking's add-on lines (``add_on_lines``); empty when it has none.
    add_ons: tuple[BookingAddOn, ...] = ()


def total_minutes(managed: Managed) -> int:
    """The booking's length as sold: the main service plus its add-ons."""
    return managed.service.duration_min + sum(a.duration_min for a in managed.add_ons)


async def add_on_lines(
    session: AsyncSession, booking_id: uuid.UUID
) -> tuple[BookingAddOn, ...]:
    lines = await service.booking_add_on_lines(session, [booking_id])
    return tuple(lines.get(booking_id, []))


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


def signed_manage_url(managed: Managed) -> str | None:
    """A freshly signed manage link for this booking (``manage_link``), or None
    when the business configured no manage page. Nothing is stored."""
    if not managed.profile.manage_url_template:
        return None
    token = manage_link.mint(managed.booking.id, managed.booking.ends_at)
    return manage_url(managed.profile, token)


def my_manage_url(slug: str, booking: Booking, now: datetime) -> str | None:
    """The Barrels manage page for one of the account's bookings, with a signed
    link minted now (nothing is stored). None when the stored token was cleared
    (retention) or the signed link has lapsed (a week after the booking ends)."""
    if booking.manage_token_hash is None:
        return None
    token = manage_link.mint(booking.id, booking.ends_at)
    if manage_link.verify(token, now=now) is None:
        return None
    base = bookings_settings.APP_URL.rstrip("/")
    return f"{base}/{quote(slug, safe='')}/booking/{token}"


def hold_ends_at(booking: Booking, hold_minutes: int | None) -> datetime | None:
    """When an unpaid hold is released: the same clock the expiry sweeper uses
    (``deposit_payments.hold_started_at`` plus this booking's hold). None for a
    booking not waiting for payment."""
    if booking.status != BookingStatus.PENDING_PAYMENT.value:
        return None
    started = deposit_payments.hold_started_at(booking)
    if started is None or hold_minutes is None:
        return None
    return started + timedelta(minutes=hold_minutes)


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
    earns_reward: bool = True,
) -> None:
    """Move a booking along ``transitions.TRANSITIONS`` and record a BookingEvent.

    Completing a booking earns the customer's reward (``bookings.completed``) unless
    ``earns_reward`` is false: the system's own completion (``lifecycle``) passes
    false, so only a completion the business marks by hand earns."""
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
    if target is BookingStatus.COMPLETED and earns_reward:
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
    staff_note: bool = False,
) -> BookingEvent:
    """Add a history row and return it. Its id exists at once, so a caller can
    key an email or webhook to this one change. A ``staff_note`` row is left out
    of the customer calendar's SEQUENCE count (see ``booking_ics``)."""
    event = BookingEvent(
        id=uuid.uuid4(),
        booking_id=booking.id,
        organisation_id=booking.organisation_id,
        from_status=from_status.value if from_status else None,
        to_status=to_status.value,
        actor_user_id=actor_user_id,
        note=note[:300] if note else None,
        staff_note=staff_note,
    )
    session.add(event)
    return event


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


async def full_detail(
    session: AsyncSession, managed: Managed, now: datetime
) -> BookingPublicDetail:
    """``detail`` plus what the customer paid at booking (needs the payments rows)."""
    held = await deposit_payments.hold_minutes_for_bookings(
        session, managed.profile, [managed.booking]
    )
    result = detail(managed, now, hold_minutes=held.get(managed.booking.id))
    result.payment = await deposit_payments.payment_summary(session, managed.booking)
    return result


def detail(
    managed: Managed, now: datetime, *, hold_minutes: int | None = None
) -> BookingPublicDetail:
    """The customer's view of a booking. ``hold_minutes`` is the unpaid hold for
    this booking (``deposit_payments.hold_minutes_for_bookings``), None when it is
    not waiting for a deposit."""
    booking, profile = managed.booking, managed.profile
    return BookingPublicDetail(
        id=booking.id,
        status=BookingStatus(booking.status),
        business_name=profile.display_name,
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
        deposit_non_refundable=booking.deposit_non_refundable,
        booking_policy=profile.booking_policy,
        deposit_to_business_minor=booking.deposit_to_business_minor,
        deposit_instructions=(
            profile.deposit_instructions
            if booking.deposit_to_business_minor > 0
            and booking.deposit_received_at is None
            # Only once the business accepted: a request is not asked to pay.
            and booking.status == BookingStatus.CONFIRMED.value
            else None
        ),
        deposit_received=booking.deposit_received_at is not None,
        late_fee=service.late_fee_of(profile),
        new_clients_only=managed.service.new_clients_only,
        first_visit_lead_days=managed.service.first_visit_lead_days,
        first_visit_categories=managed.service.first_visit_categories,
        can_cancel=_can_cancel(booking, profile, now),
        contact=BookingBusinessContact(**service.business_contact(profile)),
        account_invite_url=account_invite_for(profile, managed.contact),
        hold_ends_at=hold_ends_at(booking, hold_minutes),
        hold_minutes=hold_minutes,
        pay_after_acceptance=booking.pay_after_acceptance,
        add_ons=[
            BookingAddOnLine(
                name=line.name,
                duration_min=line.duration_min,
                price_minor=line.price_minor,
            )
            for line in managed.add_ons
        ],
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
            business_name=profile.display_name,
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
            deposit_non_refundable=profile.deposit_non_refundable,
            booking_policy=profile.booking_policy,
            deposit_to_business_minor=0,
            deposit_instructions=None,
            late_fee=service.late_fee_of(profile),
            can_cancel=False,
            contact=BookingBusinessContact(**service.business_contact(profile)),
            account_invite_url=account_signup_url(profile.public_slug),
        ),
        manage_token=token,
        manage_url=manage_url(profile, token),
    )


def account_invite_for(profile: BookingProfile, contact: Contact) -> str | None:
    """Where a guest is invited to create an account; None once the contact is
    linked to one (the invitation never insists, ADR-0058)."""
    if contact.user_id is not None:
        return None
    return account_signup_url(profile.public_slug)


def account_signup_url(slug: str) -> str:
    """The auth app's sign-up page, returning the person signed in to the
    business's booking page.

    ``returnTo`` is the bookings app's own ``/signin?returnTo=/<slug>``: sign-up
    on auth ends with an auth session, and that address turns it into a bookings
    session (single sign-on) and lands on the booking page. Auth accepts the
    bookings origin because it is on its return-host allow-list. The sign-up page
    also offers "Sign in" to people who already have an account."""
    back = f"/signin?{urlencode({'returnTo': f'/{slug}'})}"
    target = f"{auth_settings.BOOKINGS_APP_URL.rstrip('/')}{back}"
    return (
        f"{auth_settings.AUTH_FRONTEND_URL.rstrip('/')}/signup"
        f"?{urlencode({'returnTo': target})}"
    )


def build_mail(managed: Managed, token: str | None = None) -> emails.BookingEmail:
    """The mail's facts. ``token`` is the legacy random token, given only where it
    is still at hand (the create that minted it). Otherwise the mail carries a
    freshly signed manage link: the stored token is only a hash."""
    profile = managed.profile
    return emails.BookingEmail(
        business=profile.display_name,
        customer_name=display_name(managed.contact),
        service_name=managed.service.name,
        provider_name=managed.provider.name,
        starts_at=managed.booking.starts_at,
        tz=zone(profile.timezone),
        manage_url=(
            manage_url(profile, token) if token else signed_manage_url(managed)
        ),
        customer_email=managed.contact.email,
        customer_phone=managed.contact.phone,
        notes=managed.booking.notes,
        account_invite_url=account_invite_for(profile, managed.contact),
        duration_min=total_minutes(managed),
        add_ons=tuple(line.name for line in managed.add_ons),
        reference=str(managed.booking.id).replace("-", "")[:8].upper(),
        cancel_cutoff_hours=profile.cancel_cutoff_hours,
        booking_policy=profile.booking_policy,
        deposit_non_refundable=managed.booking.deposit_non_refundable,
        deposit_to_business_minor=managed.booking.deposit_to_business_minor,
        deposit_instructions=profile.deposit_instructions,
        deposit_received=managed.booking.deposit_received_at is not None,
        late_fee_minor=profile.late_fee_minor,
        late_grace_min=profile.late_grace_min or 0,
        currency=managed.booking.currency,
        booking_confirmed=managed.booking.status == BookingStatus.CONFIRMED.value,
        business_email=profile.contact_email,
        business_phone=profile.contact_phone,
        accent=profile.brand_color,
        logo=emails.business_logo(profile.display_name, profile.logo_file_id),
        payment_line=deposit_payments.payment_line(managed.booking),
        pay_after_acceptance=deposit_payments.awaits_acceptance(managed.booking),
    )


async def queue_customer_email(
    session: AsyncSession,
    managed: Managed,
    message: layout.EmailCard,
    dedupe_key: str,
) -> None:
    if not managed.contact.email:
        return
    sender = await business_identity(
        session,
        managed.booking.organisation_id,
        managed.profile.display_name,
        managed.profile.contact_email,
    )
    await outbox_handlers.enqueue_email(
        session,
        to_email=managed.contact.email,
        subject=message.subject,
        template=layout.CARD_TEMPLATE,
        props=layout.to_props(message),
        transactional=True,
        dedupe_key=dedupe_key,
        organisation_id=managed.booking.organisation_id,
        from_name=sender.from_name,
        reply_to=sender.reply_to,
    )


async def queue_studio_email(
    session: AsyncSession,
    managed: Managed,
    message: layout.EmailCard,
    dedupe_key: str,
) -> None:
    if not managed.profile.notify_email:
        return
    await outbox_handlers.enqueue_email(
        session,
        to_email=managed.profile.notify_email,
        subject=message.subject,
        template=layout.CARD_TEMPLATE,
        props=layout.to_props(message),
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
    add_on_ids: Sequence[uuid.UUID] = (),
    extra_minutes: int = 0,
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
        add_on_ids=add_on_ids,
        extra_minutes=extra_minutes,
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


@dataclass(frozen=True)
class PricedBooking:
    """A bookable service priced with the add-ons a customer chose."""

    service: Service
    add_ons: list[Service]
    price_minor: int
    due_minor: int
    #: Display only: the deposit paid to the business by hand (``business`` mode).
    to_business_minor: int = 0

    @property
    def email_code_required(self) -> bool:
        """An anonymous booker must pass the emailed code whenever something is
        due; a signed-in booker whose email is verified or admin-activated may skip
        it (``email_code.is_exempt``), so this is the anonymous answer."""
        return self.due_minor > 0


async def price_booking(
    session: AsyncSession,
    profile: BookingProfile,
    *,
    service_id: uuid.UUID,
    add_on_ids: Sequence[uuid.UUID],
) -> PricedBooking:
    """The one pricing path for a booking: the service and add-ons are checked on
    the server, and ``due_minor`` is what the booking charges at booking (0 =
    nothing). Create, the emailed-code request and availability all call it."""
    svc = await service.get_service(
        session, service_id, organisation_id=profile.organisation_id
    )
    if not svc.active or svc.is_add_on:
        raise BookingNotFoundError("Service")
    chosen = await service.resolve_add_ons(session, profile, svc, add_on_ids)
    price_minor = svc.price_minor + sum(a.price_minor for a in chosen)
    due = await deposit_payments.amount_due(
        session, profile, svc, price_minor=price_minor
    )
    return PricedBooking(
        svc,
        chosen,
        price_minor,
        due,
        deposit_payments.deposit_to_business(profile, svc, price_minor),
    )


def _binding(
    profile: BookingProfile, email: str, service_id: uuid.UUID, starts_at: datetime
) -> email_code.Binding:
    return email_code.bind(
        profile.organisation_id, email, service_id, service.as_naive_utc(starts_at)
    )


async def request_email_code(
    session: AsyncSession,
    profile: BookingProfile,
    payload: BookingEmailCodeRequest,
    *,
    payer: User | None,
) -> BookingEmailCodeSent:
    """Email a code when a deposit is due and the caller is not exempt; else do
    nothing (bookings without a deposit have no step)."""
    email = str(payload.customer_email)
    priced = await price_booking(
        session,
        profile,
        service_id=payload.service_id,
        add_on_ids=payload.add_on_ids,
    )
    if not priced.email_code_required:
        return BookingEmailCodeSent(required=False)
    if await email_code.is_exempt(session, payer, email):
        return BookingEmailCodeSent(required=False)
    sender = await business_identity(
        session, profile.organisation_id, profile.display_name, profile.contact_email
    )
    ttl = await email_code.request_code(
        session,
        _binding(profile, email, payload.service_id, payload.starts_at),
        to_email=email,
        business=profile.display_name,
        from_name=sender.from_name,
        reply_to=sender.reply_to,
    )
    return BookingEmailCodeSent(required=True, expires_in_seconds=ttl)


async def confirm_email_code(
    profile: BookingProfile, payload: BookingEmailCodeConfirm
) -> BookingEmailProof:
    proof, ttl = await email_code.confirm_code(
        _binding(
            profile, str(payload.customer_email), payload.service_id, payload.starts_at
        ),
        payload.code,
    )
    return BookingEmailProof(proof=proof, expires_in_seconds=ttl)


async def create_booking(
    session: AsyncSession,
    profile: BookingProfile,
    payload: BookingPublicCreate,
    *,
    payer: User | None = None,
    now: datetime | None = None,
) -> tuple[int, dict[str, Any]]:
    """Book a slot. When a deposit is due the caller needs an emailed-code proof
    (``payload.email_proof``) unless a signed-in ``payer`` already vouches for the
    booking email (ADR-0018, #471); otherwise 403 ``email_verification_required``
    and nothing is stored. Returns ``(201, receipt as JSON)`` for ``run_idempotent``."""
    # A signed-in payer must not be recorded as the actor of the business's contact
    # history: readers see the actor's name (ADR-0058, account UUID never shared).
    audit_service.set_actor(session, None)
    priced = await price_booking(
        session,
        profile,
        service_id=payload.service_id,
        add_on_ids=payload.add_on_ids,
    )
    svc, chosen, deposit = priced.service, priced.add_ons, priced.due_minor
    to_business = priced.to_business_minor
    use = email_code.ProofUse(None)
    if deposit > 0:
        email = str(payload.customer_email)
        use = await email_code.require_proof(
            session,
            _binding(profile, email, svc.id, payload.starts_at),
            payer=payer,
            email=email,
            proof=payload.email_proof,
        )
    try:
        return await _create_booking(
            session,
            profile,
            payload,
            svc,
            deposit,
            chosen,
            payer=payer,
            now=now,
            to_business=to_business,
        )
    except BaseException:
        # The proof is single use, but a booking that never happened must not burn it.
        await use.release()
        raise


#: Statuses that count towards a customer's open-request cap (future bookings only).
OPEN_CAP_STATUSES = tuple(
    status.value
    for status in (
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.PENDING,
        BookingStatus.CONFIRMED,
    )
)


#: The same text whatever the count, so a refusal does not reveal that bookings exist
#: for an address (security review, MEDIUM-2). The cap limits careless repeat bookings;
#: it is not abuse protection (the rate limit and Turnstile are).
OPEN_CAP_MESSAGE = (
    "We can't take another online booking for this email right now. "
    "Please contact the business to book."
)


async def _require_under_open_cap(
    session: AsyncSession,
    profile: BookingProfile,
    customer: Customer,
    now: datetime,
) -> None:
    """Refuse a public booking when the customer already holds the business's
    ``max_open_per_customer`` future bookings. The customer row is locked first, so
    two racing requests from one person are counted one after the other."""
    await session.execute(
        select(Customer.id).where(Customer.id == customer.id).with_for_update()
    )
    open_count = await session.scalar(
        select(func.count(Booking.id)).where(
            Booking.customer_id == customer.id,
            Booking.organisation_id == profile.organisation_id,
            Booking.status.in_(OPEN_CAP_STATUSES),
            Booking.starts_at > now,
        )
    )
    if (open_count or 0) >= profile.max_open_per_customer:
        raise BookingConflictError(OPEN_CAP_MESSAGE)


#: A booking that makes its customer a returning client of the business.
RETURNING_STATUSES = (BookingStatus.CONFIRMED.value, BookingStatus.COMPLETED.value)


async def _is_returning_client(
    session: AsyncSession, profile: BookingProfile, contact: Contact
) -> bool:
    """True for a returning client of the business: the business's
    contact (matched by email in ``upsert_contact``, ADR-0058) or another contact of
    the same organisation linked to the same account has a confirmed or completed
    booking. Cancelled, expired, declined and unpaid or pending bookings do not count.
    Only staff ever see the answer (never the customer), so a caller cannot learn
    whether an email has booked."""
    same_person = Contact.id == contact.id
    if contact.user_id is not None:
        same_person = or_(same_person, Contact.user_id == contact.user_id)
    returning = await session.scalar(
        select(Booking.id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(
            Booking.organisation_id == profile.organisation_id,
            Booking.status.in_(RETURNING_STATUSES),
            Contact.organisation_id == profile.organisation_id,
            same_person,
        )
        .limit(1)
    )
    return returning is not None


async def _create_booking(
    session: AsyncSession,
    profile: BookingProfile,
    payload: BookingPublicCreate,
    svc: Service,
    deposit: int,
    chosen: list[Service],
    *,
    payer: User | None,
    now: datetime | None,
    to_business: int = 0,
) -> tuple[int, dict[str, Any]]:
    moment = now or utc_now()
    starts_at = service.as_naive_utc(payload.starts_at)
    candidates = await _candidate_providers(
        session,
        profile,
        service_id=svc.id,
        provider_id=payload.provider_id,
        starts_at=starts_at,
        now=moment,
        add_on_ids=[a.id for a in chosen],
    )
    if not candidates:
        raise BookingConflictError(SLOT_TAKEN)

    customer, contact = await _upsert_customer(session, profile, payload, moment)
    await _require_under_open_cap(session, profile, customer, moment)
    if payer is not None:
        # Ties the organisation's contact to the account that booked with it,
        # only on a verified email match (contacts owns the rule).
        await contacts_service.link_verified_account(
            session,
            contact,
            booking_email=str(payload.customer_email),
            user_id=payer.id,
        )
        # The name typed on the booking is the name the booking, the confirmation
        # and My bookings show. A stored name would otherwise win over it.
        contacts_service.take_name_from_linked_account(
            contact, name=_single_line(payload.customer_name), user_id=payer.id
        )
    flag_returning = svc.new_clients_only and await _is_returning_client(
        session, profile, contact
    )
    token, token_hash = new_manage_token()
    ends_at = starts_at + timedelta(
        minutes=svc.duration_min + sum(a.duration_min for a in chosen)
    )
    price_minor = svc.price_minor + sum(a.price_minor for a in chosen)
    # A new-clients-only service is always a request staff confirm, so every
    # client gets the same answer whatever their history.
    request = deposit_payments.needs_acceptance(profile, svc)
    if request:
        # A request first: nothing is asked and no payment hold starts until the
        # business accepts it (``studio.confirm``), whatever is due.
        initial = BookingStatus.PENDING
    elif deposit > 0:
        # The exclusion constraint already holds the slot while the deposit is
        # paid; the expiry sweeper releases it if it is not.
        initial = BookingStatus.PENDING_PAYMENT
    else:
        initial = BookingStatus.CONFIRMED
    booking: Booking | None = None
    lines: list[BookingAddOn] = []
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
            price_minor=price_minor,
            deposit_minor=deposit,
            deposit_to_business_minor=to_business,
            deposit_non_refundable=profile.deposit_non_refundable,
            pay_after_acceptance=request and deposit > 0,
            currency=profile.currency,
            notes=payload.notes.strip() if payload.notes else None,
            manage_token_hash=token_hash,
            returning_client_flagged_at=(
                service.as_naive_utc(moment) if flag_returning else None
            ),
        )
        try:
            # A savepoint: losing a race to the exclusion constraint rolls back
            # only this attempt, then the next free provider is tried.
            async with session.begin_nested():
                session.add(attempt)
                await session.flush()
                # The lines need the booking's id, which the flush above assigned.
                attempt_lines = [
                    BookingAddOn(
                        booking_id=attempt.id,
                        organisation_id=profile.organisation_id,
                        service_id=add_on_service.id,
                        name=add_on_service.name,
                        duration_min=add_on_service.duration_min,
                        price_minor=add_on_service.price_minor,
                    )
                    for add_on_service in chosen
                ]
                session.add_all(attempt_lines)
                await session.flush()
        except DBAPIError as error:
            if not service.is_overlap_violation(error):
                raise
            continue
        booking = attempt
        lines = attempt_lines
        break
    if booking is None:
        raise BookingConflictError(SLOT_TAKEN)

    # No extra history event for a returning client: the event count feeds the
    # public ICS SEQUENCE, so one more row would tell the requester the email has
    # booked here before. The flag column alone marks it for staff.
    record_event(session, booking, None, initial, note="Booked online")
    await emit_webhook(
        session, booking, "booking.created", event_id=f"booking.created:{booking.id}"
    )
    provider = await session.get(Provider, booking.provider_id)
    assert provider is not None
    managed = Managed(booking, profile, svc, provider, customer, contact, tuple(lines))
    checkout_url: str | None = None
    if initial is BookingStatus.PENDING_PAYMENT:
        # No emails yet: they are queued when the deposit is paid
        # (deposits.confirm_paid), so an abandoned checkout mails nobody.
        checkout_url = await deposit_payments.start_deposit(
            session,
            booking,
            contact.email,
            title=deposit_payments.checkout_title(booking, svc, profile, deposit),
        )
        # Fix the hold now, from the route the deposit took: a later profile change
        # must not move a hold the customer was already told about.
        await deposit_payments.snapshot_hold(session, profile, booking)
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
        booking=await full_detail(session, managed, moment),
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
    """The booking behind ``token``: a signed manage link (``manage_link``) or the
    legacy random token. Unknown, expired, tampered, cleared and unentitled tokens
    all answer the same 404. Clearing the stored hash (retention) revokes signed
    links too, so there is one switch."""
    if manage_link.is_signed(token):
        booking_id = manage_link.verify(token, now=utc_now())
        if booking_id is None:
            raise BookingNotFoundError("Booking")
        match = and_(Booking.id == booking_id, Booking.manage_token_hash.is_not(None))
    else:
        match = Booking.manage_token_hash == hash_token(token)
    query = (
        select(Booking, BookingProfile, Service, Provider, Customer, Contact)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .join(Service, Service.id == Booking.service_id)
        .join(Provider, Provider.id == Booking.provider_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(match)
    )
    if lock:
        query = query.with_for_update(of=Booking)
    row = (await session.execute(query)).first()
    if row is None:
        raise BookingNotFoundError("Booking")
    booking, profile, svc, provider, customer, contact = row
    await service.require_bookings_entitlement(session, profile, what="Booking")
    lines = await add_on_lines(session, booking.id)
    return Managed(booking, profile, svc, provider, customer, contact, lines)


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
    lines = await add_on_lines(session, booking.id)
    return Managed(booking, profile, svc, provider, customer, contact, lines)


async def get_booking(session: AsyncSession, token: str) -> BookingPublicDetail:
    return await full_detail(session, await load_by_token(session, token), utc_now())


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
        # A repeated cancel is a no-op.
        return await full_detail(session, managed, moment)
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
    return await full_detail(session, managed, moment)


async def move_booking(
    session: AsyncSession, booking: Booking, svc: Service, starts_at: datetime
) -> None:
    """Give ``booking`` a new start (naive UTC), keeping provider and service.

    The ``booking_no_overlap`` constraint is the last word: a clash (or the
    deadlock two racing moves can end in) is a 409 and leaves the booking as it
    was. The caller records the event and queues the mail."""
    # The booking keeps its add-ons, so its length is the main service's plus
    # the add-on lines it already has (stored at booking time).
    extra = await service.booking_add_on_minutes(session, booking.id)
    ends_at = starts_at + timedelta(minutes=svc.duration_min + extra)
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
        return await full_detail(session, managed, moment)
    open_providers = await _candidate_providers(
        session,
        managed.profile,
        service_id=svc.id,
        provider_id=booking.provider_id,
        starts_at=starts_at,
        now=moment,
        exclude_booking_id=booking.id,
        extra_minutes=sum(a.duration_min for a in managed.add_ons),
    )
    if booking.provider_id not in open_providers:
        raise BookingConflictError(SLOT_TAKEN)

    previous, previous_ends = booking.starts_at, booking.ends_at
    await move_booking(session, booking, svc, starts_at)
    current = BookingStatus(booking.status)
    event = record_event(
        session,
        booking,
        current,
        current,
        note=f"Rescheduled from {previous:%Y-%m-%dT%H:%MZ} by customer",
    )
    # Keyed to this move's own history row, not to the new start time: moving
    # 10:00 to 11:00 and back to 10:00 must notify three times, and keys built
    # from the start time would make the third collide with the first.
    move = event.id
    await emit_webhook(
        session,
        booking,
        "booking.rescheduled",
        previous_starts_at=previous,
        previous_ends_at=previous_ends,
        event_id=f"booking.rescheduled:{booking.id}:{move}",
    )
    mail = build_mail(managed)
    await queue_customer_email(
        session,
        managed,
        emails.customer_rescheduled(mail, confirmed=current is BookingStatus.CONFIRMED),
        f"booking-rescheduled:{booking.id}:{move}",
    )
    await queue_studio_email(
        session,
        managed,
        emails.studio_notice(mail, event="rescheduled"),
        f"booking-studio-rescheduled:{booking.id}:{move}",
    )
    await session.flush()
    return await full_detail(session, managed, moment)


def _ics_description(managed: Managed) -> str:
    text = f"With {managed.provider.name}."
    if managed.add_ons:
        names = ", ".join(line.name for line in managed.add_ons)
        text += f" Add-ons: {names}."
    return text


async def booking_ics(
    session: AsyncSession, token: str, *, now: datetime | None = None
) -> str:
    managed = await load_by_token(session, token)
    booking = managed.booking
    changes = await session.scalar(
        select(func.count())
        .select_from(BookingEvent)
        .where(
            BookingEvent.booking_id == booking.id,
            BookingEvent.staff_note.is_(False),
        )
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
        description=_ics_description(managed),
        stamp=now or utc_now(),
        status=ics_status,
        sequence=max((changes or 1) - 1, 0),
    )
