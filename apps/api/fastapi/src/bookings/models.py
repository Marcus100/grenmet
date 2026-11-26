"""Bookings tables (main database, ``bookings`` schema; ADR-0024).

Every row belongs to one platform organisation. Datetimes are naive UTC; working
hours are local wall-clock times in the profile's timezone. A booking stores the
range it blocks (``blocked_from``/``blocked_until``, buffers included) so one
Postgres exclusion constraint forbids double-booking a provider.
"""

import uuid
from datetime import date, datetime, time
from enum import Enum
from typing import cast

import sqlalchemy as sa
from sqlalchemy import ARRAY, ForeignKey, String
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from src.contacts import references as contact_references
from src.orm import Base
from src.utils.datetime import utc_now
from src.utils.timezones import DEFAULT_TIMEZONE


class BookingExceptionKind(str, Enum):
    TIME_OFF = "time_off"
    EXTRA_HOURS = "extra_hours"


class BookingStatus(str, Enum):
    PENDING_PAYMENT = "pending_payment"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    COMPLETED = "completed"


class BookingPaymentMode(str, Enum):
    """What an online booking pays when it is made (owner decision 15 Nov 2026).

    ``deposit``: each service's own deposit (0 = nothing), the behaviour before
    this setting existed. ``full_price``: the service price, but only while the
    card rail (Stripe, test mode) is available; otherwise it acts as ``deposit``.
    """

    DEPOSIT = "deposit"
    FULL_PRICE = "full_price"


class BookingDepositCollection(str, Enum):
    """Who collects the deposit. ``online``: Barrels does, through payments (today's
    behaviour). ``business``: the customer pays the business by hand (PayPal, bank
    transfer, cash), outside Barrels; the booking only shows the amount and the
    business's instructions."""

    ONLINE = "online"
    BUSINESS = "business"


class BookingDepositMode(str, Enum):
    """The business-wide deposit rule (owner request 23 Nov 2026), used for a
    service only when its own ``deposit_minor`` is 0.

    ``none`` (default): no rule. ``percent``: ``deposit_percent`` of the price,
    rounded up to whole currency units. ``fixed``: ``deposit_fixed_minor`` per
    booking. Either way the deposit never exceeds the price."""

    NONE = "none"
    PERCENT = "percent"
    FIXED = "fixed"


class BookingDepositReceivedMethod(str, Enum):
    """How a deposit paid to the business by hand arrived (staff record it; no money
    moves through Barrels)."""

    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    PAYPAL = "paypal"
    OTHER = "other"


class BookingSource(str, Enum):
    ONLINE = "online"
    STUDIO = "studio"


class BookingBusinessType(str, Enum):
    """The fixed business types a home page visitor filters by (owner request
    24 Nov 2026). Null on the profile means not chosen. Free-text ``category`` is
    separate and unchanged."""

    BEAUTY = "beauty"
    HAIR = "hair"
    HEALTH = "health"
    FITNESS = "fitness"
    AUTO = "auto"
    HOME_SERVICES = "home_services"
    LESSONS = "lessons"
    PROFESSIONAL = "professional"
    TOURS = "tours"
    EVENTS = "events"
    OTHER = "other"


#: Statuses that hold a provider's time.
ACTIVE_STATUSES = (
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
)


