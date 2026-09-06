import uuid

from src.models import BaseModel, UtcDateTime

from .models import CalendarEventKind


class CalendarEventCreate(BaseModel):
    department_id: str | None = None
    title: str
    description: str | None = None
    kind: CalendarEventKind = CalendarEventKind.MEETING
    #: Department-local wall-clock times, matching the roster. Sent without an
    #: offset (e.g. "2026-07-06T09:30:00"); an offset, if given, is dropped.
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    all_day: bool = False
    location: str | None = None


class CalendarEventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    kind: CalendarEventKind | None = None
    starts_at: UtcDateTime | None = None
    ends_at: UtcDateTime | None = None
    all_day: bool | None = None
    location: str | None = None
    cancelled: bool | None = None


class CalendarEventPublic(BaseModel):
    """A department calendar entry.

    `starts_at_local`/`ends_at_local` are ISO-8601 without an offset — the same
    department-local wall clock the roster feed uses, so both layers of the
    calendar read on one time base. `created_at` is a real timestamp and is UTC.
    """

    id: uuid.UUID
    department_id: str
    title: str
    description: str | None = None
    kind: CalendarEventKind
    starts_at_local: str
    ends_at_local: str
    all_day: bool
    location: str | None = None
    is_cancelled: bool
    created_by_user_id: uuid.UUID
    created_by_name: str | None = None
    created_at: UtcDateTime


class CalendarEventsPublic(BaseModel):
    data: list[CalendarEventPublic]
    count: int
