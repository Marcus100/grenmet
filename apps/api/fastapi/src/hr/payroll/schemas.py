import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from pydantic import Field, StringConstraints, field_validator

from src.hr.workflow.models import WorkflowStatus
from src.models import BaseModel, UtcDateTime

from .models import (
    DeductionCategory,
    DeductionKind,
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
    TableState,
    TaxMethod,
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


# ── Slice 3: deductions ─────────────────────────────────────────────────────────

Rate = Annotated[Decimal, Field(ge=0, le=1, max_digits=6, decimal_places=4)]
Minor = Annotated[int, Field(ge=0, le=10_000_000_000)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Code = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)
]
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
OrganisationId = Annotated[str, StringConstraints(min_length=1, max_length=100)]


class TaxBandCreate(BaseModel):
    width_minor: Minor | None = None
    rate: Rate


class TaxBandPublic(TaxBandCreate):
    id: uuid.UUID
    sort_order: int


class TaxTableCreate(BaseModel):
    organisation_id: OrganisationId
    code: Code
    name: Name
    method: TaxMethod = TaxMethod.ANNUALISED
    annual_allowance_minor: Minor
    deduct_social_insurance: bool = False
    effective_from: date
    effective_to: date | None = None
    source_note: Note | None = None
    bands: Annotated[list[TaxBandCreate], Field(min_length=1, max_length=20)]


class TableProvenance(BaseModel):
    """Every table is created PROVISIONAL; someone else confirms it."""

    rule_state: TableState
    created_by_user_id: uuid.UUID | None
    confirmed_by_user_id: uuid.UUID | None
    confirmed_at: UtcDateTime | None
    confirmation_note: str | None


class TaxTablePublic(TableProvenance):
    id: uuid.UUID
    organisation_id: str
    code: str
    name: str
    method: TaxMethod
    annual_allowance_minor: int
    deduct_social_insurance: bool
    effective_from: date
    effective_to: date | None
    source_note: str | None
    bands: list[TaxBandPublic] = []


class SocialInsuranceSchemeCreate(BaseModel):
    organisation_id: OrganisationId
    code: Code
    name: Name
    employee_rate: Rate
    employer_rate: Rate
    monthly_ceiling_minor: Minor
    weekly_ceiling_minor: Minor
    fortnightly_ceiling_minor: Minor | None = None
    effective_from: date
    effective_to: date | None = None
    source_note: Note | None = None


class SocialInsuranceSchemePublic(SocialInsuranceSchemeCreate, TableProvenance):
    id: uuid.UUID


class DeductionTypeCreate(BaseModel):
    organisation_id: OrganisationId
    code: Code
    name: Name
    kind: DeductionKind
    employee_rate: Rate | None = None
    employer_rate: Rate | None = None
    employee_amount_minor: Minor | None = None
    employer_amount_minor: Minor | None = None
    premium_minor: Minor | None = None
    employee_share: Rate | None = None
    is_active: bool = True
    effective_from: date
    effective_to: date | None = None
    source_note: Note | None = None


class DeductionTypePublic(DeductionTypeCreate, TableProvenance):
    id: uuid.UUID
    #: Always true: the employee's recorded authorisation and confirmation are
    #: required before any deduction type is taken. Not settable on create.
    requires_authorisation: bool


class StatutoryTablesPublic(BaseModel):
    tax_tables: list[TaxTablePublic]
    social_insurance: list[SocialInsuranceSchemePublic]
    deduction_types: list[DeductionTypePublic]


class TableStateUpdate(BaseModel):
    rule_state: TableState
    note: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
    ]


class EmployeeDeductionCreate(BaseModel):
    organisation_id: OrganisationId
    user_id: uuid.UUID
    deduction_type_id: uuid.UUID
    employee_amount_minor: Minor | None = None
    effective_from: date
    effective_to: date | None = None
    #: Reference to the employee's signed authorisation document. The deduction
    #: is taken only after the employee also confirms it themselves.
    authorisation_reference: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
        ]
        | None
    ) = None


class EmployeeDeductionPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organisation_id: str
    deduction_type_id: uuid.UUID
    employee_amount_minor: int | None
    effective_from: date
    effective_to: date | None
    authorised_at: UtcDateTime | None
    authorisation_reference: str | None
    employee_confirmed_at: UtcDateTime | None


class EmployeeDeductionsPublic(BaseModel):
    data: list[EmployeeDeductionPublic]


class DeductionLinePublic(BaseModel):
    category: DeductionCategory
    code: str
    name: str
    base_minor: int
    employee_minor: int
    employer_minor: int
    rule_state: TableState


class EmployeePaySummary(BaseModel):
    user_id: uuid.UUID
    employee_name: str
    gross_minor: int
    unpriced_line_count: int
    deductions: list[DeductionLinePublic]
    employee_deductions_minor: int
    employer_contributions_minor: int
    #: Never below zero; when deductions exceed gross the excess is here and the
    #: period cannot be approved for issue.
    net_minor: int
    shortfall_minor: int


class PaySummaryPublic(BaseModel):
    period_id: uuid.UUID
    currency: str
    #: True while any income tax or social insurance table used is PROVISIONAL;
    #: the period can then be previewed but not approved for issue.
    provisional_figures: bool
    label: str | None
    blocking_tables: list[str]
    issue_approved_at: UtcDateTime | None
    employees: list[EmployeePaySummary]


class TableStatePublic(BaseModel):
    id: uuid.UUID
    rule_state: TableState
    source_note: str | None


class MyDeductionPublic(BaseModel):
    id: uuid.UUID
    deduction_code: str
    deduction_name: str
    effective_from: date
    effective_to: date | None
    authorisation_reference: str | None
    employee_confirmed_at: UtcDateTime | None


class MyDeductionsPublic(BaseModel):
    data: list[MyDeductionPublic]


# ── Slice 4: payslips and export settings ──────────────────────────────────────


class PayslipPublic(BaseModel):
    id: uuid.UUID
    period_id: uuid.UUID
    user_id: uuid.UUID
    period_start: date
    period_end: date
    employee_name: str
    net_minor: int
    currency: str
    sha256: str
    issued_at: UtcDateTime


class PayslipsPublic(BaseModel):
    data: list[PayslipPublic]


class PayrollExportSettingsPublic(BaseModel):
    organisation_id: str
    bank_columns: list[str]
    gl_accounts: dict[str, str]
    available_bank_columns: list[str]


class PayrollExportSettingsUpdate(BaseModel):
    organisation_id: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    bank_columns: Annotated[list[str], Field(min_length=1, max_length=20)]
    gl_accounts: dict[
        str, Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
    ]