def _values(enum: type[Enum] | tuple[Enum, ...]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


SCHEMA = {"schema": "bookings"}


class BookingProfile(Base):
    """One per organisation: public identity and booking rules."""

    __tablename__ = "profile"
    __table_args__ = (
        sa.CheckConstraint("slot_step_min BETWEEN 5 AND 240", name="slot_step"),
        sa.CheckConstraint("lead_time_min >= 0", name="lead_time"),
        sa.CheckConstraint("horizon_days BETWEEN 1 AND 365", name="horizon"),
        sa.CheckConstraint("cancel_cutoff_hours >= 0", name="cancel_cutoff"),
        sa.CheckConstraint(
            f"payment_at_booking IN ({_values(BookingPaymentMode)})",
            name="payment_at_booking",
        ),
        sa.CheckConstraint(
            f"deposit_mode IN ({_values(BookingDepositMode)})",
            name="deposit_mode",
        ),
        sa.CheckConstraint(
            "deposit_mode = 'none'"
            " OR (deposit_mode = 'percent' AND deposit_percent IS NOT NULL"
            " AND deposit_percent BETWEEN 1 AND 100)"
            " OR (deposit_mode = 'fixed' AND deposit_fixed_minor IS NOT NULL"
            " AND deposit_fixed_minor > 0)",
            name="deposit_rule",
        ),
        sa.CheckConstraint(
            "deposit_min_price_minor IS NULL OR deposit_min_price_minor > 0",
            name="deposit_min_price",
        ),
        sa.CheckConstraint(
            "booking_policy IS NULL OR char_length(booking_policy) BETWEEN 1 AND 1000",
            name="booking_policy",
        ),
        sa.CheckConstraint(
            f"deposit_collection IN ({_values(BookingDepositCollection)})",
            name="deposit_collection",
        ),
        sa.CheckConstraint(
            "deposit_instructions IS NULL"
            " OR char_length(deposit_instructions) BETWEEN 1 AND 500",
            name="deposit_instructions",
        ),
        sa.CheckConstraint(
            "late_fee_minor IS NULL OR late_fee_minor > 0", name="late_fee"
        ),
        sa.CheckConstraint(
            "late_grace_min IS NULL OR late_grace_min BETWEEN 0 AND 240",
            name="late_grace",
        ),
        sa.CheckConstraint(
            "deposit_hold_minutes IS NULL OR deposit_hold_minutes BETWEEN 1 AND 10080",
            name="deposit_hold_minutes",
        ),
        sa.CheckConstraint(
            "brand_color IS NULL OR brand_color ~ '^#[0-9a-f]{6}$'",
            name="brand_color",
        ),
        sa.CheckConstraint(
            f"business_type IS NULL OR business_type IN ({_values(BookingBusinessType)})",
            name="business_type",
        ),
        sa.CheckConstraint(
            "pending_expiry_hours IS NULL OR pending_expiry_hours BETWEEN 1 AND 168",
            name="pending_expiry_hours",
        ),
        sa.CheckConstraint(
            "max_open_per_customer BETWEEN 1 AND 20",
            name="max_open_per_customer",
        ),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), unique=True
    )
    public_slug: Mapped[str] = mapped_column(String(60), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(default=False)
    timezone: Mapped[str] = mapped_column(String(64), default=DEFAULT_TIMEZONE)
    currency: Mapped[str] = mapped_column(String(3), default="XCD")
    slot_step_min: Mapped[int] = mapped_column(default=30)
    lead_time_min: Mapped[int] = mapped_column(default=120)
    horizon_days: Mapped[int] = mapped_column(default=60)
    cancel_cutoff_hours: Mapped[int] = mapped_column(default=24)
    requires_confirmation: Mapped[bool] = mapped_column(default=False)
    notify_email: Mapped[str | None] = mapped_column(String(320))
    #: Where the business's own frontend shows "manage my booking", with a
    #: ``{token}`` placeholder. Emails link here; the API never assumes a site.
    manage_url_template: Mapped[str | None] = mapped_column(String(500))
    #: How customers reach the business by hand, shown on its public pages when
    #: set (``contact.py`` normalises them): E.164 phone, WhatsApp digits,
    #: Instagram handle without ``@``, email.
    contact_phone: Mapped[str | None] = mapped_column(String(16))
    contact_whatsapp: Mapped[str | None] = mapped_column(String(15))
    contact_instagram: Mapped[str | None] = mapped_column(String(30))
    contact_email: Mapped[str | None] = mapped_column(String(254))
    #: The business's accent in its emails: ``#rrggbb``, lower case. Mail falls back to
    #: the Barrels navy when it fails 4.5:1 against white (``src/email_colour.py``).
    brand_color: Mapped[str | None] = mapped_column(String(7))
    #: A completed ``booking-logo`` upload (``src/storage``); no cross-database FK.
    logo_file_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    #: A completed ``booking-cover`` upload: the wide photo of the home page card and
    #: storefront. No cross-database FK, same as the logo.
    cover_file_id: Mapped[uuid.UUID | None] = mapped_column(default=None)
    #: ``BookingBusinessType``, the home page filter; null until chosen.
    business_type: Mapped[str | None] = mapped_column(String(20), default=None)
    #: Add-ons (owner request 23 Nov 2026): off by default. While off, add-on
    #: services are never offered or accepted, so nothing changes for the business.
    add_ons_enabled: Mapped[bool] = mapped_column(
        default=False, server_default=sa.false()
    )
    #: Opt-in to the Barrels Bookings home page listing (off by default). The
    #: listing shows only enabled, entitled, active businesses with a service.
    listed: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    #: Listing approval (ADR-0066): Barrels staff approve a listed business under
    #: ``bookings.listing.approve`` before it shows on the home page. Null means not
    #: approved. The migration approved every profile that existed before it.
    listing_approved_at: Mapped[datetime | None] = mapped_column(default=None)
    listing_approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), default=None
    )
    #: Set when the last owner of a self-created business deleted their account. Staff
    #: review the business; nothing is deleted (ADR-0066 item 7).
    owner_left_at: Mapped[datetime | None] = mapped_column(default=None)
    #: Set when a self sign-up's name is refused by the sender-name guard: the business
    #: exists, its mail falls back to the default sender, and staff review it (ADR-0066).
    sender_name_flagged_at: Mapped[datetime | None] = mapped_column(default=None)
    #: Paused (ADR-0066 item 6): set by ``paused.py`` while the subscription switch is on
    #: and a trial or subscription business has no trial, no active or past-due
    #: subscription and an expired grace. Public booking is refused; nothing is deleted.
    paused_at: Mapped[datetime | None] = mapped_column(default=None)
    #: The provider named after the owner when a self-created business signs up; renamed
    #: "Staff" when that owner leaves. Null for every other business.
    owner_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bookings.provider.id", ondelete="SET NULL"), default=None
    )
    #: Listing text: a short category (chips on the home page), a one-line
    #: description and a city. Blank means not shown.
    category: Mapped[str | None] = mapped_column(String(80))
    short_description: Mapped[str | None] = mapped_column(String(160))
    city: Mapped[str | None] = mapped_column(String(80))
    #: ``BookingPaymentMode``: what an online booking pays when it is made.
    payment_at_booking: Mapped[str] = mapped_column(
        String(20),
        default=BookingPaymentMode.DEPOSIT.value,
        server_default=BookingPaymentMode.DEPOSIT.value,
    )
    #: ``BookingDepositMode``: the business-wide deposit rule. ``none`` by default,
    #: so existing businesses keep their per-service deposits and nothing else.
    deposit_mode: Mapped[str] = mapped_column(
        String(10),
        default=BookingDepositMode.NONE.value,
        server_default=BookingDepositMode.NONE.value,
    )
    #: 1 to 100, used when ``deposit_mode`` is ``percent``.
    deposit_percent: Mapped[int | None] = mapped_column(default=None)
    #: Minor units per booking, used when ``deposit_mode`` is ``fixed``.
    deposit_fixed_minor: Mapped[int | None] = mapped_column(default=None)
    #: The business-wide rule skips services priced below this (minor units); null
    #: means no minimum. A service's own deposit is never affected.
    deposit_min_price_minor: Mapped[int | None] = mapped_column(default=None)
    #: When true a paid deposit is kept on cancellation (owner request 23 Nov 2026).
    #: Off by default, so every business keeps today's refund policy.
    deposit_non_refundable: Mapped[bool] = mapped_column(
        default=False, server_default=sa.false()
    )
    #: Plain-text booking policy (late fees and so on), shown before booking and in
    #: the confirmation. Never HTML: every surface renders it as text.
    booking_policy: Mapped[str | None] = mapped_column(String(1000), default=None)
    #: ``BookingDepositCollection``: ``online`` (default) or ``business`` (display only).
    deposit_collection: Mapped[str] = mapped_column(
        String(20),
        default=BookingDepositCollection.ONLINE.value,
        server_default=BookingDepositCollection.ONLINE.value,
    )
    #: Plain text: how to pay the deposit to the business. Never HTML.
    deposit_instructions: Mapped[str | None] = mapped_column(String(500), default=None)
    #: The late-arrival fee (minor units) and the minutes of grace before it applies.
    late_fee_minor: Mapped[int | None] = mapped_column(default=None)
    late_grace_min: Mapped[int | None] = mapped_column(default=None)
    #: Minutes an unpaid deposit holds the slot before the sweeper cancels it (1 to
    #: 10080 = 7 days). Null means ``DEPOSIT_HOLD_MINUTES`` (30). An online checkout
    #: is capped at 120 whatever is stored (``deposit_payments.hold_minutes_for``). Business
    #: collected deposits are never held, so it has no effect there.
    deposit_hold_minutes: Mapped[int | None] = mapped_column(default=None)
    #: Hours a booking request waits for the business to confirm it before it
    #: expires (1 to 168). Null: it expires only at its start time. A request whose
    #: start has passed always expires (``lifecycle.expire_stale_requests``).
    #: No Python-side default (``service.upsert_profile`` writes a null window as SQL
    #: NULL); the server default covers writers that leave the column out.
    pending_expiry_hours: Mapped[int | None] = mapped_column(server_default="24")
    #: How many future bookings (pending, pending payment or confirmed) one customer
    #: may hold with the business before a public booking is refused (1 to 20).
    max_open_per_customer: Mapped[int] = mapped_column(default=3, server_default="3")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Service(Base):
    __tablename__ = "service"
    __table_args__ = (
        sa.CheckConstraint("duration_min BETWEEN 5 AND 720", name="duration"),
        sa.CheckConstraint(
            "buffer_before_min >= 0 AND buffer_after_min >= 0", name="buffers"
        ),
        sa.CheckConstraint(
            "price_minor >= 0 AND deposit_minor >= 0 AND deposit_minor <= price_minor",
            name="money",
        ),
        sa.CheckConstraint(
            "first_visit_lead_days IS NULL OR first_visit_lead_days BETWEEN 0 AND 60",
            name="first_visit_lead_days",
        ),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str | None] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(sa.Text)
    duration_min: Mapped[int]
    buffer_before_min: Mapped[int] = mapped_column(default=0)
    buffer_after_min: Mapped[int] = mapped_column(default=0)
    price_minor: Mapped[int] = mapped_column(default=0)
    deposit_minor: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
    #: An add-on is booked with a main service, never alone (``add_ons.py``).
    is_add_on: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    #: A main service that is also offered as an add-on (booked alone it is a main
    #: service; attached it is an add-on). Always false when ``is_add_on`` is true.
    also_add_on: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    #: For an add-on (``is_add_on`` or ``also_add_on``): the main-service categories
    #: it is offered with. Null or empty means any main service.
    add_on_categories: Mapped[list[str] | None] = mapped_column(
        ARRAY(String(80)), default=None
    )
    #: Public bookings of this service are always requests staff confirm, and one
    #: from a returning client (a confirmed or completed booking) is flagged for
    #: staff. Never refused, so nothing reveals a client's history.
    new_clients_only: Mapped[bool] = mapped_column(
        default=False, server_default=sa.false()
    )
    #: Informational: this service is ideally booked at least this many days before
    #: the client's first appointment in ``first_visit_categories``. Not enforced.
    first_visit_lead_days: Mapped[int | None] = mapped_column(default=None)
    first_visit_categories: Mapped[list[str] | None] = mapped_column(
        ARRAY(String(80)), default=None
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class BookingAddOn(Base):
    """An add-on line of a booking, with its name, length and price copied at
    booking time, so later edits to the service never change the booking."""

    __tablename__ = "booking_add_on"
    __table_args__ = (
        sa.UniqueConstraint("booking_id", "service_id", name="booking_add_on_key"),
        sa.CheckConstraint("duration_min > 0", name="duration"),
        sa.CheckConstraint("price_minor >= 0", name="price"),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.booking.id", ondelete="CASCADE"), index=True
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.service.id"))
    name: Mapped[str] = mapped_column(String(120))
    duration_min: Mapped[int]
    price_minor: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class Provider(Base):
    """A person (or chair, bay, room) who performs services."""

    __tablename__ = "provider"
    __table_args__ = (SCHEMA,)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    #: Optional link to the staff member's Barrels ID account.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class ProviderService(Base):
    __tablename__ = "provider_service"
    __table_args__ = (SCHEMA,)

    provider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.provider.id", ondelete="CASCADE"), primary_key=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.service.id", ondelete="CASCADE"), primary_key=True
    )


