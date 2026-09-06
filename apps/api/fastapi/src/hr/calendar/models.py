import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from src.utils.datetime import utc_now


class CalendarEventKind(str, Enum):
    """What a department puts on its calendar besides the duty roster."""

    MEETING = "MEETING"
    TRAINING = "TRAINING"
    INSPECTION = "INSPECTION"
    VISIT = "VISIT"
    MAINTENANCE = "MAINTENANCE"
    OBSERVANCE = "OBSERVANCE"
    DEADLINE = "DEADLINE"
    OTHER = "OTHER"


class CalendarEvent(SQLModel, table=True):
    """A dated entry on a department's calendar.

    The department calendar is the record of what the department is doing:
    meetings, training, inspections, visits, maintenance windows, deadlines.
    The duty roster is a separate layer read onto the same calendar — rostered
    shifts are never copied into this table, they are expanded from
    hr.roster_assignment at read time.

    `starts_at`/`ends_at` are naive department-local wall-clock times, the same
    frame the shift catalog and the printed roster use, so one calendar never
    mixes two time bases. All-day entries store midnight and set `all_day`.
    """

    __tablename__ = "calendar_event"
    __table_args__ = (
        sa.Index("ix_hr_calendar_event_department_id", "department_id"),
        sa.Index("ix_hr_calendar_event_starts_at", "starts_at"),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id")
    title: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    kind: CalendarEventKind = Field(default=CalendarEventKind.MEETING)
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    location: str | None = Field(default=None, max_length=200)
    # Cancelled events are kept, not deleted: a calendar is a record, and "the
    # inspection was called off" is part of it.
    cancelled_at: datetime | None = Field(default=None)
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
