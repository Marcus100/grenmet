import uuid
from datetime import date, time
from typing import Annotated, Self

from pydantic import EmailStr, Field, field_validator, model_validator

from src.models import BaseModel, UtcDateTime
from src.organisations.models import MembershipRole
from src.utils.timezones import is_valid_timezone

from .models import BookingExceptionKind, BookingSource, BookingStatus

Name = Annotated[str, Field(min_length=1, max_length=120)]
Slug = Annotated[str, Field(pattern=r"^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$")]
Minutes = Annotated[int, Field(ge=0, le=1440)]
Minor = Annotated[int, Field(ge=0, le=100_000_000)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
#: Path words under /bookings/public that a slug must not shadow.
RESERVED_SLUGS = frozenset({"bookings"})


# --- caller's organisations -------------------------------------------------------


class BookingMyOrganisation(BaseModel):
    """An organisation the caller can open in the studio, with their role in it."""

    id: str
    name: str
    slug: str
    role: MembershipRole


# --- profile ---------------------------------------------------------------------


class BookingProfileUpdate(BaseModel):
    """Create or replace the organisation's booking profile."""

    public_slug: Slug
    display_name: Name
    enabled: bool = False
    timezone: str = "America/Grenada"
    currency: Currency = "XCD"
    slot_step_min: Annotated[int, Field(ge=5, le=240)] = 30
    lead_time_min: Minutes = 120
    horizon_days: Annotated[int, Field(ge=1, le=365)] = 60
    cancel_cutoff_hours: Annotated[int, Field(ge=0, le=720)] = 24
    requires_confirmation: bool = False
    notify_email: EmailStr | None = None
    manage_url_template: (
        Annotated[
            str,
            Field(
                max_length=500,
                pattern=r"^https://[^\s]+\{token\}[^\s]*$",
                description=(
                    "HTTPS page on the business's own frontend that manages a "
                    "booking; must contain {token}."
                ),
            ),
        ]
        | None
    ) = None

    @field_validator("public_slug")
    @classmethod
    def _not_reserved(cls, value: str) -> str:
        if value in RESERVED_SLUGS:
            raise ValueError("That booking address is reserved")
        return value

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if not is_valid_timezone(value):
            raise ValueError("Unknown IANA timezone")
        return value


class BookingProfilePublic(BookingProfileUpdate):
    id: uuid.UUID
    organisation_id: str
    created_at: UtcDateTime
    updated_at: UtcDateTime


# --- services --------------------------------------------------------------------


class BookingServiceCreate(BaseModel):
    name: Name
    category: Annotated[str, Field(max_length=80)] | None = None
    description: Annotated[str, Field(max_length=2000)] | None = None
    duration_min: Annotated[int, Field(ge=5, le=720)]
    buffer_before_min: Annotated[int, Field(ge=0, le=240)] = 0
    buffer_after_min: Annotated[int, Field(ge=0, le=240)] = 0
    price_minor: Minor = 0
    deposit_minor: Minor = 0
    active: bool = True
    sort_order: Annotated[int, Field(ge=0, le=10_000)] = 0

    @model_validator(mode="after")
    def _deposit_within_price(self) -> Self:
        if self.deposit_minor > self.price_minor:
            raise ValueError("The deposit cannot exceed the price")
        return self


class BookingServiceUpdate(BaseModel):
    name: Name | None = None
    category: Annotated[str, Field(max_length=80)] | None = None
    description: Annotated[str, Field(max_length=2000)] | None = None
    duration_min: Annotated[int, Field(ge=5, le=720)] | None = None
    buffer_before_min: Annotated[int, Field(ge=0, le=240)] | None = None
    buffer_after_min: Annotated[int, Field(ge=0, le=240)] | None = None
    price_minor: Minor | None = None
    deposit_minor: Minor | None = None
    active: bool | None = None
    sort_order: Annotated[int, Field(ge=0, le=10_000)] | None = None


class BookingServicePublic(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None
    description: str | None
    duration_min: int
    buffer_before_min: int
    buffer_after_min: int
    price_minor: int
    deposit_minor: int
    active: bool
    sort_order: int


# --- providers and hours ---------------------------------------------------------


class BookingProviderCreate(BaseModel):
    name: Name
    user_id: uuid.UUID | None = None
    active: bool = True
    sort_order: Annotated[int, Field(ge=0, le=10_000)] = 0
    service_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class BookingProviderUpdate(BaseModel):
    name: Name | None = None
    active: bool | None = None
    sort_order: Annotated[int, Field(ge=0, le=10_000)] | None = None
    service_ids: Annotated[list[uuid.UUID], Field(max_length=200)] | None = None


class BookingProviderPublic(BaseModel):
    id: uuid.UUID
    name: str
    user_id: uuid.UUID | None
    active: bool
    sort_order: int
    service_ids: list[uuid.UUID]


class BookingWorkingPeriodIn(BaseModel):
    weekday: Annotated[int, Field(ge=0, le=6, description="Monday = 0")]
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class BookingWorkingHoursUpdate(BaseModel):
    """The provider's complete weekly plan; replaces what was there."""

    periods: Annotated[list[BookingWorkingPeriodIn], Field(max_length=70)]

    @model_validator(mode="after")
    def _no_overlap(self) -> Self:
        by_day: dict[int, list[BookingWorkingPeriodIn]] = {}
        for period in self.periods:
            by_day.setdefault(period.weekday, []).append(period)
        for periods in by_day.values():
            periods.sort(key=lambda p: p.start_time)
            for earlier, later in zip(periods, periods[1:], strict=False):
                if later.start_time < earlier.end_time:
                    raise ValueError("Working periods on the same day overlap")
        return self


class BookingWorkingPeriodPublic(BaseModel):
    weekday: int
    start_time: time
    end_time: time


class BookingExceptionCreate(BaseModel):
    kind: BookingExceptionKind
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    reason: Annotated[str, Field(max_length=200)] | None = None

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class BookingExceptionPublic(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    kind: BookingExceptionKind
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    reason: str | None


# --- organisation agenda -----------------------------------------------------------


class BookingAgendaItem(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    service_id: uuid.UUID
    service_name: str
    customer_id: uuid.UUID
    customer_name: str
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    status: BookingStatus
    source: BookingSource
    price_minor: int
    deposit_minor: int
    currency: str


class BookingAgendaDay(BaseModel):
    day: date = Field(description="Local date in the profile's timezone.")
    bookings: list[BookingAgendaItem]


class BookingAgenda(BaseModel):
    """Bookings grouped by local day. `total` counts every match so a client
    can page with `limit` and `offset`; days arrive in order and only days with
    bookings are listed."""

    timezone: str
    from_date: date
    to_date: date
    total: int
    limit: int
    offset: int
    days: list[BookingAgendaDay]


# --- studio actions (B5) -------------------------------------------------------------


class BookingStudioDecline(BaseModel):
    reason: str = Field(
        min_length=1,
        max_length=300,
        description="Why the request is declined. Shown to the customer in the email.",
    )


class BookingStudioCancel(BaseModel):
    reason: str = Field(
        min_length=1,
        max_length=300,
        description="Why the booking is cancelled. Shown to the customer in the email.",
    )
    refund_deposit: bool | None = Field(
        default=None,
        description=(
            "Whether to refund a captured deposit. Left out, the business policy "
            "applies: refunded when the booking starts at least "
            "`cancel_cutoff_hours` from now, kept inside the cutoff."
        ),
    )


class BookingStudioCustomer(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None


class BookingStudioEvent(BaseModel):
    from_status: BookingStatus | None
    to_status: BookingStatus
    actor_user_id: uuid.UUID | None = Field(
        description="The member who acted; null for the customer, an API key or the system."
    )
    note: str | None
    created_at: UtcDateTime


class BookingStudioDetail(BaseModel):
    """A booking as the business sees it, with the customer's contact details."""

    id: uuid.UUID
    status: BookingStatus
    source: BookingSource
    service_id: uuid.UUID
    service_name: str
    provider_id: uuid.UUID
    provider_name: str
    customer: BookingStudioCustomer
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    timezone: str
    price_minor: int
    deposit_minor: int
    currency: str
    notes: str | None
    cancel_reason: str | None
    cancelled_at: UtcDateTime | None
    created_at: UtcDateTime
    deposit_intent_id: uuid.UUID | None = Field(
        description="The payments intent for the deposit, to record a manual payment."
    )
    deposit_captured_minor: int
    deposit_refunded_minor: int
    events: list[BookingStudioEvent]


# --- public ------------------------------------------------------------------------


class BookingPublicService(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None
    description: str | None
    duration_min: int
    price_minor: int
    deposit_minor: int


class BookingPublicProvider(BaseModel):
    id: uuid.UUID
    name: str
    service_ids: list[uuid.UUID]


class BookingStorefront(BaseModel):
    """What a client site needs to render its booking page."""

    slug: str
    display_name: str
    timezone: str
    currency: str
    cancel_cutoff_hours: int
    services: list[BookingPublicService]
    providers: list[BookingPublicProvider]


class BookingSlot(BaseModel):
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    provider_ids: list[uuid.UUID]


class BookingAvailability(BaseModel):
    timezone: str
    service_id: uuid.UUID
    slots: list[BookingSlot]


# --- public bookings (B3) ---------------------------------------------------------------


class BookingPublicCreate(BaseModel):
    """A customer's booking request. Sent with an `Idempotency-Key` header."""

    service_id: uuid.UUID
    provider_id: uuid.UUID | None = Field(
        default=None, description="Omit to let the business pick any free provider."
    )
    starts_at: UtcDateTime = Field(
        description="A start time from the availability list."
    )
    customer_name: Name
    customer_email: EmailStr = Field(max_length=254)
    customer_phone: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)
    marketing_consent: bool = False
    turnstile_token: str | None = Field(default=None, max_length=2048)
    # Honeypot. Hidden from people; a bot that fills it is silently dropped.
    website: str | None = Field(default=None, max_length=200)


class BookingStudioCreate(BaseModel):
    """A booking the business enters itself: phone, walk-in or a re-entered
    appointment. Sent with an `Idempotency-Key` header."""

    service_id: uuid.UUID
    provider_id: uuid.UUID
    starts_at: UtcDateTime
    customer_name: Name
    customer_email: EmailStr | None = Field(default=None, max_length=254)
    customer_phone: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)
    send_confirmation: bool = Field(
        default=False,
        description=(
            "Email the customer a confirmation with a manage link. Needs "
            "`customer_email`; off by default so re-entering existing "
            "appointments does not mail anyone."
        ),
    )


class BookingPublicCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class BookingPublicReschedule(BaseModel):
    starts_at: UtcDateTime = Field(
        description="A new start time from the availability list."
    )


class BookingPublicDetail(BaseModel):
    """A booking as its customer sees it."""

    id: uuid.UUID
    status: BookingStatus
    service_id: uuid.UUID
    service_name: str
    provider_id: uuid.UUID
    provider_name: str
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    timezone: str
    customer_name: str
    price_minor: int
    deposit_minor: int
    currency: str
    cancel_cutoff_hours: int
    can_cancel: bool = Field(
        description="True while the booking is active and before the cancellation cutoff."
    )


class BookingPublicReceipt(BaseModel):
    """The answer to a new booking. Only the token's hash is stored with the booking."""

    booking: BookingPublicDetail
    manage_token: str = Field(
        description="Secret for the manage, cancel, reschedule and ICS endpoints."
    )
    manage_url: str | None = Field(
        description="The business's own manage page, when it configured one."
    )
    payment_required: bool = Field(
        default=False,
        description=(
            "True when the booking holds the slot but waits for a deposit "
            "(`status` is `pending_payment`). It is cancelled and the slot "
            "released if the deposit is not paid in time."
        ),
    )
    checkout_url: str | None = Field(
        default=None,
        description=(
            "Hosted page where the customer pays the deposit. Null when no online "
            "payment is available and the business records the payment itself."
        ),
    )


# --- settings screen (A1.2) -------------------------------------------------------------


class BookingOrder(BaseModel):
    """Ids of one kind in the order the business wants them listed."""

    ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=500)]

    @field_validator("ids")
    @classmethod
    def _unique(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("Each id may appear only once")
        return value


class BookingProviderSettings(BookingProviderPublic):
    working_hours: list[BookingWorkingPeriodPublic]


class BookingSettings(BaseModel):
    """Everything the settings screen renders, in one call."""

    profile: BookingProfilePublic | None = Field(
        description="Null until the business creates its booking profile."
    )
    services: list[BookingServicePublic]
    providers: list[BookingProviderSettings]
    deposits_available: bool = Field(
        description=(
            "False when the organisation lacks the `payments` entitlement: a "
            "service deposit is stored but not collected."
        )
    )
