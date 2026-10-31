import re
import uuid
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, model_validator

from src.models import BaseModel, UtcDateTime

from .models import (
    ImportStatus,
    RosterAvailability,
    RosterPeriodStatus,
    RosterRevisionAction,
    RuleOverrideContext,
    ShiftCategory,
    WorkerType,
    WorkPattern,
)
from .rules import RuleViolation

_CONTROL = re.compile(r"[\x01-\x08\x0b-\x1f\x7f-\x9f]")


def _clean_reason(value: str | None) -> str | None:
    """A supervisor's override reason: NUL is refused (422), other control
    characters are removed; newlines and tabs are kept."""
    if value is None:
        return None
    if "\x00" in value:
        raise ValueError("The reason contains a NUL character")
    return _CONTROL.sub("", value)


def clean_reason(value: str | None) -> str | None:
    return _clean_reason(value)


#: Optional reason to save a change that breaks roster rules (#380).
OverrideReason = Annotated[
    Annotated[str, Field(max_length=1000)] | None,
    AfterValidator(_clean_reason),
    Field(
        default=None,
        description=(
            "Required to save a change that breaks a roster rule; recorded with "
            "the supervisor, the time and the rules overridden."
        ),
    ),
]


class ShiftCatalogPublic(BaseModel):
    code: str
    label: str
    category: ShiftCategory
    start_time: str | None = None
    end_time: str | None = None
    ends_next_day: bool
    break_minutes: int = Field(
        default=0, description="Unpaid break inside the shift, in minutes."
    )
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
    break_minutes: int = Field(
        default=0, ge=0, le=240, description="Unpaid break inside the shift."
    )
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
    break_minutes: int | None = Field(default=None, ge=0, le=240)
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
    rule_override_reason: OverrideReason = None


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
    rule_warning_count: int = Field(
        default=0,
        description=(
            "Roster rule warnings that stopped publishing; review them and publish "
            "from the roster screen."
        ),
    )


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
    rule_override_reason: OverrideReason = None


class RosterAssignmentPublic(BaseModel):
    id: uuid.UUID
    roster_period_id: uuid.UUID
    user_id: uuid.UUID
    assignment_date: date
    shift_code: str
    remarks: str | None = None
    availability: RosterAvailability = RosterAvailability.SCHEDULED


class RosterPeriodDetails(BaseModel):
    period: RosterPeriodPublic
    assignments: list[RosterAssignmentPublic]


# --- Calendar feed ---


class RosterCalendarEntry(BaseModel):
    """One rostered day for one person, expanded to concrete time.

    `starts_at_local`/`ends_at_local` are ISO-8601 **without an offset**: they are
    department-local wall-clock times, exactly as the shift catalog records them
    and as the printed roster reads. They are deliberately not UtcDateTime — a
    05:30 morning shift is 05:30 on the wall in Grenada, and stamping it UTC
    would move it four hours. Codes with no clock time (Off, Leave, Vacation,
    Study Leave) carry `all_day: true` and no times.
    """

    user_id: uuid.UUID
    display_name: str
    roster_name: str | None = None
    assignment_date: date
    shift_code: str
    label: str
    category: ShiftCategory
    starts_at_local: str | None = None
    ends_at_local: str | None = None
    all_day: bool
    #: The period is still DRAFT — visible only to roster managers, and not yet
    #: the signed plan of record.
    is_draft: bool
    availability: RosterAvailability = RosterAvailability.SCHEDULED


class RosterCalendarPublic(BaseModel):
    data: list[RosterCalendarEntry]
    count: int


class RosterCsvValidationRequest(BaseModel):
    department_id: str
    file_name: str = "roster.csv"
    roster_period_id: uuid.UUID | None = None
    csv_text: str
    #: Used on import into a published roster; ignored by validation.
    rule_override_reason: OverrideReason = None


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
    source: str | None = None
    needs_verification: bool = False


class PublicHolidayUpdate(BaseModel):
    name: str
    holiday_date: date
    is_recurring: bool = False
    source: str | None = None
    needs_verification: bool = False


class ProvisionalHolidaysRequest(BaseModel):
    year: int


class PublicHolidayPublic(BaseModel):
    id: uuid.UUID
    name: str
    holiday_date: date
    is_recurring: bool
    country_code: str
    source: str | None = None
    needs_verification: bool = False
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


class RosterRulesPublic(BaseModel):
    department_id: str
    min_rest_hours: Decimal | None = None
    max_consecutive_days: int | None = None
    max_weekly_hours: Decimal | None = None


class RosterRulesUpdate(BaseModel):
    """Replace all limits for a department; null disables a rule."""

    min_rest_hours: Decimal | None = Field(
        default=None, ge=0, le=72, decimal_places=2, allow_inf_nan=False
    )
    max_consecutive_days: int | None = Field(default=None, ge=1, le=31)
    max_weekly_hours: Decimal | None = Field(
        default=None, gt=0, le=168, decimal_places=2, allow_inf_nan=False
    )


class RuleViolationPublic(BaseModel):
    code: str
    user_id: uuid.UUID
    start_date: date
    end_date: date
    observed: Decimal
    limit: Decimal
    detail: str


def violation_public(v: RuleViolation) -> RuleViolationPublic:
    return RuleViolationPublic(
        code=v.code.value,
        user_id=v.user_id,
        start_date=v.start_date,
        end_date=v.end_date,
        observed=v.observed,
        limit=v.limit,
        detail=v.detail,
    )


