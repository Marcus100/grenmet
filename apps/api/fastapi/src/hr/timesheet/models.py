import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlmodel import Field, SQLModel


class TimesheetStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SubmissionMode(str, Enum):
    SELF = "SELF"
    PROXY = "PROXY"


class DepartmentPolicy(SQLModel, table=True):
    __tablename__ = "department_policy"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True, unique=True)
    allow_employee_self_submit: bool = True
    allow_supervisor_proxy_submit: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Timesheet(SQLModel, table=True):
    __tablename__ = "timesheet"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    period_start: date
    period_end: date
    status: TimesheetStatus = Field(default=TimesheetStatus.DRAFT)
    submitted_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    approved_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TimesheetEntry(SQLModel, table=True):
    __tablename__ = "timesheet_entry"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timesheet_id: uuid.UUID = Field(foreign_key="hr.timesheet.id", index=True)
    entry_date: date
    roster_hours: Decimal = Field(default=Decimal("0.0"), decimal_places=2, max_digits=5)
    actual_hours: Decimal = Field(default=Decimal("0.0"), decimal_places=2, max_digits=5)
    break_hours: Decimal = Field(default=Decimal("0.0"), decimal_places=2, max_digits=5)
    comments: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TimesheetSubmission(SQLModel, table=True):
    __tablename__ = "timesheet_submission"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timesheet_id: uuid.UUID = Field(foreign_key="hr.timesheet.id", index=True)
    submitted_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    submission_mode: SubmissionMode = Field(default=SubmissionMode.SELF)
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
