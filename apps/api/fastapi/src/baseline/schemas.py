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
