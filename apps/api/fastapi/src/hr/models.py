import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from src.utils.datetime import utc_now


class RequestStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class Gender(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    UNSPECIFIED = "UNSPECIFIED"


class Parish(str, Enum):
    """Grenada's six parishes plus its two island dependencies."""

    SAINT_GEORGE = "SAINT_GEORGE"
    SAINT_ANDREW = "SAINT_ANDREW"
    SAINT_DAVID = "SAINT_DAVID"
    SAINT_JOHN = "SAINT_JOHN"
    SAINT_MARK = "SAINT_MARK"
    SAINT_PATRICK = "SAINT_PATRICK"
    CARRIACOU = "CARRIACOU"
    PETITE_MARTINIQUE = "PETITE_MARTINIQUE"


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


class Organisation(SQLModel, table=True):
    __tablename__ = "organisation"
    __table_args__ = {"schema": "hr"}

    id: str = Field(primary_key=True, max_length=100)
    code: str = Field(max_length=100, unique=True)
    name: str = Field(max_length=255)


class Department(SQLModel, table=True):
    __tablename__ = "department"
    __table_args__ = (
        sa.UniqueConstraint("id", "organisation_id", name="uq_hr_department_id_org"),
        sa.UniqueConstraint(
            "organisation_id", "code", name="uq_hr_department_org_code"
        ),
        sa.UniqueConstraint(
            "organisation_id", "name", name="uq_hr_department_org_name"
        ),
        {"schema": "hr"},
    )

    id: str = Field(primary_key=True, max_length=100)
    organisation_id: str = Field(
        foreign_key="hr.organisation.id", index=True, max_length=100
    )
    code: str = Field(max_length=100)
    name: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Grade(SQLModel, table=True):
    """A department's seniority band, in the order the printed roster groups them.

    Grades are department-scoped, like the shift catalog: Meteorology's bands
    (Manager .. Meteorological Cadet) are not ATS's or Security's. `rank` is the
    seniority order used to group and sort staff; `establishment_band` is the
    GAA-wide establishment ladder the band maps onto (Senior Supervisor,
    Supervisor, Professional, ...), carried so authority-wide reporting is a data
    load rather than a migration.
    """

    __tablename__ = "grade"
    __table_args__ = (
        sa.UniqueConstraint(
            "department_id", "code", name="uq_hr_grade_department_code"
        ),
        {"schema": "hr"},
    )

    id: str = Field(primary_key=True, max_length=120)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    code: str = Field(max_length=50)
    label: str = Field(max_length=150)
    rank: int = Field(ge=1)
    establishment_band: str | None = Field(default=None, max_length=100)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class UserProfile(SQLModel, table=True):
    """HR profile extension by user_id. Names come from auth User (canonical source)."""

    __tablename__ = "user_profile"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    phone: str | None = Field(default=None, max_length=30)
    date_of_birth: date | None = Field(default=None)
    nationality: str | None = Field(default=None, max_length=100)
    gender: Gender | None = Field(default=None)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    emergency_contact_relationship: str | None = Field(default=None, max_length=100)
    created_by: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


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
    parish: Parish | None = Field(default=None)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default="Grenada", max_length=100)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class EmploymentRecord(SQLModel, table=True):
    __tablename__ = "employment_record"
    __table_args__ = (
        sa.Index("ix_hr_employment_record_department_id", "department_id"),
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_hr_employment_department_org",
        ),
        sa.UniqueConstraint(
            "organisation_id", "employee_number", name="uq_hr_employment_org_number"
        ),
        sa.Index("ix_hr_employment_record_supervisor_id", "supervisor_id"),
        sa.Index("ix_hr_employment_record_status", "status"),
        sa.Index("ix_hr_employment_record_grade_id", "grade_id"),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    employee_number: str | None = Field(default=None, max_length=50, index=True)
    organisation_id: str = Field(
        foreign_key="hr.organisation.id", index=True, max_length=100
    )
    department_id: str = Field(foreign_key="hr.department.id")
    grade_id: str | None = Field(
        default=None, foreign_key="hr.grade.id", ondelete="SET NULL"
    )
    # What the printed duty roster prints for this person. It is not always the
    # personnel record's initial + surname: the GMS roster prints "J. Charles"
    # for Jude Andre Charles (acharles) and "K. Bedeau" for Kenrick Dieonne
    # Bedeau (dbedeau). Null means "derive it from the personnel record".
    roster_name: str | None = Field(default=None, max_length=60)
    position: str | None = Field(default=None, max_length=150)
    employment_type: EmploymentType | None = Field(default=None)
    start_date: date | None = Field(default=None)
    supervisor_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    work_location: str | None = Field(default=None, max_length=255)
    status: EmploymentStatus = Field(default=EmploymentStatus.ACTIVE)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class RosterPreference(SQLModel, table=True):
    __tablename__ = "roster_preference"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, index=True, ondelete="CASCADE"
    )
    default_shift_pattern: ShiftPattern = Field(default=ShiftPattern.ROTATION)
    max_night_shifts_per_month: int = Field(default=6, ge=0, le=31)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


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
    created_at: datetime = Field(default_factory=utc_now)


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
    created_at: datetime = Field(default_factory=utc_now)


class LeaveBalance(SQLModel, table=True):
    __tablename__ = "leave_balance"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "leave_type", name="uq_hr_leave_balance_user_type"
        ),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    leave_type: str = Field(max_length=50)
    balance: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=utc_now)


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
    updated_at: datetime = Field(default_factory=utc_now)


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
    can_approve_parking: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
