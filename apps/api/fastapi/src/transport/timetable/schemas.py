from datetime import date
from enum import Enum
from typing import Annotated, Self

from pydantic import Field, model_validator

from src.models import BaseModel, UtcDateTime
from src.transport.models import (
    TimetableVersionStatus,
    TransportDirection,
    TransportTripStatus,
)

# Service time "HH:MM" after service-day midnight; hours run to 47 so a night
# trip can pass 24:00 (GTFS convention).
ServiceTime = Annotated[
    str,
    Field(
        pattern=r"^([0-3]\d|4[0-7]):[0-5]\d$",
        examples=["05:30", "24:15"],
        description="HH:MM after service-day midnight; may exceed 24:00",
    ),
]
Text = Annotated[str, Field(min_length=1, max_length=200)]
LongText = Annotated[str, Field(max_length=2000)]


class TimetableVersionState(str, Enum):
    """Lifecycle as seen today: published versions are scheduled, current or superseded."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    CURRENT = "current"
    SUPERSEDED = "superseded"
    DISCARDED = "discarded"


class TimetableIssueSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


class TransportWeekday(str, Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class TransportAccess(BaseModel):
    canView: bool
    canManageTimetable: bool
    canPublishTimetable: bool


class TransportRoute(BaseModel):
    id: int
    number: int
    name: str
    description: str | None
    active: bool


class TransportRouteInput(BaseModel):
    number: Annotated[int, Field(ge=1, le=999)]
    name: Text
    description: LongText | None = None
    active: bool = True


class TransportShift(BaseModel):
    id: int
    slug: str
    name: str
    startTime: str
    endTime: str


class ServiceCalendarView(BaseModel):
    id: int
    slug: str
    name: str
    days: list[TransportWeekday]
    runsOnPublicHolidays: bool


class TransportStop(BaseModel):
    id: int
    code: str | None
    name: str
    landmark: str | None
    latitude: float | None
    longitude: float | None
    active: bool
    routeNumbers: list[int] = Field(
        description="Routes serving this stop in the current timetable"
    )


class TransportStopInput(BaseModel):
    code: Annotated[str, Field(pattern=r"^[A-Z0-9][A-Z0-9-]{0,31}$")]
    name: Text
    landmark: LongText | None = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    active: bool = True

    @model_validator(mode="after")
    def _location_is_a_pair(self) -> Self:
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Give both latitude and longitude, or neither")
        return self


class TransportCatalogue(BaseModel):
    routes: list[TransportRoute]
    shifts: list[TransportShift]
    stops: list[TransportStop]
    calendars: list[ServiceCalendarView]


class TimetableVersionSummary(BaseModel):
    id: int
    label: str
    status: TimetableVersionStatus
    state: TimetableVersionState
    effectiveDate: date | None
    sourceRef: str | None
    notes: str | None
    basedOnId: int | None
    createdAt: UtcDateTime
    updatedAt: UtcDateTime
    publishedAt: UtcDateTime | None
    tripCount: int


class TimetableStopTimeView(BaseModel):
    sequence: int = Field(description="1-based position of the stop on the trip")
    stopId: int
    stopName: str
    time: str | None
    timepoint: bool = Field(
        description="True when the time is stated for this stop; false when approximate"
    )


class TimetableTripView(BaseModel):
    id: int
    routeId: int
    shiftId: int
    calendarId: int
    direction: TransportDirection
    departTime: str
    arriveTime: str | None
    status: TransportTripStatus
    notes: str | None
    sourceRef: str | None
    stops: list[TimetableStopTimeView]


class TimetableIssue(BaseModel):
    severity: TimetableIssueSeverity
    code: str
    message: str
    tripId: int | None = None
    routeId: int | None = None


class TimetableVersionDetail(BaseModel):
    version: TimetableVersionSummary
    trips: list[TimetableTripView]
    issues: list[TimetableIssue]


class TimetableVersionCreate(BaseModel):
    label: Text
    notes: LongText | None = None
    sourceRef: Annotated[str, Field(max_length=200)] | None = None


class TimetableVersionUpdate(TimetableVersionCreate):
    pass


class TimetablePublish(BaseModel):
    effectiveDate: date


class TimetableStopTimeInput(BaseModel):
    stopId: int
    time: ServiceTime | None = None
    timepoint: bool = False


class TimetableTripInput(BaseModel):
    routeId: int
    shiftId: int
    calendarId: int
    direction: TransportDirection
    departTime: ServiceTime
    arriveTime: ServiceTime | None = None
    status: TransportTripStatus = TransportTripStatus.CONFIRMED
    notes: LongText | None = None
    sourceRef: Annotated[str, Field(max_length=200)] | None = None
    stops: Annotated[list[TimetableStopTimeInput], Field(max_length=80)] = []
