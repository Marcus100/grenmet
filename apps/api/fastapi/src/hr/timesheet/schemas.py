import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from src.models import BaseModel

from .models import SubmissionMode, TimesheetStatus


class DepartmentPolicyPublic(BaseModel):
    department_id: str
    allow_employee_self_submit: bool
    allow_supervisor_proxy_submit: bool


class TimesheetEntryInput(BaseModel):
    entry_date: date
    roster_hours: Decimal = Field(default=Decimal("0.0"))
    actual_hours: Decimal = Field(default=Decimal("0.0"))
    break_hours: Decimal = Field(default=Decimal("0.0"))
    comments: str | None = None


class TimesheetCreate(BaseModel):
    user_id: uuid.UUID | None = None
    department_id: str
    period_start: date
    period_end: date
    entries: list[TimesheetEntryInput] = Field(default_factory=list)


class TimesheetPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    period_start: date
    period_end: date
    status: TimesheetStatus
    submitted_by_user_id: uuid.UUID | None = None
    approved_by_user_id: uuid.UUID | None = None
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TimesheetEntryPublic(BaseModel):
    id: uuid.UUID
    timesheet_id: uuid.UUID
    entry_date: date
    roster_hours: Decimal
    actual_hours: Decimal
    break_hours: Decimal
    comments: str | None = None


class TimesheetDetails(BaseModel):
    timesheet: TimesheetPublic
    entries: list[TimesheetEntryPublic]


class TimesheetSubmitRequest(BaseModel):
    mode: SubmissionMode = SubmissionMode.SELF


class TimesheetListPublic(BaseModel):
    data: list[TimesheetPublic]
    count: int
