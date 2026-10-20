"""Bookings tables (main database, ``bookings`` schema; ADR-0024).

Every row belongs to one platform organisation. Datetimes are naive UTC; working
hours are local wall-clock times in the profile's timezone. A booking stores the
range it blocks (``blocked_from``/``blocked_until``, buffers included) so one
Postgres exclusion constraint forbids double-booking a provider.
"""

import uuid
from datetime import datetime, time
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column

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


class BookingSource(str, Enum):
    ONLINE = "online"
    STUDIO = "studio"


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
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


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


class Customer(Base):
    """A business's customer. Personal data scoped to one organisation."""

    __tablename__ = "customer"
    __table_args__ = (
        sa.Index("ix_customer_org_email_hash", "organisation_id", "email_hash"),
        SCHEMA,
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320))
    email_hash: Mapped[str | None] = mapped_column(String(64))
    phone: Mapped[str | None] = mapped_column(String(40))
    marketing_consent: Mapped[bool] = mapped_column(default=False)
    #: The organisation's contact-book record for this person (PF3), when the
    #: organisation has the `contacts` product. The contact is erased or merged
    #: independently of bookings, so deleting it only clears this link.
    contact_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("org.contact.id", ondelete="SET NULL"), index=True
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
    currency: Mapped[str] = mapped_column(String(3))
    notes: Mapped[str | None] = mapped_column(sa.Text)
    manage_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    cancel_reason: Mapped[str | None] = mapped_column(String(300))
    cancelled_at: Mapped[datetime | None]
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
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
