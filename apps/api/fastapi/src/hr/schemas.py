import uuid
from datetime import date

from pydantic import Field

from src.auth.models import RoleAssignmentScope, Title
from src.models import BaseModel, UtcDateTime

from .models import (
    EmploymentStatus,
    EmploymentType,
    Gender,
    Parish,
    ShiftPattern,
    UserStatus,
)


class ProfileIdentityPublic(BaseModel):
    username: str
    email: str
    phone: str | None = None
    avatar_url: str | None = None
    status: UserStatus


class ProfileDetailsPublic(BaseModel):
    title: Title | None = None
    first_name: str
    middle_name: str | None = None
    last_name: str
    display_name: str | None = None
    date_of_birth: date | None = None
    nationality: str | None = None
    gender: Gender | None = None


class AddressPublic(BaseModel):
    line_1: str | None = None
    line_2: str | None = None
    city: str | None = None
    parish: Parish | None = None
    postal_code: str | None = None
    country: str | None = None


class EmergencyContactPublic(BaseModel):
    name: str | None = None
    phone: str | None = None
    relationship: str | None = None


class DepartmentPublic(BaseModel):
    id: str
    name: str


class DepartmentsPublic(BaseModel):
    data: list[DepartmentPublic]
    count: int


class DepartmentCreate(BaseModel):
    id: str = Field(max_length=100, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(max_length=255)


class DepartmentUpdate(BaseModel):
    name: str = Field(max_length=255)


class EmploymentCreate(BaseModel):
    employee_number: str = Field(max_length=50)
    department_id: str = Field(max_length=100)
    position: str | None = Field(default=None, max_length=150)
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    start_date: date | None = None
    supervisor_id: uuid.UUID | None = None
    work_location: str | None = Field(default=None, max_length=255)


class EmploymentRecordPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    employee_number: str
    department_id: str
    position: str | None = None
    employment_type: EmploymentType
    start_date: date | None = None
    supervisor_id: uuid.UUID | None = None
    work_location: str | None = None
    status: EmploymentStatus


class DepartmentMemberPublic(BaseModel):
    user_id: uuid.UUID
    first_name: str
    last_name: str
    employee_number: str
    position: str | None = None
    employment_status: EmploymentStatus


class DepartmentMembersPublic(BaseModel):
    data: list[DepartmentMemberPublic]
    count: int


class EmploymentPublic(BaseModel):
    employee_number: str | None = None
    department: DepartmentPublic | None = None
    position: str | None = None
    employment_type: EmploymentType | None = None
    start_date: date | None = None
    supervisor_id: uuid.UUID | None = None
    work_location: str | None = None
    status: EmploymentStatus | None = None


class RolePublic(BaseModel):
    name: str
    scope: RoleAssignmentScope


class RosterPreferencesPublic(BaseModel):
    default_shift_pattern: ShiftPattern = ShiftPattern.ROTATION
    preferred_shifts: list[str] = Field(default_factory=list)
    restricted_shifts: list[str] = Field(default_factory=list)
    max_night_shifts_per_month: int = 6


class LeavePublic(BaseModel):
    balances: dict[str, int] = Field(default_factory=dict)
    carry_over: dict[str, int] = Field(default_factory=dict)


class ApprovalAuthorityPublic(BaseModel):
    can_approve_leave: bool = False
    can_approve_shift_swap: bool = False
    can_approve_timesheets: bool = False
    can_approve_absentee_reports: bool = False


class ProfileAuditPublic(BaseModel):
    created_at: UtcDateTime | None = None
    created_by: uuid.UUID | None = None
    updated_at: UtcDateTime | None = None


class UserProfilePublic(BaseModel):
    id: uuid.UUID
    identity: ProfileIdentityPublic
    profile: ProfileDetailsPublic
    address: AddressPublic
    emergency_contact: EmergencyContactPublic
    employment: EmploymentPublic
    roles: list[RolePublic] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    roster_preferences: RosterPreferencesPublic
    leave: LeavePublic
    approval_authority: ApprovalAuthorityPublic
    audit: ProfileAuditPublic


class ProfileDetailsUpdate(BaseModel):
    title: Title | None = None
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    date_of_birth: date | None = None
    nationality: str | None = Field(default=None, max_length=100)
    gender: Gender | None = None
    phone: str | None = Field(default=None, max_length=30)


class AddressUpdate(BaseModel):
    line_1: str | None = Field(default=None, max_length=255)
    line_2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    parish: Parish | None = None
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)


class RosterPreferencesUpdate(BaseModel):
    default_shift_pattern: ShiftPattern | None = None
    preferred_shifts: list[str] | None = None
    restricted_shifts: list[str] | None = None
    max_night_shifts_per_month: int | None = Field(default=None, ge=0, le=31)


class EmergencyContactUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    relationship: str | None = Field(default=None, max_length=100)


class UserProfileUpdateMe(BaseModel):
    profile: ProfileDetailsUpdate | None = None
    address: AddressUpdate | None = None
    emergency_contact: EmergencyContactUpdate | None = None
    roster_preferences: RosterPreferencesUpdate | None = None


class EmploymentUpdate(BaseModel):
    employee_number: str | None = Field(default=None, max_length=50)
    department_id: str | None = Field(default=None, max_length=100)
    position: str | None = Field(default=None, max_length=150)
    employment_type: EmploymentType | None = None
    start_date: date | None = None
    supervisor_id: uuid.UUID | None = None
    work_location: str | None = Field(default=None, max_length=255)
    status: EmploymentStatus | None = None


class ApprovalAuthorityUpdate(BaseModel):
    can_approve_leave: bool | None = None
    can_approve_shift_swap: bool | None = None
    can_approve_timesheets: bool | None = None
    can_approve_absentee_reports: bool | None = None


class EmploymentAdminUpdate(BaseModel):
    employment: EmploymentUpdate | None = None
    approval_authority: ApprovalAuthorityUpdate | None = None
