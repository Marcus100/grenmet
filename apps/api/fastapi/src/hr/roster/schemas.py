import uuid
from datetime import date

from pydantic import Field

from src.models import BaseModel, UtcDateTime

from .models import (
    ImportStatus,
    RosterPeriodStatus,
    RosterRevisionAction,
    ShiftCategory,
)


class ShiftCatalogPublic(BaseModel):
    code: str
    label: str
    category: ShiftCategory
    start_time: str | None = None
    end_time: str | None = None
    ends_next_day: bool
    counts_as_work_hours: bool
    needs_reason: bool
    needs_approval: bool
    is_active: bool


class ShiftCatalogsPublic(BaseModel):
    data: list[ShiftCatalogPublic]
    count: int


class RosterPeriodCreate(BaseModel):
    department_id: str
    period_start: date
    period_end: date


class RosterPeriodPublic(BaseModel):
    id: uuid.UUID
    department_id: str
    period_start: date
    period_end: date
    status: RosterPeriodStatus
    created_by_user_id: uuid.UUID
    created_at: UtcDateTime
    updated_at: UtcDateTime


class RosterPeriodsPublic(BaseModel):
    data: list[RosterPeriodPublic]
    count: int


class RosterAssignmentInput(BaseModel):
    user_id: uuid.UUID
    assignment_date: date
    shift_code: str
    remarks: str | None = None


class RosterAssignmentBulkCreate(BaseModel):
    roster_period_id: uuid.UUID
    assignments: list[RosterAssignmentInput] = Field(default_factory=list)


class RosterAssignmentPublic(BaseModel):
    id: uuid.UUID
    roster_period_id: uuid.UUID
    user_id: uuid.UUID
    assignment_date: date
    shift_code: str
    remarks: str | None = None


class RosterPeriodDetails(BaseModel):
    period: RosterPeriodPublic
    assignments: list[RosterAssignmentPublic]


class RosterCsvValidationRequest(BaseModel):
    department_id: str
    file_name: str = "roster.csv"
    roster_period_id: uuid.UUID | None = None
    csv_text: str


class RosterCsvRowValidation(BaseModel):
    row_number: int
    is_valid: bool
    errors: list[str] = Field(default_factory=list)


class RosterCsvValidationResponse(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    rows: list[RosterCsvRowValidation]


class RosterCsvImportResponse(BaseModel):
    job_id: uuid.UUID
    status: ImportStatus
    total_rows: int
    valid_rows: int
    invalid_rows: int


# --- Public Holidays ---


class PublicHolidayCreate(BaseModel):
    name: str
    holiday_date: date
    is_recurring: bool = False
    country_code: str = "GD"


class PublicHolidayPublic(BaseModel):
    id: uuid.UUID
    name: str
    holiday_date: date
    is_recurring: bool
    country_code: str
    created_by_user_id: uuid.UUID
    created_at: UtcDateTime


class PublicHolidaysPublic(BaseModel):
    data: list[PublicHolidayPublic]
    count: int


# --- Roster Revisions ---


class RosterRevisionPublic(BaseModel):
    id: uuid.UUID
    roster_period_id: uuid.UUID
    revision_number: int
    action: RosterRevisionAction
    changed_by_user_id: uuid.UUID
    summary: str | None = None
    snapshot: dict[str, object]
    created_at: UtcDateTime


class RosterRevisionsPublic(BaseModel):
    data: list[RosterRevisionPublic]
    count: int
