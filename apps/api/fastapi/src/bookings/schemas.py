import uuid
from datetime import date, time
from enum import Enum
from typing import Annotated, Literal, Self

from pydantic import EmailStr, Field, RootModel, field_validator, model_validator

from src.email_colour import normalise_hex
from src.models import BaseModel, UtcDateTime
from src.organisations.models import MembershipRole
from src.payments.schemas import ManualPaymentCreate
from src.utils.reserved_names import is_reserved
from src.utils.timezones import is_valid_timezone

from . import contact
from .availability import MAX_CLOSURE_DAYS
from .models import (
    BookingBusinessType,
    BookingDepositMode,
    BookingExceptionKind,
    BookingPaymentMode,
    BookingSource,
    BookingStatus,
)

Name = Annotated[str, Field(min_length=1, max_length=120)]
Slug = Annotated[str, Field(pattern=r"^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$")]
Minutes = Annotated[int, Field(ge=0, le=1440)]
Minor = Annotated[int, Field(ge=0, le=100_000_000)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
AddOnCategories = Annotated[
    list[Annotated[str, Field(min_length=1, max_length=80)]] | None,
    Field(max_length=20),
]
#: Path words of this domain's public routes that a business may not take as its
#: slug: ``/bookings/public/businesses`` is the home page listing, not a storefront.
LISTING_PATH_WORDS = frozenset({"businesses"})


# --- caller's organisations -------------------------------------------------------


class BookingMyOrganisation(BaseModel):
    """An organisation the caller can open in the studio, with their role in it."""

    id: str
    name: str
    slug: str
    role: MembershipRole


#: The starter template keys (``templates.STARTER_TEMPLATES``; a test keeps them equal).
BookingSignupTemplate = Literal[
    "hair-salon",
    "barber",
    "nails",
    "lashes-brows",
    "massage-spa",
    "fitness-coach",
    "tutor",
    "tour-operator",
    "photographer",
    "blank",
]


class BookingSignupCreate(BaseModel):
    """A business signs itself up (ADR-0066): it starts closed and unlisted, on a trial."""

    name: Name = Field(description="The business name, as its customers know it.")
    business_type: BookingBusinessType
    town: Annotated[str, Field(min_length=1, max_length=80)] | None = Field(
        default=None, description="Town or city for the home page card."
    )
    template: BookingSignupTemplate | None = Field(
        default=None,
        description="Starter services for the business type; null starts with none.",
    )
    turnstile_token: str | None = Field(default=None, max_length=2048)


class BookingSignupReceipt(BaseModel):
    """What a sign-up created. ``name_flagged`` means staff will review the name."""

    organisation_id: str
    slug: str
    public_slug: str
    display_name: str
    business_type: BookingBusinessType
    template: BookingSignupTemplate | None
    trial_ends_at: UtcDateTime
    name_flagged: bool


class BookingStarterTemplateService(BaseModel):
    name: str
    duration_min: int
    price_minor: int = Field(description="Suggested price in XCD minor units (cents).")


class BookingStarterTemplate(BaseModel):
    key: BookingSignupTemplate
    label: str
    business_type: BookingBusinessType
    services: list[BookingStarterTemplateService]


# --- the signed-in person's bookings ----------------------------------------------


class BookingMyBooking(BaseModel):
    """One of the caller's bookings, with the business it is with. Carries no
    stored manage token, notes, or other customers' details; ``manage_url`` is a
    freshly signed link to the booking's manage page, the same kind the booking
    email carries."""

    id: uuid.UUID
    status: BookingStatus
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    service_name: str
    business_name: str
    business_slug: str
    payment: BookingPaymentSummary | None = Field(
        default=None,
        description=(
            "What was paid when booking; null when nothing was due at booking "
            "(pay at the business)."
        ),
    )
    manage_url: str | None = Field(
        default=None,
        description=(
            "The booking's manage page (Reschedule, Cancel, Add to calendar), "
            "with a signed link that works until a week after the booking ends. "
            "Null once that window has passed or the stored link was cleared."
        ),
    )


class BookingMyChoice(BaseModel):
    """A service the caller booked with this business, and the provider they had
    for it most recently. Ids only: the page matches them to its own storefront."""

    service_id: uuid.UUID
    provider_id: uuid.UUID
    last_booked_at: UtcDateTime = Field(
        description=(
            "The start time of the latest such booking (when the appointment "
            "was, or is), not when it was made."
        )
    )


class BookingMyChoices(BaseModel):
    """What the caller's own earlier bookings with one business suggest for the
    next one. Built only from bookings whose contact is linked to the caller."""

    phone: str | None = Field(
        description=(
            "The phone number this business has on record for the caller, else "
            "the one on their account; null when neither exists. When more than "
            "one contact record is linked, the most recently booked one with a "
            "number wins."
        )
    )
    recent: list[BookingMyChoice] = Field(
        description=(
            "Up to three distinct services, most recently booked first, each with "
            "the provider used for it last. Only pending, confirmed and "
            "completed bookings count: cancelled (which includes declined and "
            "expired), no-show and unpaid-deposit ones are left out."
        )
    )


class BookingMyBookingList(BaseModel):
    data: list[BookingMyBooking]
    count: int
    page: int
    size: int


# --- profile ---------------------------------------------------------------------


def normalise_policy(value: object) -> object:
    """A booking policy as plain text: line endings become ``\\n``, control
    characters go (tabs and line breaks stay), and the ends are trimmed. Blank is
    None. Nothing is interpreted as HTML; every surface renders it as text."""
    if not isinstance(value, str):
        return value
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    kept = "".join(ch for ch in text if ch in "\n\t" or ch.isprintable())
    return kept.strip() or None


class BookingProfileUpdate(BaseModel):
    """Create or replace the organisation's booking profile."""

    public_slug: Slug = Field(
        description=(
            "Address under the bookings host. Must not be a platform reserved "
            "name such as studio, signin, auth or api (docs/ports.md); a "
            "reserved name is refused with 422."
        )
    )
    display_name: Name
    enabled: bool = False
    timezone: str = "America/Grenada"
    currency: Currency = "XCD"
    slot_step_min: Annotated[int, Field(ge=5, le=240)] = 30
    lead_time_min: Minutes = 120
    horizon_days: Annotated[int, Field(ge=1, le=365)] = 60
    cancel_cutoff_hours: Annotated[int, Field(ge=0, le=720)] = 24
    requires_confirmation: bool = False
    pending_expiry_hours: Annotated[int, Field(ge=1, le=168)] | None = Field(
        default=24,
        description=(
            "Hours a booking request waits for the business to confirm it before it "
            "expires (the customer is told and the slot is released). Null means it "
            "expires only at its start time. A request whose start has passed always "
            "expires. Left out, the stored value is kept."
        ),
    )
    max_open_per_customer: Annotated[int, Field(ge=1, le=20)] = Field(
        default=3,
        description=(
            "How many future bookings (requested, awaiting payment or confirmed) one "
            "customer may hold with this business. A public booking beyond it is "
            "refused with 409. Staff entries are not refused. Left out, the stored "
            "value is kept."
        ),
    )
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
    contact_phone: str | None = Field(
        default=None,
        max_length=40,
        description=(
            "Phone number customers can call, with its country code. Stored in "
            "E.164 form (+14734401234); blank clears it."
        ),
    )
    contact_whatsapp: str | None = Field(
        default=None,
        max_length=40,
        description=(
            "WhatsApp number with its country code. Stored as digits only "
            "(14734401234) for wa.me links; blank clears it."
        ),
    )
    contact_instagram: str | None = Field(
        default=None,
        max_length=200,
        description=(
            "Instagram handle, with or without @, or an instagram.com profile "
            "address. Stored as the handle without @; blank clears it."
        ),
    )
    contact_email: EmailStr | None = Field(
        default=None,
        max_length=254,
        description="Email address customers can write to; blank clears it.",
    )
    add_ons_enabled: bool = Field(
        default=False,
        description=(
            "Offer add-on services (for example a brow wax with a lash set) on the "
            "booking page. Off by default; while off, add-ons are neither shown nor "
            "accepted. Left out, the stored value is kept."
        ),
    )
    payment_at_booking: BookingPaymentMode = Field(
        default=BookingPaymentMode.DEPOSIT,
        description=(
            "What an online booking pays when it is made. `deposit`: each "
            "service's own deposit (none when it is 0). `full_price`: the service "
            "price by card, only while online card payments are available on the "
            "platform; otherwise it acts as `deposit`. Left out, the stored value "
            "is kept."
        ),
    )
    deposit_mode: BookingDepositMode = Field(
        default=BookingDepositMode.NONE,
        description=(
            "Business-wide deposit rule, used for a service only when its own "
            "deposit is 0. `none`: no rule (the default). `percent`: "
            "`deposit_percent` of the price, rounded up to whole currency units. "
            "`fixed`: `deposit_fixed_minor` per booking. Never more than the price. "
            "Left out, the stored value is kept."
        ),
    )
    deposit_percent: Annotated[int, Field(ge=1, le=100)] | None = Field(
        default=None,
        description="The percentage for `deposit_mode` `percent` (1 to 100).",
    )
    deposit_fixed_minor: Annotated[int, Field(ge=1, le=100_000_000)] | None = Field(
        default=None,
        description="The amount in minor units for `deposit_mode` `fixed`.",
    )
    deposit_min_price_minor: Annotated[int, Field(ge=1, le=100_000_000)] | None = Field(
        default=None,
        description=(
            "The lowest service price (minor units) that takes the business-wide "
            "deposit rule. Cheaper services take no deposit from it. Null means no "
            "minimum. A service's own deposit is never affected. Left out, the stored "
            "value is kept."
        ),
    )
    deposit_non_refundable: bool = Field(
        default=False,
        description=(
            "When true, a paid deposit is kept when the booking is cancelled, by the "
            "customer or by the business without a refund choice. A move keeps it "
            "with the booking. Declines still refund. Left out, the stored value is kept."
        ),
    )
    booking_policy: Annotated[str, Field(max_length=1000)] | None = Field(
        default=None,
        description=(
            "Plain-text booking policy, such as a late fee, up to 1000 characters. "
            "Shown on the booking page before the customer confirms and in the "
            "confirmation. Never HTML; line breaks are kept. Blank clears it. Left out, "
            "the stored value is kept."
        ),
    )
    brand_color: str | None = Field(
        default=None,
        max_length=7,
        description=(
            "The business's accent colour in its emails, as `#rrggbb`. Blank clears "
            "it. Mail uses the Barrels navy instead when the colour is too pale for "
            "white text. Left out, the stored value is kept."
        ),
    )
    logo_file_id: uuid.UUID | None = Field(
        default=None,
        description=(
            "A completed `booking-logo` upload of this business (see "
            "`POST /storage/uploads`), shown at the top of its emails. Null clears "
            "it. Left out, the stored logo is kept."
        ),
    )
    cover_file_id: uuid.UUID | None = Field(
        default=None,
        description=(
            "A completed `booking-cover` upload of this business (see "
            "`POST /storage/uploads`): the wide photo on its home page card and "
            "storefront. Null clears it. Left out, the stored photo is kept."
        ),
    )
    business_type: BookingBusinessType | None = Field(
        default=None,
        description=(
            "The business's type for the home page filter: one of a fixed list "
            "(beauty, hair, health, fitness, auto, home_services, lessons, "
            "professional, tours, events, other). Null clears it. Left out, the stored "
            "value is kept."
        ),
    )
    listed: bool = Field(
        default=False,
        description=(
            "Show this business on the Barrels Bookings home page. Off by default. "
            "Only an enabled business that is open for booking is listed. Left out, "
            "the stored value is kept."
        ),
    )
    category: str | None = Field(
        default=None,
        max_length=80,
        description=(
            "Short category for the home page, such as Hair or Nails; it is the "
            "filter chip a visitor taps. Blank clears it. Left out, the stored value "
            "is kept."
        ),
    )
    short_description: str | None = Field(
        default=None,
        max_length=160,
        description=(
            "One line for the home page card. Blank clears it. Left out, the stored "
            "value is kept."
        ),
    )
    city: str | None = Field(
        default=None,
        max_length=80,
        description=(
            "Town or city for the home page card. Blank clears it. Left out, the "
            "stored value is kept."
        ),
    )

    @field_validator("brand_color", mode="before")
    @classmethod
    def _brand_color(cls, value: object) -> str | None:
        return normalise_hex(value)

    @field_validator("category", "short_description", "city", mode="before")
    @classmethod
    def _listing_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("booking_policy", mode="before")
    @classmethod
    def _policy_text(cls, value: object) -> object:
        return normalise_policy(value)

    @field_validator("contact_phone", mode="before")
    @classmethod
    def _phone(cls, value: object) -> str | None:
        return contact.normalise_phone(value)

    @field_validator("contact_whatsapp", mode="before")
    @classmethod
    def _whatsapp(cls, value: object) -> str | None:
        return contact.normalise_whatsapp(value)

    @field_validator("contact_instagram", mode="before")
    @classmethod
    def _instagram(cls, value: object) -> str | None:
        return contact.normalise_instagram(value)

    @field_validator("contact_email", mode="before")
    @classmethod
    def _email(cls, value: object) -> str | None:
        return contact.normalise_email(value)

    @field_validator("public_slug")
    @classmethod
    def _not_reserved(cls, value: str) -> str:
        # Platform reserved names (ADR-0043) cover the web app's top-level routes
        # (studio, signin, auth, api) and the /bookings/public path word.
        if is_reserved(value) or value in LISTING_PATH_WORDS:
            raise ValueError("That booking address is reserved")
        return value

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if not is_valid_timezone(value):
            raise ValueError("Unknown IANA timezone")
        return value

    @model_validator(mode="after")
    def _deposit_rule_has_its_amount(self) -> Self:
        if (
            self.deposit_mode is BookingDepositMode.PERCENT
            and self.deposit_percent is None
        ):
            raise ValueError("A percentage deposit needs deposit_percent (1 to 100)")
        if (
            self.deposit_mode is BookingDepositMode.FIXED
            and self.deposit_fixed_minor is None
        ):
            raise ValueError("A fixed deposit needs deposit_fixed_minor (above 0)")
        return self


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
    is_add_on: bool = Field(
        default=False,
        description="An add-on is booked with a main service, never alone.",
    )
    add_on_categories: AddOnCategories = Field(
        default=None,
        description=(
            "For an add-on: offer it only with main services in these categories. "
            "Null or empty means any main service. Ignored for a main service."
        ),
    )

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
    is_add_on: bool | None = None
    add_on_categories: AddOnCategories = None


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
    is_add_on: bool = False
    add_on_categories: list[str] | None = None


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


class BookingClosureCreate(BaseModel):
    starts_on: date = Field(description="First closed day, the business's local date.")
    ends_on: date = Field(description="Last closed day, inclusive, local date.")
    reason: Annotated[str, Field(max_length=200)] | None = None

    @field_validator("reason")
    @classmethod
    def _blank_reason_is_none(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    @model_validator(mode="after")
    def _period(self) -> Self:
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must not be before starts_on")
        if (self.ends_on - self.starts_on).days + 1 > MAX_CLOSURE_DAYS:
            raise ValueError(f"A closure covers at most {MAX_CLOSURE_DAYS} days")
        return self


class BookingCalendarFeedStatus(BaseModel):
    """Whether the business has a calendar feed. The URL is never shown again."""

    enabled: bool
    created_at: UtcDateTime | None = None
    rotated_at: UtcDateTime | None = None


class BookingCalendarFeedLink(BaseModel):
    url: str = Field(
        description=(
            "The private https address to subscribe to (webcal:// opens it in "
            "Apple Calendar). Returned once: keep it, rotating ends it."
        ),
    )
    created_at: UtcDateTime
    rotated_at: UtcDateTime | None = None


class BookingClosurePublic(BaseModel):
    id: uuid.UUID
    starts_on: date
    ends_on: date
    reason: str | None
    created_at: UtcDateTime


class BookingClosureAffected(BaseModel):
    """An existing booking inside a new closure: for the studio's follow-up only."""

    id: uuid.UUID
    starts_at: UtcDateTime
    customer_first_name: str | None = Field(
        description="First name only. No email or phone is sent."
    )


class BookingClosureCreated(BookingClosurePublic):
    affected_bookings: list[BookingClosureAffected] = Field(
        default_factory=list,
        description=(
            "Active bookings (pending, confirmed, awaiting deposit) that fall inside "
            "the closure, earliest first. They are NOT cancelled: follow them up."
        ),
    )


# --- organisation agenda -----------------------------------------------------------


class BookingPaymentKind(str, Enum):
    DEPOSIT = "deposit"
    PAYMENT = "payment"


_PAYMENT_KIND_DESCRIPTION = (
    "`deposit` when the booking asks for part of the price at booking, `payment` "
    'when it asks for all of it (full-price mode). Studio screens say "Deposit" '
    'or "Payment" by it.'
)


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
    payment_kind: BookingPaymentKind = Field(description=_PAYMENT_KIND_DESCRIPTION)
    currency: str
    add_on_names: list[str] = Field(default_factory=list)
    expires_at: UtcDateTime | None = Field(
        default=None,
        description=(
            "For a request waiting for confirmation (`pending`): when it cancels "
            "itself if not confirmed, the earlier of `pending_expiry_hours` after "
            "it was made and its start. Null for any other status."
        ),
    )


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


class BookingManualDepositCreate(ManualPaymentCreate):
    """How a deposit taken outside Stripe was paid (``method``, optional receipt
    or transfer ``reference``)."""


class BookingStudioDecline(BaseModel):
    reason: str = Field(
        min_length=1,
        max_length=300,
        description="Why the request is declined. Shown to the customer in the email.",
    )


class BookingStudioReschedule(BaseModel):
    starts_at: UtcDateTime = Field(
        description=(
            "The new start time. Staff are not held to opening hours, lead time or "
            "the booking horizon (as when entering a booking by hand); the time "
            "must be in the future and free for the booking's provider."
        )
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
    deposit_non_refundable: bool = Field(
        default=False,
        description=(
            "This booking's deposit terms: true when a confirmed booking keeps its "
            "deposit on cancellation. Set when the booking was made; later profile "
            "changes do not change it."
        ),
    )
    payment_kind: BookingPaymentKind = Field(description=_PAYMENT_KIND_DESCRIPTION)
    balance_at_salon_minor: int = Field(
        description="The price less the deposit: what is still to pay at the business."
    )
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
    add_ons: list[BookingAddOnLine] = Field(default_factory=list)


# --- public ------------------------------------------------------------------------


class BookingPublicService(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None
    description: str | None
    duration_min: int
    price_minor: int
    deposit_minor: int
    due_at_booking_minor: int = Field(
        default=0,
        description=(
            "What an online booking of this service pays when it is made: the "
            "deposit, the full price (business setting, card payments on), or 0. "
            "More than 0 means the emailed-code step comes first."
        ),
    )


class BookingPublicAddOn(BaseModel):
    """An add-on a customer can add to one of the main services it follows."""

    id: uuid.UUID
    name: str
    description: str | None
    duration_min: int = Field(description="Minutes added to the main service.")
    price_minor: int = Field(description="Added to the main service's price.")
    service_ids: list[uuid.UUID] = Field(
        description="The main services this add-on can be booked with."
    )


class BookingAddOnLine(BaseModel):
    """An add-on on a booking, as it was priced and timed when booked."""

    name: str
    duration_min: int
    price_minor: int


class BookingPublicProvider(BaseModel):
    id: uuid.UUID
    name: str
    service_ids: list[uuid.UUID]


class BookingBusinessContact(BaseModel):
    """How a customer reaches the business by hand. Each is null when the
    business has not set it; show only the ones that are set."""

    phone: str | None = Field(description="E.164, for a tel: link.")
    whatsapp: str | None = Field(
        description="Digits with the country code, for https://wa.me/<digits>."
    )
    instagram: str | None = Field(
        description="Handle without @, for https://instagram.com/<handle>."
    )
    email: str | None = Field(description="For a mailto: link.")


class BookingStorefront(BaseModel):
    """What a client site needs to render its booking page."""

    slug: str
    display_name: str
    timezone: str
    currency: str
    cancel_cutoff_hours: int
    deposit_non_refundable: bool = Field(
        default=False,
        description="True when a paid deposit is never refunded on cancellation.",
    )
    booking_policy: str | None = Field(
        default=None,
        description="The business's plain-text booking policy, or null when it has none.",
    )
    contact: BookingBusinessContact
    brand_color: str | None = Field(
        description=(
            "The business's accent colour as `#rrggbb`, or null when it has not set "
            "one. Not checked for contrast: the page decides how to use it."
        ),
    )
    logo_url: str | None = Field(
        description=(
            "Public https address of the business logo, or null when there is no "
            "logo or no public API address is configured. Load it as an image."
        ),
    )
    cover_url: str | None = Field(
        default=None,
        description=(
            "Public https address of the cover photo, or null when there is no "
            "complete booking-cover upload or no public API address is configured."
        ),
    )
    business_type: BookingBusinessType | None = Field(
        default=None,
        description="The business's type for the home page filter, or null.",
    )
    services: list[BookingPublicService]
    providers: list[BookingPublicProvider]
    add_ons: list[BookingPublicAddOn] = Field(
        default_factory=list,
        description="Empty unless the business offers add-ons.",
    )


class BookingFeaturedService(BaseModel):
    """A service shown on a home page card. Public fields only."""

    id: uuid.UUID
    name: str
    price_minor: int = Field(description="The service price in minor units.")
    currency: str = Field(description="The business's currency, such as `XCD`.")
    duration_min: int


class BookingPublicBusiness(BaseModel):
    """One card on the Barrels Bookings home page. Public fields only: no contact
    details, owner data or emails."""

    slug: str = Field(description="The business's booking page is /<slug>.")
    name: str
    category: str | None
    short_description: str | None
    city: str | None
    brand_color: str | None = Field(
        description="The business's accent as `#rrggbb`, or null."
    )
    logo_url: str | None = Field(
        description=(
            "Public https address of the logo, or null when there is no finished logo "
            "upload or no public API address is configured. Load it as an image."
        ),
    )
    cover_url: str | None = Field(
        default=None,
        description=(
            "Public https address of the cover photo, or null when there is no "
            "finished booking-cover upload or no public API address is configured."
        ),
    )
    business_type: BookingBusinessType | None = Field(
        default=None,
        description="The business's type (the `type` filter), or null when not chosen.",
    )
    featured_services: list[BookingFeaturedService] = Field(
        default_factory=list,
        description=(
            "Up to three bookable services (active, not add-ons) in the order the "
            "business's booking page lists them; empty when it has none."
        ),
    )


class BookingPublicBusinessPage(BaseModel):
    items: list[BookingPublicBusiness]
    page: int = Field(ge=1)
    has_more: bool = Field(description="True when a later page holds more businesses.")
    categories: list[str] = Field(
        description=(
            "The distinct categories of every listed business, case folded, for the "
            "filter chips. Not narrowed by the search."
        ),
    )
    types_available: list[BookingBusinessType] = Field(
        default_factory=list,
        description=(
            "The business types that at least one listed business has, in the fixed "
            "list's order. Counts the same businesses the list shows; not narrowed by "
            "the search, category or type."
        ),
    )


class BookingSlot(BaseModel):
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    provider_ids: list[uuid.UUID]


class BookingAvailability(BaseModel):
    timezone: str
    service_id: uuid.UUID
    slots: list[BookingSlot]
    due_at_booking_minor: int = Field(
        description=(
            "What booking this service with the `add_on_ids` asked for charges at "
            "booking, in minor units (0 = nothing). Priced on the combined price "
            "with the add-ons, exactly as the booking itself is charged."
        ),
    )
    email_code_required: bool = Field(
        description=(
            "True when an anonymous visitor must pass the emailed-code step "
            "(`email-code` then `email-code/confirm`) before booking. A signed-in, "
            "verified booker whose email matches may skip it, as creating the "
            "booking does. Always false when `due_at_booking_minor` is 0."
        ),
    )


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
    add_on_ids: list[uuid.UUID] = Field(
        default_factory=list,
        max_length=5,
        description=(
            "Add-ons to book with the service, from the storefront's `add_ons`. "
            "Prices and lengths are read on the server."
        ),
    )
    marketing_consent: bool = False
    email_proof: str | None = Field(
        default=None,
        max_length=1024,
        description=(
            "Proof from `confirm-email-code`. Needed only when a deposit is due "
            "and the caller is not a signed-in account that already vouches for "
            "`customer_email`. Bound to this email, service and start time; "
            "single use."
        ),
    )
    turnstile_token: str | None = Field(default=None, max_length=2048)
    # Honeypot. Hidden from people; a bot that fills it is silently dropped.
    website: str | None = Field(default=None, max_length=200)


class BookingEmailCodeRequest(BaseModel):
    """Ask for a code to be emailed before a deposit booking."""

    service_id: uuid.UUID
    starts_at: UtcDateTime = Field(
        description="The slot being booked; the proof is bound to it."
    )
    customer_email: EmailStr = Field(max_length=254)
    add_on_ids: list[uuid.UUID] = Field(
        default_factory=list,
        max_length=5,
        description=(
            "The add-ons the booking will include, so the code is asked for when "
            "the combined price is a deposit. Same ids as the booking's `add_on_ids`."
        ),
    )
    turnstile_token: str | None = Field(default=None, max_length=2048)


class BookingEmailCodeSent(BaseModel):
    required: bool = Field(
        description=(
            "False when no step is needed (no deposit is due, or the signed-in "
            "account already vouches for the email); nothing was sent."
        )
    )
    expires_in_seconds: int = Field(
        default=0, description="Code lifetime; 0 when `required` is false."
    )


class BookingEmailCodeConfirm(BaseModel):
    service_id: uuid.UUID
    starts_at: UtcDateTime
    customer_email: EmailStr = Field(max_length=254)
    code: str = Field(pattern=r"^\d{6}$", description="The 6-digit emailed code.")


class BookingEmailProof(BaseModel):
    proof: str = Field(description="Send as `email_proof` when creating the booking.")
    expires_in_seconds: int


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


class BookingPaymentStatus(str, Enum):
    DUE = "due"
    PAID = "paid"
    REFUNDED = "refunded"
    UNPAID = "unpaid"


class BookingPaymentSummary(BaseModel):
    """What the customer paid when booking, as they see it."""

    status: BookingPaymentStatus = Field(
        description=(
            "`due`: the slot is held until the payment arrives. `paid`: received "
            "(`refunded_minor` may show a partial refund). `refunded`: handed back "
            "in full. `unpaid`: the booking closed without a payment."
        )
    )
    amount_minor: int = Field(description="What was due at booking.")
    paid_minor: int
    refunded_minor: int
    # Clients show balance_at_salon_minor only when status is `paid`.
    balance_at_salon_minor: int = Field(
        description=(
            "What is still to pay at the business once the deposit is paid: the "
            "service price less the deposit. 0 when the whole price was paid online."
        ),
    )
    currency: str
    checkout_url: str | None = Field(
        default=None,
        description=(
            "Hosted page to finish paying, only while `status` is `due` and the "
            "payment is online."
        ),
    )


BookingMyBooking.model_rebuild()


class BookingPublicDetail(BaseModel):
    """A booking as its customer sees it."""

    id: uuid.UUID
    status: BookingStatus
    business_name: str = Field(
        default="",
        description="The business's display name, as its public booking page shows it.",
    )
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
    deposit_non_refundable: bool = Field(
        default=False,
        description=(
            "This booking's terms: true when a deposit paid on a confirmed booking is "
            "kept on cancellation. Set when the booking was made."
        ),
    )
    booking_policy: str | None = Field(
        default=None,
        description="The business's plain-text booking policy, or null when it has none.",
    )
    can_cancel: bool = Field(
        description="True while the booking is active and before the cancellation cutoff."
    )
    contact: BookingBusinessContact = Field(
        description="How to reach the business when the booking cannot be changed online."
    )
    payment: BookingPaymentSummary | None = Field(
        default=None,
        description="Null when nothing was due at booking (pay at the business).",
    )
    account_invite_url: str | None = Field(
        default=None,
        description=(
            "Where a guest can create a free account or sign in, so this booking "
            "is listed under My bookings. Null once the booking's contact is linked "
            "to an account."
        ),
    )
    hold_ends_at: UtcDateTime | None = Field(
        default=None,
        description=(
            "While `status` is `pending_payment`: when the unpaid hold is released "
            "if the payment has not arrived. Null otherwise."
        ),
    )
    add_ons: list[BookingAddOnLine] = Field(
        default_factory=list,
        description="The add-ons booked with the service. `starts_at`..`ends_at` include them.",
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
            "True when the booking holds the slot but waits for a payment (a "
            "deposit or the full price; `status` is `pending_payment`). It is "
            "cancelled and the slot released if it is not paid in time."
        ),
    )
    checkout_url: str | None = Field(
        default=None,
        description=(
            "Hosted page where the customer pays. Null when no online payment is "
            "available and the business records the payment itself."
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
    card_payments_available: bool = Field(
        default=False,
        description=(
            "True when the platform takes card payments online (Stripe, test mode "
            "only). Without it `payment_at_booking: full_price` acts as `deposit`."
        ),
    )


class BookingPublicCancelBody(RootModel[BookingPublicCancel | None]):
    """Optional cancellation request. An absent body and null are both accepted."""


# --- Barrels staff: listing review (ADR-0066) ---------------------------------------


class BookingListingReview(BaseModel):
    """Staff view of one business's home page listing and the flags staff review."""

    organisation_id: str
    public_slug: str
    display_name: str
    #: The business asked to appear on the home page.
    listed: bool
    #: Set once staff approved the listing; null while it waits for review.
    listing_approved_at: UtcDateTime | None
    listing_approved_by_user_id: uuid.UUID | None
    #: The business was created by its own account, not by Barrels staff.
    self_created: bool
    #: Set when the last owner of a self-created business deleted their account.
    owner_left_at: UtcDateTime | None
    #: Set when the sign-up name was refused by the sender-name guard (ADR-0066).
    sender_name_flagged_at: UtcDateTime | None = None


class BookingListingQueue(str, Enum):
    """Which listings the staff list shows."""

    #: Asked for the home page listing and not approved yet: the work queue.
    PENDING = "pending"
    #: Approved, whether or not the business still asks to be listed.
    APPROVED = "approved"
    #: The owner left, or the sign-up name was refused by the sender-name guard.
    FLAGGED = "flagged"
    ALL = "all"


class BookingListingReviewList(BaseModel):
    """One page of listings for staff review, oldest business first."""

    data: list[BookingListingReview]
    count: int
    page: int
    size: int
