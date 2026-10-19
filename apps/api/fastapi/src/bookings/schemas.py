import uuid
from datetime import time
from typing import Annotated, Self

from pydantic import EmailStr, Field, field_validator, model_validator

from src.models import BaseModel, UtcDateTime
from src.utils.timezones import is_valid_timezone

from .models import BookingExceptionKind, BookingSource, BookingStatus

Name = Annotated[str, Field(min_length=1, max_length=120)]
Slug = Annotated[str, Field(pattern=r"^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$")]
Minutes = Annotated[int, Field(ge=0, le=1440)]
Minor = Annotated[int, Field(ge=0, le=100_000_000)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]


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
