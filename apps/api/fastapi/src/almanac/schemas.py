"""Public almanac and tide shapes. Never expose the ORM rows directly."""

from datetime import date as CalendarDate
from typing import Literal

from pydantic import Field

from src.models import BaseModel, UtcDateTime

TIDE_NOTE = (
    "Predicted tide heights and times from an internal provisional table. Not for "
    "navigation: do not use for passage planning, under-keel clearance or any "
    "decision where safety depends on the tide."
)
ASTRONOMY_NOTE = (
    "Sun and moon times computed for each day (Astral, checked against the US Naval "
    "Observatory). Times are approximate to a minute. Rise and set are blank on days "
    "when the moon does not rise or set."
)


class TimeOfDay(BaseModel):
    """One event: the UTC instant and the same instant in Grenada local time."""

    utc: UtcDateTime | None = None
    local: str | None = Field(
        default=None,
        description="ISO 8601 in America/Grenada (UTC-4, no daylight saving)",
    )


class AstronomyDay(BaseModel):
    date: CalendarDate = Field(description="Grenada local calendar date")
    sunrise: TimeOfDay
    sunset: TimeOfDay
    civil_dawn: TimeOfDay
    civil_dusk: TimeOfDay
    moonrise: TimeOfDay
    moonset: TimeOfDay
    moon_phase: str = Field(description="Phase name, e.g. 'Waxing Gibbous'")


class PrincipalPhase(BaseModel):
    phase: Literal["new", "first_quarter", "full", "last_quarter"]
    date: CalendarDate = Field(
        description="Grenada local date of the phase, accurate to +/-1 day"
    )


class LocationOut(BaseModel):
    key: str
    name: str
    latitude: float
    longitude: float


class AstronomyResponse(BaseModel):
    location: LocationOut
    timezone: str = "America/Grenada"
    note: str = ASTRONOMY_NOTE
    days: list[AstronomyDay]
    phases: list[PrincipalPhase] = Field(
        description=(
            "Principal phases in the range, plus the nearest one before and after it "
            "(when stored)."
        )
    )


class TideEvent(BaseModel):
    event_type: Literal["HIGH", "LOW"]
    time_utc: UtcDateTime
    time_local: str = Field(description="ISO 8601 in America/Grenada")
    height_m_mllw: float = Field(description="Metres relative to provisional MLLW")
    timing_quality: str


class TidesResponse(BaseModel):
    station: str
    name: str
    timezone: str = "America/Grenada"
    note: str = TIDE_NOTE
    status: str | None = Field(
        default=None, description="Status of the source table, as imported"
    )
    source_label: str | None = None
    source_version: str | None = None
    events: list[TideEvent]
