import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ShiftCategory(str, Enum):
    WORK = "WORK"
    OFF = "OFF"
    LEAVE = "LEAVE"
    HOLIDAY = "HOLIDAY"


class RosterPeriodStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class ImportStatus(str, Enum):
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ShiftCatalog(Base):
    __tablename__ = "shift_catalog"
    __table_args__ = {"schema": "hr"}
    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    category: Mapped[ShiftCategory]
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    ends_next_day: Mapped[bool] = mapped_column(default=False)
    counts_as_work_hours: Mapped[bool] = mapped_column(default=True)
    needs_reason: Mapped[bool] = mapped_column(default=False)
    needs_approval: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterPeriod(Base):
    __tablename__ = "roster_period"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    period_start: Mapped[date]
    period_end: Mapped[date]
    status: Mapped[RosterPeriodStatus] = mapped_column(default=RosterPeriodStatus.DRAFT)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterAssignment(Base):
    __tablename__ = "roster_assignment"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "assignment_date", name="uq_hr_roster_assignment_user_date"
        ),
        {"schema": "hr"},
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_period.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    assignment_date: Mapped[date] = mapped_column(index=True)
    shift_code: Mapped[str] = mapped_column(
        String(10), ForeignKey("hr.shift_catalog.code")
    )
    remarks: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class PublicHoliday(Base):
    __tablename__ = "public_holiday"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150))
    holiday_date: Mapped[date] = mapped_column(index=True)
    is_recurring: Mapped[bool] = mapped_column(default=False)
    country_code: Mapped[str] = mapped_column(String(3), default="GD")
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterRevisionAction(str, Enum):
    CREATED = "CREATED"
    ASSIGNMENTS_UPDATED = "ASSIGNMENTS_UPDATED"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class RosterRevision(Base):
    __tablename__ = "roster_revision"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_period.id"), index=True
    )
    revision_number: Mapped[int]
    action: Mapped[RosterRevisionAction]
    changed_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    snapshot: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterImportJob(Base):
    __tablename__ = "roster_import_job"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    roster_period_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.roster_period.id"), nullable=True
    )
    file_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[ImportStatus] = mapped_column(default=ImportStatus.PENDING)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    total_rows: Mapped[int] = mapped_column(default=0)
    valid_rows: Mapped[int] = mapped_column(default=0)
    invalid_rows: Mapped[int] = mapped_column(default=0)
    error_summary: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterImportRow(Base):
    __tablename__ = "roster_import_row"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_import_job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_import_job.id"), index=True
    )
    row_number: Mapped[int]
    raw_data: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    validation_errors: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_valid: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
