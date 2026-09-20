import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class TimesheetStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SubmissionMode(str, Enum):
    SELF = "SELF"
    PROXY = "PROXY"


class DepartmentPolicy(Base):
    __tablename__ = "department_policy"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True, unique=True
    )
    allow_employee_self_submit: Mapped[bool] = mapped_column(default=True)
    allow_supervisor_proxy_submit: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class Timesheet(Base):
    __tablename__ = "timesheet"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    period_start: Mapped[date]
    period_end: Mapped[date]
    status: Mapped[TimesheetStatus] = mapped_column(default=TimesheetStatus.DRAFT)
    submitted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    submitted_at: Mapped[datetime | None]
    approved_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class TimesheetEntry(Base):
    __tablename__ = "timesheet_entry"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timesheet_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.timesheet.id"), index=True
    )
    entry_date: Mapped[date]
    shift_code: Mapped[str | None] = mapped_column(
        String(10), ForeignKey("hr.shift_catalog.code"), nullable=True
    )
    roster_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.roster_assignment.id"), nullable=True
    )
    roster_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    actual_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    total_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    overtime_hours: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("0.0")
    )
    break_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    hours_worked: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"))
    medical_certificate_attached: Mapped[bool] = mapped_column(default=False)
    comments: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class TimesheetSubmission(Base):
    __tablename__ = "timesheet_submission"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timesheet_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.timesheet.id"), index=True
    )
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    submission_mode: Mapped[SubmissionMode] = mapped_column(default=SubmissionMode.SELF)
    submitted_at: Mapped[datetime] = mapped_column(default=utc_now)
