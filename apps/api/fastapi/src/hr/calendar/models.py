import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class CalendarEventKind(str, Enum):
    MEETING = "MEETING"
    TRAINING = "TRAINING"
    INSPECTION = "INSPECTION"
    VISIT = "VISIT"
    MAINTENANCE = "MAINTENANCE"
    OBSERVANCE = "OBSERVANCE"
    DEADLINE = "DEADLINE"
    OTHER = "OTHER"


class CalendarEvent(Base):
    """A dated department calendar entry, separate from the duty roster."""

    __tablename__ = "calendar_event"
    __table_args__ = (
        sa.Index("ix_hr_calendar_event_department_id", "department_id"),
        sa.Index("ix_hr_calendar_event_starts_at", "starts_at"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    kind: Mapped[CalendarEventKind] = mapped_column(default=CalendarEventKind.MEETING)
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    all_day: Mapped[bool] = mapped_column(default=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cancelled_at: Mapped[datetime | None]
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