class RosterRuleCheckPublic(BaseModel):
    period_id: uuid.UUID
    rules: RosterRulesPublic
    violations: list[RuleViolationPublic]
    count: int
    rule_set: RosterRuleSetPublic | None = None


# --- Roster rule sets (#380) ---

_HHMM = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"
Rate = Annotated[Decimal, Field(ge=1, le=10, decimal_places=2, allow_inf_nan=False)]
DayHours = Annotated[Decimal, Field(ge=0, le=24, decimal_places=2, allow_inf_nan=False)]
LimitHours = Annotated[
    Decimal | None, Field(gt=0, le=168, decimal_places=2, allow_inf_nan=False)
]


class RuleSetSource(str, Enum):
    """Where an effective rule set comes from."""

    DEFAULT = "DEFAULT"
    ORGANISATION = "ORGANISATION"
    DEPARTMENT = "DEPARTMENT"


class RosterRuleSetUpdate(BaseModel):
    """Replace every rule value; a null limit disables that rule."""

    work_pattern: WorkPattern = WorkPattern.ROTATION
    worker_type: WorkerType = WorkerType.SHIFT
    max_consecutive_shifts: int | None = Field(default=None, ge=1, le=31)
    min_days_off_after_run: int | None = Field(default=None, ge=1, le=14)
    shift_daily_hours: LimitHours = None
    shift_weekly_hours: LimitHours = None
    non_shift_daily_hours: LimitHours = None
    non_shift_weekly_hours: LimitHours = None
    weekend_window_weeks: int | None = Field(default=None, ge=1, le=13)
    notice_days: int | None = Field(default=None, ge=1, le=60)
    overtime_bands_enabled: bool = True
    weekday_first_hours: DayHours = Decimal(4)
    weekday_first_rate: Rate = Decimal("1.5")
    weekday_after_rate: Rate = Decimal(2)
    saturday_window_start: str = Field(default="08:00", pattern=_HHMM)
    saturday_window_end: str = Field(default="12:00", pattern=_HHMM)
    saturday_window_rate: Rate = Decimal("1.5")
    saturday_after_rate: Rate = Decimal(2)
    rest_day_first_hours: DayHours = Decimal(8)
    rest_day_first_rate: Rate = Decimal(2)
    rest_day_after_rate: Rate = Decimal(3)
    after_midnight_rate: Rate = Decimal(2)

    @model_validator(mode="after")
    def _saturday_window_order(self) -> RosterRuleSetUpdate:
        if self.saturday_window_start >= self.saturday_window_end:
            raise ValueError("The Saturday window must start before it ends")
        return self


class RosterRuleSetPublic(RosterRuleSetUpdate):
    organisation_id: str
    department_id: str | None = None
    source: RuleSetSource
    updated_by_user_id: uuid.UUID | None = None
    updated_at: UtcDateTime | None = None


class RosterRuleWarningsErrorPublic(BaseModel):
    """409 body. An ordinary conflict carries only ``detail``. Roster rule
    warnings add ``code: ROSTER_RULE_WARNINGS``, the ``context`` and the
    ``violations``; resend with ``rule_override_reason`` to save anyway."""

    detail: str
    code: Literal["ROSTER_RULE_WARNINGS"] | None = None
    context: RuleOverrideContext | None = None
    violations: list[RuleViolationPublic] = Field(default_factory=list)


def with_rule_warnings(
    responses: dict[int | str, dict[str, object]],
) -> dict[int | str, dict[str, object]]:
    """Declare the 409 of a route that can return roster rule warnings, keeping
    any conflict it already documents."""
    existing = responses.get(409, {})
    description = str(existing.get("description", "")).rstrip(".")
    warning = (
        "or the change breaks roster rules (code ROSTER_RULE_WARNINGS); resend "
        "with rule_override_reason to save anyway"
    )
    return {
        **responses,
        409: {
            "model": RosterRuleWarningsErrorPublic,
            "description": f"{description}; {warning}"
            if description
            else warning.capitalize(),
        },
    }


class RosterPublishRequest(BaseModel):
    rule_override_reason: OverrideReason = None


class RosterRuleProfilePublic(BaseModel):
    user_id: uuid.UUID
    full_name: str
    employee_number: str | None = None
    union_covered: bool
    worker_type: WorkerType | None = Field(
        default=None, description="Per-employee override; null uses the department's."
    )
    effective_worker_type: WorkerType


class RosterRuleProfilesPublic(BaseModel):
    data: list[RosterRuleProfilePublic]
    count: int


class RosterRuleProfileUpdate(BaseModel):
    union_covered: bool
    worker_type: WorkerType | None = None


class RosterRuleOverridePublic(BaseModel):
    id: uuid.UUID
    department_id: str
    context: RuleOverrideContext
    entity_type: str
    entity_id: str
    rule_codes: list[str]
    violations: list[RuleViolationPublic]
    reason: str
    overridden_by_user_id: uuid.UUID
    overridden_by_name: str
    created_at: UtcDateTime


class RosterRuleOverridesPublic(BaseModel):
    data: list[RosterRuleOverridePublic]
    count: int


class OvertimeBandPublic(BaseModel):
    """Overtime hours at one rate multiplier. Hours only; no pay amount."""

    rate: Decimal
    hours: Decimal


RosterRuleCheckPublic.model_rebuild()