class WorkingHours(Base):
    """One working period on a weekday (Monday = 0). Gaps between periods are breaks."""

    __tablename__ = "working_hours"
    __table_args__ = (
        sa.CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday"),
        sa.CheckConstraint("end_time > start_time", name="period"),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.provider.id", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int]
    start_time: Mapped[time] = mapped_column(sa.Time)
    end_time: Mapped[time] = mapped_column(sa.Time)


class AvailabilityException(Base):
    """Dated time off, or extra hours outside the weekly plan."""

    __tablename__ = "availability_exception"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(BookingExceptionKind)})", name="kind"),
        sa.CheckConstraint("ends_at > starts_at", name="period"),
        sa.Index(
            "ix_availability_exception_provider_starts", "provider_id", "starts_at"
        ),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.provider.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(20))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class BusinessClosure(Base):
    """A whole-business closure (BK-20): local days closed for every provider.

    ``starts_on`` and ``ends_on`` are the organisation's calendar days, both
    inclusive. Overlapping closures are allowed; each removes its own days.
    """

    __tablename__ = "business_closure"
    __table_args__ = (
        sa.CheckConstraint("ends_on >= starts_on", name="period"),
        sa.Index("ix_business_closure_org_starts", "organisation_id", "starts_on"),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    starts_on: Mapped[date]
    ends_on: Mapped[date]
    reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class CalendarFeed(Base):
    """The organisation's private calendar feed: one row per organisation.

    Only the SHA-256 of the URL token is stored (the token is shown once, when
    created or rotated). Rotating replaces ``token_hash``, so the old URL stops
    matching.
    """

    __tablename__ = "calendar_feed"
    __table_args__ = (
        sa.UniqueConstraint("organisation_id", name="calendar_feed_organisation_key"),
        sa.UniqueConstraint("token_hash", name="calendar_feed_token_hash_key"),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    token_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    rotated_at: Mapped[datetime | None]


class Customer(Base):
    """A business's customer: the booking-side role of one contact (ADR-0028)."""

    __tablename__ = "customer"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "contact_id", name="customer_org_contact_key"
        ),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    #: The person, in the organisation's contact book (ADR-0028). Name, email,
    #: phone and consent live only there; this row keeps booking facts. A merge
    #: re-points it (``contacts.references``); erasure blanks the contact in place.
    contact_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.contact.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    last_booked_at: Mapped[datetime | None]


class Booking(Base):
    __tablename__ = "booking"
    __table_args__ = (
        sa.CheckConstraint(f"status IN ({_values(BookingStatus)})", name="status"),
        sa.CheckConstraint(f"source IN ({_values(BookingSource)})", name="source"),
        sa.CheckConstraint("ends_at > starts_at", name="period"),
        sa.CheckConstraint(
            "deposit_to_business_minor >= 0", name="deposit_to_business"
        ),
        sa.CheckConstraint(
            f"deposit_received_method IS NULL OR deposit_received_method IN "
            f"({_values(BookingDepositReceivedMethod)})",
            name="deposit_received_method",
        ),
        sa.CheckConstraint(
            "(deposit_received_at IS NULL) = (deposit_received_method IS NULL)",
            name="deposit_received_pair",
        ),
        sa.CheckConstraint(
            "deposit_received_reference IS NULL"
            " OR char_length(deposit_received_reference) BETWEEN 1 AND 100",
            name="deposit_received_reference",
        ),
        sa.CheckConstraint(
            "blocked_from <= starts_at AND blocked_until >= ends_at", name="blocked"
        ),
        sa.UniqueConstraint(
            "organisation_id", "idempotency_key", name="booking_idempotency_key"
        ),
        sa.Index("ix_booking_org_starts", "organisation_id", "starts_at"),
        ExcludeConstraint(
            ("provider_id", "="),
            (sa.text("tsrange(blocked_from, blocked_until)"), "&&"),
            name="booking_no_overlap",
            using="gist",
            where=sa.text(f"status IN ({_values(ACTIVE_STATUSES)})"),
        ),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.provider.id"))
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.service.id"))
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.customer.id"), index=True
    )
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    blocked_from: Mapped[datetime]
    blocked_until: Mapped[datetime]
    status: Mapped[str] = mapped_column(String(20), default=BookingStatus.PENDING.value)
    source: Mapped[str] = mapped_column(String(20), default=BookingSource.ONLINE.value)
    price_minor: Mapped[int] = mapped_column(default=0)
    deposit_minor: Mapped[int] = mapped_column(default=0)
    #: Display only: the deposit the customer was told to pay the business by hand
    #: (profile ``deposit_collection`` ``business``). Nothing moves through Barrels.
    deposit_to_business_minor: Mapped[int] = mapped_column(
        default=0, server_default="0"
    )
    #: The deposit terms this booking was made on, copied from the profile at
    #: creation. A later profile change never changes a booking already made.
    deposit_non_refundable: Mapped[bool] = mapped_column(
        default=False, server_default=sa.false()
    )
    #: Staff marked the business-held deposit (``deposit_to_business_minor``) as
    #: received. Null until then; the method and reference are staff only.
    deposit_received_at: Mapped[datetime | None] = mapped_column(default=None)
    deposit_received_method: Mapped[str | None] = mapped_column(
        String(20), default=None
    )
    deposit_received_reference: Mapped[str | None] = mapped_column(
        String(100), default=None
    )
    currency: Mapped[str] = mapped_column(String(3))
    notes: Mapped[str | None] = mapped_column(sa.Text)
    manage_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    cancel_reason: Mapped[str | None] = mapped_column(String(300))
    cancelled_at: Mapped[datetime | None]
    #: Staff only, never public: set when a returning client requested a
    #: new-clients-only service (so the request is held for staff to decide).
    returning_client_flagged_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class BookingEvent(Base):
    """Append-only history of a booking's status changes."""

    __tablename__ = "booking_event"
    __table_args__ = (SCHEMA,)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.booking.id", ondelete="CASCADE"), index=True
    )
    organisation_id: Mapped[str] = mapped_column(String(100))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    actor_user_id: Mapped[uuid.UUID | None]
    note: Mapped[str | None] = mapped_column(String(300))
    #: A staff-only note that changes no status. Customer calendar feeds count
    #: only the other rows (their ICS SEQUENCE), so this never sends an update.
    staff_note: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


async def _merge_customers(session: AsyncSession, from_id: str, to_id: str) -> None:
    """A contact merge: keep one customer per contact. If both contacts have a
    customer, the dropped one's bookings move to the kept one and its row goes."""
    dropped = list(
        await session.scalars(
            sa.select(Customer.id).where(Customer.contact_id == from_id)
        )
    )
    if not dropped:
        return
    kept = await session.scalar(
        sa.select(Customer.id)
        .where(Customer.contact_id == to_id)
        .order_by(Customer.created_at)
        .limit(1)
    )
    if kept is None:
        first, *extra = dropped
        await session.execute(
            sa.update(Customer).where(Customer.id == first).values(contact_id=to_id)
        )
        dropped = extra
        kept = first
    if dropped:
        await session.execute(
            sa.update(Booking)
            .where(Booking.customer_id.in_(dropped))
            .values(customer_id=kept)
        )
        await session.execute(sa.delete(Customer).where(Customer.id.in_(dropped)))


contact_references.register(cast(sa.Table, Customer.__table__), merge=_merge_customers)
