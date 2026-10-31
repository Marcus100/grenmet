import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from pydantic import Field, StringConstraints, field_validator

from src.hr.workflow.models import WorkflowStatus
from src.models import BaseModel, UtcDateTime

from .models import (
    PayBasis,
    PayFrequency,
    PayItemKind,
    PayItemMethod,
    PayItemUnit,
    PayLineKind,
    PayPeriodStatus,
    PayRunKind,
    RateKind,
    RuleState,
)

Reason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)
]


class PayItemPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    code: str
    name: str
    kind: PayItemKind
    unit: PayItemUnit
    method: PayItemMethod
    params: dict[str, Any]
    effective_from: date
    effective_to: date | None
    rule_state: RuleState
    source_reference: str | None
    is_active: bool
    #: True when preparers may add lines by hand (MANUAL items, and overtime
    #: bands while the roster rules engine is not connected).
    accepts_manual_lines: bool


class PayItemsPublic(BaseModel):
    data: list[PayItemPublic]
    #: False until the roster rules engine (#380) provides overtime bands.
    overtime_bands_available: bool


class PayCalendarCreate(BaseModel):
    organisation_id: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)
    ]
    approval_department_id: Annotated[
        str, StringConstraints(min_length=1, max_length=100)
    ]
    #: Empty: the organisation's default (fortnightly for GAA, else monthly).
    frequency: PayFrequency | None = None
    #: Fortnightly calendars: the first day of any one pay fortnight.
    anchor_date: date | None = None
    is_default: bool = True


class PayCalendarPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    name: str
    frequency: PayFrequency
    approval_department_id: str
    is_default: bool
    anchor_date: date | None
    rule_state: RuleState
    created_at: UtcDateTime


class PayCalendarsPublic(BaseModel):
    data: list[PayCalendarPublic]


class PayPeriodCreate(BaseModel):
    calendar_id: uuid.UUID
    start_date: date
    #: Leave empty for the calendar's default: the last day of the start month
    #: (monthly) or 13 days after the start (fortnightly).
    end_date: date | None = None


class PayPeriodPublic(BaseModel):
    id: uuid.UUID
    calendar_id: uuid.UUID
    calendar_name: str
    organisation_id: str
    start_date: date
    end_date: date
    status: PayPeriodStatus
    workflow_instance_id: uuid.UUID | None
    review_status: WorkflowStatus | None
    computed_at: UtcDateTime | None
    submitted_at: UtcDateTime | None
    approved_at: UtcDateTime | None
    exported_at: UtcDateTime | None
    export_count: int
    closed_at: UtcDateTime | None


class PayPeriodsPublic(BaseModel):
    data: list[PayPeriodPublic]
    count: int


class PayItemTotal(BaseModel):
    pay_item_id: uuid.UUID
    code: str
    name: str
    unit: PayItemUnit
    rule_state: RuleState
    run_kind: PayRunKind
    quantity: Decimal
    line_count: int


class PayPeriodDetail(BaseModel):
    period: PayPeriodPublic
    totals: list[PayItemTotal]
    employee_count: int
    line_count: int
    #: What the caller may do now: compute, add_line, submit, approve, return,
    #: export, close. The server checks each again when it is attempted.
    allowed_actions: list[str]
    #: The caller prepared this period, so they cannot approve or return it.
    prepared_by_caller: bool
    overtime_bands_available: bool


class PayLinePublic(BaseModel):
    id: uuid.UUID
    run_kind: PayRunKind
    line_kind: PayLineKind
    user_id: uuid.UUID
    employee_name: str
    employee_number: str | None
    payroll_reference: str | None
    department_id: str
    pay_item_id: uuid.UUID
    pay_item_code: str
    pay_item_name: str
    unit: PayItemUnit
    rule_state: RuleState
    quantity: Decimal
    work_date: date | None
    source_type: str
    source_id: uuid.UUID | None
    reason: str | None
    adjusts_period_id: uuid.UUID | None
    adjusts_line_id: uuid.UUID | None
    created_at: UtcDateTime


class PayLinesPublic(BaseModel):
    data: list[PayLinePublic]
    count: int


class PayLineManualCreate(BaseModel):
    user_id: uuid.UUID
    pay_item_id: uuid.UUID
    quantity: Annotated[Decimal, Field(max_digits=8, decimal_places=2)]
    reason: Reason
    work_date: date | None = None
    #: A line in an approved period that this one corrects. The new line then
    #: goes in this period's ADJUSTMENT run and may be negative.
    adjusts_line_id: uuid.UUID | None = None

    @field_validator("quantity")
    @classmethod
    def nonzero(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("Quantity cannot be zero")
        return value


class PayPeriodReview(BaseModel):
    comments: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None
    ) = None


