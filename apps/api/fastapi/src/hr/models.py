import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
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


class Organisation(Base):
    __tablename__ = "organisation"
    __table_args__ = {"schema": "hr"}

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(255))


class Department(Base):
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

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class Grade(Base):
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

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    code: Mapped[str] = mapped_column(String(50))
    label: Mapped[str] = mapped_column(String(150))
    rank: Mapped[int]
    establishment_band: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class UserProfile(Base):
    """HR profile extension by user_id. Names come from auth User (canonical source)."""

    __tablename__ = "user_profile"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, index=True
    )
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    date_of_birth: Mapped[date | None]
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[Gender | None]
    emergency_contact_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    emergency_contact_phone: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    emergency_contact_relationship: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class UserAddress(Base):
    __tablename__ = "user_address"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, index=True
    )
    line_1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parish: Mapped[Parish | None]
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), default="Grenada")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class EmploymentRecord(Base):
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

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, index=True
    )
    employee_number: Mapped[str | None] = mapped_column(String(50), index=True)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    grade_id: Mapped[str | None] = mapped_column(
        ForeignKey("hr.grade.id", ondelete="SET NULL"), nullable=True
    )
    # What the printed duty roster prints for this person. It is not always the
    # personnel record's initial + surname: the GMS roster prints "J. Charles"
    # for Jude Andre Charles (acharles) and "K. Bedeau" for Kenrick Dieonne
    # Bedeau (dbedeau). Null means "derive it from the personnel record".
    roster_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    position: Mapped[str | None] = mapped_column(String(150), nullable=True)
    employment_type: Mapped[EmploymentType | None]
    start_date: Mapped[date | None]
    supervisor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    work_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[EmploymentStatus] = mapped_column(default=EmploymentStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterPreference(Base):
    __tablename__ = "roster_preference"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, index=True
    )
    default_shift_pattern: Mapped[ShiftPattern] = mapped_column(
        default=ShiftPattern.ROTATION
    )
    max_night_shifts_per_month: Mapped[int] = mapped_column(default=6)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterPreferredShift(Base):
    __tablename__ = "roster_preferred_shift"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "shift_code",
            name="uq_hr_roster_preferred_shift_user_id_shift_code",
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    shift_code: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterRestrictedShift(Base):
    __tablename__ = "roster_restricted_shift"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "shift_code",
            name="uq_hr_roster_restricted_shift_user_id_shift_code",
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    shift_code: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class LeaveBalance(Base):
    __tablename__ = "leave_balance"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "leave_type", name="uq_hr_leave_balance_user_type"
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    leave_type: Mapped[str] = mapped_column(String(50))
    balance: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class LeaveCarryOver(Base):
    __tablename__ = "leave_carry_over"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "leave_type",
            name="uq_hr_leave_carry_over_user_type",
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    leave_type: Mapped[str] = mapped_column(String(50))
    days: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class ApprovalAuthority(Base):
    __tablename__ = "approval_authority"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, index=True
    )
    can_approve_leave: Mapped[bool] = mapped_column(default=False)
    can_approve_shift_swap: Mapped[bool] = mapped_column(default=False)
    can_approve_timesheets: Mapped[bool] = mapped_column(default=False)
    can_approve_absentee_reports: Mapped[bool] = mapped_column(default=False)
    can_approve_parking: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
