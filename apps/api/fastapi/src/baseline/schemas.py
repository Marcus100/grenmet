import uuid
from datetime import date
from decimal import Decimal

from pydantic import Field

from src.hr.leave.models import LeaveType
from src.hr.models import EmploymentType
from src.models import BaseModel, UtcDateTime


class StaffCard(BaseModel):
    email_verified: bool = False
    account_approved: bool = True
    employment_ready: bool = False
    issued_at: UtcDateTime | None = None
    user_id: uuid.UUID
    number: str
    name: str
    department: str
    grade: str
    photo: str | None = None
    status: str


class StaffSetup(BaseModel):
    registration_pending: bool = False
    user_id: uuid.UUID
    email: str
    name: str
    number: str
    department_id: str
    grade_id: str
    mailbox_ready: bool
    email_verified: bool
    employment_ready: bool
    employee_number: str | None = None
    employment_type: EmploymentType | None = None
    start_date: date | None = None
    supervisor_id: uuid.UUID | None = None
    status: str


class GradeInput(BaseModel):
    department_id: str = Field(min_length=1, max_length=100)
    code: str = Field(pattern=r"^[A-Z0-9_]+$", max_length=50)
    label: str = Field(min_length=1, max_length=150)
    rank: int = Field(ge=1, le=1000)
    establishment_band: str | None = Field(default=None, max_length=100)
    is_active: bool = True


class GradeSetup(GradeInput):
    id: str


class StaffInput(BaseModel):
    department_id: str
    grade_id: str
    employee_number: str | None = Field(default=None, min_length=1, max_length=50)
    employment_type: EmploymentType | None = None
    start_date: date | None = None
    supervisor_id: uuid.UUID | None = None
    mailbox_ready: bool = False


class BalanceInput(BaseModel):
    leave_type: LeaveType
    balance: Decimal = Field(ge=0, le=9999, decimal_places=2)
    reason: str = Field(min_length=5, max_length=200)


class PolicyInput(BaseModel):
    allow_self_approval: bool = False
    require_distinct_approvers: bool = True


class PolicyPublic(PolicyInput):
    key: str


class RoleConfiguration(BaseModel):
    id: uuid.UUID
    name: str
    permission_keys: list[str]


class RolePermissionsInput(BaseModel):
    permission_keys: list[str] = Field(max_length=100)


class ProductAccessInput(BaseModel):
    grade_ids: list[str] = Field(max_length=50)


class ProductAccessPublic(ProductAccessInput):
    kind: str


class ProductAccessCurrent(BaseModel):
    allowed_kinds: list[str]


class CataloguePreview(BaseModel):
    department_id: str
    missing_grade_ids: list[str]
    missing_policy_keys: list[str]
    missing_workflow_types: list[str]
    conflicts: list[str]


class CatalogueApply(BaseModel):
    department_id: str


class UnitSpec(BaseModel):
    id: str
    name: str
    parent_id: str | None
    source_slide: int


class PositionSpec(BaseModel):
    id: str
    unit_id: str
    reports_to_position_id: str | None = None
    additional_connection_id: str | None = None
    grade_code: str
    title: str
    authorised_posts: int | None = Field(ge=0)
    reported_vacancies: int | None = Field(ge=0)
    source_slide: int
    notes: str


class OrganisationCatalogue(BaseModel):
    version: str
    source: str
    source_date: str
    units: list[UnitSpec]
    positions: list[PositionSpec]
    notes: list[str]


class OrganisationPreview(BaseModel):
    catalogue: OrganisationCatalogue
    missing_departments: list[str] = Field(default_factory=list)
    missing_units: list[str] = Field(default_factory=list)
    missing_positions: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    gms_staff_by_grade: dict[str, int] = Field(default_factory=dict)
    gms_differences: list[str] = Field(default_factory=list)