class PayPeriodReturn(BaseModel):
    comments: Reason


class EmployeePayProfilePublic(BaseModel):
    user_id: uuid.UUID
    employee_name: str
    employee_number: str | None
    department_id: str
    calendar_id: uuid.UUID | None
    shift_worker: bool | None
    #: The flag payroll uses: the person's own, else the department default.
    effective_shift_worker: bool
    payroll_reference: str | None


class EmployeePayProfilesPublic(BaseModel):
    data: list[EmployeePayProfilePublic]
    count: int


class EmployeePayProfileUpdate(BaseModel):
    organisation_id: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    calendar_id: uuid.UUID | None = None
    shift_worker: bool | None = None
    payroll_reference: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)
        ]
        | None
    ) = None
    #: Needed to put an hourly-paid person on a calendar longer than fortnightly.
    calendar_override_reason: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)
        ]
        | None
    ) = None


class PayrollDepartmentSettingPublic(BaseModel):
    department_id: str
    department_name: str
    shift_worker_default: bool


class PayrollDepartmentSettingsPublic(BaseModel):
    data: list[PayrollDepartmentSettingPublic]


class PayrollDepartmentSettingUpdate(BaseModel):
    shift_worker_default: bool


# ── Slice 2: gross pay. Only organisation-wide hr.payroll.read.amounts sees these.


class PayLineAmountPublic(PayLinePublic):
    amount_minor: int | None
    hourly_rate: Decimal | None
    multiplier: Decimal | None
    fixed_amount_minor: int | None


class EmployeeGrossPublic(BaseModel):
    user_id: uuid.UUID
    employee_name: str
    employee_number: str | None
    gross_minor: int
    #: Lines with no rate or no basic pay on file; never counted as zero.
    unpriced_line_count: int


class PayPeriodAmountsPublic(BaseModel):
    period_id: uuid.UUID
    currency: str
    gross_minor: int
    employees: list[EmployeeGrossPublic]
    lines: list[PayLineAmountPublic]


class PayItemRateCreate(BaseModel):
    pay_item_id: uuid.UUID
    rate_kind: RateKind
    multiplier: (
        Annotated[Decimal, Field(gt=0, max_digits=6, decimal_places=3)] | None
    ) = None
    amount_minor: Annotated[int, Field(ge=0, le=100_000_000)] | None = None
    guaranteed_hours: (
        Annotated[Decimal, Field(gt=0, max_digits=6, decimal_places=2)] | None
    ) = None
    guaranteed_multiplier: (
        Annotated[Decimal, Field(gt=0, max_digits=6, decimal_places=3)] | None
    ) = None
    effective_from: date
    effective_to: date | None = None
    rule_state: RuleState = RuleState.PROVISIONAL
    source_reference: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
    ) = None


class PayItemRatePublic(BaseModel):
    id: uuid.UUID
    pay_item_id: uuid.UUID
    organisation_id: str
    rate_kind: RateKind
    multiplier: Decimal | None
    amount_minor: int | None
    guaranteed_hours: Decimal | None
    guaranteed_multiplier: Decimal | None
    currency: str
    effective_from: date
    effective_to: date | None
    rule_state: RuleState
    source_reference: str | None


class PayItemRatesPublic(BaseModel):
    data: list[PayItemRatePublic]


class EmployeeBasicPayCreate(BaseModel):
    organisation_id: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    user_id: uuid.UUID
    pay_basis: PayBasis
    #: Monthly salary (SALARIED) or hourly rate (HOURLY), in minor units (cents).
    amount_minor: Annotated[int, Field(gt=0, le=100_000_000)]
    standard_monthly_hours: Annotated[
        Decimal, Field(gt=0, le=744, max_digits=6, decimal_places=2)
    ]
    effective_from: date
    effective_to: date | None = None
    reason: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
    ) = None
    #: Needed when an hourly-paid person sits on a calendar longer than
    #: fortnightly (Employment Act wage-period rule, secondary source).
    calendar_override_reason: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)
        ]
        | None
    ) = None


class EmployeeBasicPayPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    employee_name: str
    organisation_id: str
    pay_basis: PayBasis
    amount_minor: int
    standard_monthly_hours: Decimal
    currency: str
    effective_from: date
    effective_to: date | None
    reason: str | None


class EmployeeBasicPaysPublic(BaseModel):
    data: list[EmployeeBasicPayPublic]
