import uuid
from datetime import date
from decimal import Decimal

from pydantic import Field, model_validator

from src.hr.roster.models import RosterAvailability
from src.hr.signatures.schemas import SignatureConsent
from src.models import BaseModel, UtcDateTime

from .models import SubmissionMode, TimesheetStatus


class DepartmentPolicyPublic(BaseModel):
    department_id: str
    allow_employee_self_submit: bool
    allow_supervisor_proxy_submit: bool


class TimesheetEntryInput(BaseModel):
    entry_date: date
    shift_code: str | None = Field(default=None, max_length=10)
    roster_hours: Decimal = Field(
        default=Decimal("0.0"), ge=0, le=24, decimal_places=2, allow_inf_nan=False
    )
    actual_hours: Decimal = Field(
        default=Decimal("0.0"), ge=0, le=24, decimal_places=2, allow_inf_nan=False
    )
    total_hours: Decimal | None = Field(
        default=None, ge=0, le=24, decimal_places=2, allow_inf_nan=False
    )
    overtime_hours: Decimal = Field(
        default=Decimal("0.0"), ge=0, le=24, decimal_places=2, allow_inf_nan=False
    )
    break_hours: Decimal = Field(
        default=Decimal("0.0"), ge=0, le=24, decimal_places=2, allow_inf_nan=False
    )
    hours_worked: Decimal | None = Field(
        default=None, ge=0, le=24, decimal_places=2, allow_inf_nan=False
    )
    medical_certificate_attached: bool = False
    comments: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_recorded_hours(self) -> TimesheetEntryInput:
        if self.break_hours > self.actual_hours:
            raise ValueError("Break duration cannot exceed actual hours")
        if (
            self.hours_worked is not None
            and self.hours_worked != self.actual_hours - self.break_hours
        ):
            raise ValueError(
                "Hours worked must equal actual hours minus break duration"
            )
        return self


class TimesheetCreate(BaseModel):
    user_id: uuid.UUID | None = None
    department_id: str = Field(min_length=1, max_length=100)
    period_start: date
    period_end: date
    entries: list[TimesheetEntryInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_period_entries(self) -> TimesheetCreate:
        if self.period_end < self.period_start:
            raise ValueError("Period end must not precede period start")
        dates = set()
        for entry in self.entries:
            if not self.period_start <= entry.entry_date <= self.period_end:
                raise ValueError("Every entry must fall within the timesheet period")
            if entry.entry_date in dates:
                raise ValueError(
                    "Only one employee entry is allowed per shift start date"
                )
            dates.add(entry.entry_date)
        return self


class TimesheetPublic(BaseModel):
    signed_document_id: uuid.UUID | None = None
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    period_start: date
    period_end: date
    status: TimesheetStatus
    submitted_by_user_id: uuid.UUID | None = None
    approved_by_user_id: uuid.UUID | None = None
    submitted_at: UtcDateTime | None = None
    approved_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class TimesheetEntryPublic(BaseModel):
    id: uuid.UUID
    timesheet_id: uuid.UUID
    entry_date: date
    shift_code: str | None = None
    roster_assignment_id: uuid.UUID | None = None
    roster_hours: Decimal
    actual_hours: Decimal
    total_hours: Decimal
    overtime_hours: Decimal
    break_hours: Decimal
    hours_worked: Decimal
    medical_certificate_attached: bool
    comments: str | None = None
    availability: RosterAvailability = RosterAvailability.SCHEDULED


class TimesheetDetails(BaseModel):
    timesheet: TimesheetPublic
    entries: list[TimesheetEntryPublic]


class TimesheetSubmitRequest(SignatureConsent):
    mode: SubmissionMode = SubmissionMode.SELF


class TimesheetListPublic(BaseModel):
    data: list[TimesheetPublic]
    count: int
    page: int = 1
    size: int = 100


# --- Timesheet Summary ---


class ShiftHoursSummary(BaseModel):
    shift_code: str
    total_roster_hours: Decimal
    total_actual_hours: Decimal
    total_overtime_hours: Decimal
    total_break_hours: Decimal
    entry_count: int


class TimesheetSummaryByShift(BaseModel):
    timesheet_id: uuid.UUID
    shifts: list[ShiftHoursSummary]
    grand_total_roster: Decimal
    grand_total_actual: Decimal
    grand_total_overtime: Decimal
