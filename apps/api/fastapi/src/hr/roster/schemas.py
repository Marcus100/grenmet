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


class ShiftCatalogCreate(BaseModel):
    code: str = Field(max_length=10)
    label: str = Field(max_length=120)
    category: ShiftCategory
    start_time: str | None = Field(default=None, max_length=5)
    end_time: str | None = Field(default=None, max_length=5)
    ends_next_day: bool = False
    # Advanced overrides — when None, the service derives them from the category.
    counts_as_work_hours: bool | None = None
    needs_reason: bool | None = None
    needs_approval: bool | None = None


class ShiftCatalogUpdate(BaseModel):
    # All optional — only fields explicitly sent are applied (exclude_unset).
    # `code` (the primary key) is immutable and intentionally not updatable.
    label: str | None = Field(default=None, max_length=120)
    category: ShiftCategory | None = None
    start_time: str | None = Field(default=None, max_length=5)
    end_time: str | None = Field(default=None, max_length=5)
    ends_next_day: bool | None = None
    counts_as_work_hours: bool | None = None
    needs_reason: bool | None = None
    needs_approval: bool | None = None
    is_active: bool | None = None


class RosterGridImportRequest(BaseModel):
    department_id: str
    period_start: date
    period_end: date
    csv_text: str
    file_name: str = "roster.csv"
    publish: bool = False


class RosterGridPreview(BaseModel):
    total_people: int
    matched_people: int
    unmatched_names: list[str]
    total_assignments: int
    errors: list[str]
    can_import: bool


class RosterGridImportResult(BaseModel):
    roster_period_id: uuid.UUID
    total_assignments: int
    published: bool


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
