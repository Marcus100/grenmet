import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator

from src.hr.roster.models import RosterAvailability
from src.hr.workflow.models import WorkflowStatus
from src.models import BaseModel, UtcDateTime


class AttendanceSave(BaseModel):
    roster_assignment_id: uuid.UUID
    expected_revision: int = Field(default=0, ge=0)
    arrived_at: UtcDateTime
    departed_at: UtcDateTime | None = None
    break_minutes: int = Field(default=0, ge=0, le=1440)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("arrived_at", "departed_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Attendance time must include a timezone offset")
        return value


class AttendanceSubmit(BaseModel):
    expected_revision: int = Field(ge=1)


class AttendanceCorrectionCreate(AttendanceSave):
    departed_at: UtcDateTime
    reason: str = Field(min_length=1, max_length=500)


class AttendanceCorrectionPublic(BaseModel):
    id: uuid.UUID
    attendance_id: uuid.UUID
    proposed_by_user_id: uuid.UUID
    expected_revision: int
    arrived_at: UtcDateTime
    departed_at: UtcDateTime
    break_minutes: int
    reason: str
    workflow_instance_id: uuid.UUID | None
    created_at: UtcDateTime
    review_status: WorkflowStatus | None = None


class AttendanceShiftPublic(BaseModel):
    roster_assignment_id: uuid.UUID
    user_id: uuid.UUID
    employee_name: str
    department_id: str
    shift_date: date
    shift_code: str
    availability: RosterAvailability = RosterAvailability.SCHEDULED
    scheduled_start: UtcDateTime
    scheduled_end: UtcDateTime
    attendance_id: uuid.UUID | None = None
    arrived_at: UtcDateTime | None = None
    departed_at: UtcDateTime | None = None
    break_minutes: int = 0
    actual_hours: Decimal | None = None
    elapsed_hours: Decimal | None = None
    revision: int = 0
    notes: str | None = None
    workflow_instance_id: uuid.UUID | None = None
    review_status: WorkflowStatus | None = None
    reviewer_name: str | None = None
    reviewed_at: UtcDateTime | None = None


class AttendanceWeekPublic(BaseModel):
    period_start: date
    period_end: date
    shifts: list[AttendanceShiftPublic]
    approved_hours: Decimal
    recorded_hours: Decimal


class AttendanceReviewPublic(BaseModel):
    current: AttendanceShiftPublic
    corrections: list[AttendanceCorrectionPublic]
