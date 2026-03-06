import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class RequestStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class EmploymentType(str, Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    TEMPORARY = "TEMPORARY"


class EmploymentStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    TERMINATED = "TERMINATED"


class ShiftPattern(str, Enum):
    ROTATION = "ROTATION"
    FIXED = "FIXED"
    FLEX = "FLEX"


class Department(SQLModel, table=True):
    __tablename__ = "department"
    __table_args__ = {"schema": "hr"}

    id: str = Field(primary_key=True, max_length=100)
    name: str = Field(max_length=255, unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserProfile(SQLModel, table=True):
    __tablename__ = "user_profile"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    phone: str | None = Field(default=None, max_length=30)
    avatar_url: str | None = Field(default=None, max_length=500)
    status: UserStatus = Field(default=UserStatus.ACTIVE)
    first_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(max_length=100)
    display_name: str | None = Field(default=None, max_length=150)
    date_of_birth: date | None = Field(default=None)
    nationality: str | None = Field(default=None, max_length=100)
    gender: str | None = Field(default=None, max_length=50)
    created_by: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserAddress(SQLModel, table=True):
    __tablename__ = "user_address"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    line_1: str | None = Field(default=None, max_length=255)
    line_2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    parish: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EmploymentRecord(SQLModel, table=True):
    __tablename__ = "employment_record"
    __table_args__ = (
        sa.Index("ix_hr_employment_record_department_id", "department_id"),
        sa.Index("ix_hr_employment_record_supervisor_id", "supervisor_id"),
        sa.Index("ix_hr_employment_record_status", "status"),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    employee_number: str = Field(max_length=50, unique=True, index=True)
    department_id: str = Field(foreign_key="hr.department.id")
    position: str | None = Field(default=None, max_length=150)
    employment_type: EmploymentType = Field(default=EmploymentType.FULL_TIME)
    start_date: date | None = Field(default=None)
    supervisor_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    work_location: str | None = Field(default=None, max_length=255)
    status: EmploymentStatus = Field(default=EmploymentStatus.ACTIVE)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RosterPreference(SQLModel, table=True):
    __tablename__ = "roster_preference"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    default_shift_pattern: ShiftPattern = Field(default=ShiftPattern.ROTATION)
    max_night_shifts_per_month: int = Field(default=6, ge=0, le=31)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RosterPreferredShift(SQLModel, table=True):
    __tablename__ = "roster_preferred_shift"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "shift_code",
            name="uq_hr_roster_preferred_shift_user_id_shift_code",
        ),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    shift_code: str = Field(max_length=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RosterRestrictedShift(SQLModel, table=True):
    __tablename__ = "roster_restricted_shift"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "shift_code",
            name="uq_hr_roster_restricted_shift_user_id_shift_code",
        ),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    shift_code: str = Field(max_length=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LeaveBalance(SQLModel, table=True):
    __tablename__ = "leave_balance"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "leave_type", name="uq_hr_leave_balance_user_type"),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    leave_type: str = Field(max_length=50)
    balance: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LeaveCarryOver(SQLModel, table=True):
    __tablename__ = "leave_carry_over"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "leave_type",
            name="uq_hr_leave_carry_over_user_type",
        ),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    leave_type: str = Field(max_length=50)
    days: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApprovalAuthority(SQLModel, table=True):
    __tablename__ = "approval_authority"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    can_approve_leave: bool = False
    can_approve_shift_swap: bool = False
    can_approve_timesheets: bool = False
    can_approve_absentee_reports: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
