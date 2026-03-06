import uuid
from datetime import date, datetime

from pydantic import Field

from src.auth.models import RoleAssignmentScope
from src.models import BaseModel

from .models import (
    EmploymentStatus,
    EmploymentType,
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
    first_name: str
    middle_name: str | None = None
    last_name: str
    display_name: str | None = None
    date_of_birth: date | None = None
    nationality: str | None = None
    gender: str | None = None


class AddressPublic(BaseModel):
    line_1: str | None = None
    line_2: str | None = None
    city: str | None = None
    parish: str | None = None
    postal_code: str | None = None
    country: str | None = None


class DepartmentPublic(BaseModel):
    id: str
    name: str


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
    created_at: datetime | None = None
    created_by: str | None = None
    updated_at: datetime | None = None


class UserProfilePublic(BaseModel):
    id: uuid.UUID
    identity: ProfileIdentityPublic
    profile: ProfileDetailsPublic
    address: AddressPublic
    employment: EmploymentPublic
    roles: list[RolePublic] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    roster_preferences: RosterPreferencesPublic
    leave: LeavePublic
    approval_authority: ApprovalAuthorityPublic
    audit: ProfileAuditPublic


class ProfileDetailsUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    date_of_birth: date | None = None
    nationality: str | None = Field(default=None, max_length=100)
    gender: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=30)
    avatar_url: str | None = Field(default=None, max_length=500)
    status: UserStatus | None = None


class AddressUpdate(BaseModel):
    line_1: str | None = Field(default=None, max_length=255)
    line_2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    parish: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)


class RosterPreferencesUpdate(BaseModel):
    default_shift_pattern: ShiftPattern | None = None
    preferred_shifts: list[str] | None = None
    restricted_shifts: list[str] | None = None
    max_night_shifts_per_month: int | None = Field(default=None, ge=0, le=31)


class UserProfileUpdateMe(BaseModel):
    profile: ProfileDetailsUpdate | None = None
    address: AddressUpdate | None = None
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
