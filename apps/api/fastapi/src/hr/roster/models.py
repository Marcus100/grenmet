import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ShiftCategory(str, Enum):
    WORK = "WORK"
    OFF = "OFF"
    LEAVE = "LEAVE"
    HOLIDAY = "HOLIDAY"


class RosterPeriodStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class RosterAvailability(str, Enum):
    SCHEDULED = "SCHEDULED"
    ABSENT = "ABSENT"
    PARTIAL_ABSENCE = "PARTIAL_ABSENCE"
    LEAVE = "LEAVE"


class ImportStatus(str, Enum):
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ShiftCatalog(Base):
    __tablename__ = "shift_catalog"
    __table_args__ = {"schema": "hr"}
    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    category: Mapped[ShiftCategory]
    start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    ends_next_day: Mapped[bool] = mapped_column(default=False)
    counts_as_work_hours: Mapped[bool] = mapped_column(default=True)
    needs_reason: Mapped[bool] = mapped_column(default=False)
    needs_approval: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterPeriod(Base):
    __tablename__ = "roster_period"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    period_start: Mapped[date]
    period_end: Mapped[date]
    status: Mapped[RosterPeriodStatus] = mapped_column(default=RosterPeriodStatus.DRAFT)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterAssignment(Base):
    __tablename__ = "roster_assignment"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "assignment_date", name="uq_hr_roster_assignment_user_date"
        ),
        {"schema": "hr"},
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_period.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    assignment_date: Mapped[date] = mapped_column(index=True)
    shift_code: Mapped[str] = mapped_column(
        String(10), ForeignKey("hr.shift_catalog.code")
    )
    remarks: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class PublicHoliday(Base):
    __tablename__ = "public_holiday"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150))
    holiday_date: Mapped[date] = mapped_column(index=True)
    is_recurring: Mapped[bool] = mapped_column(default=False)
    country_code: Mapped[str] = mapped_column(String(3), default="GD")
    source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    needs_verification: Mapped[bool] = mapped_column(
        default=False, server_default=sa.false()
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterRevisionAction(str, Enum):
    CREATED = "CREATED"
    ASSIGNMENTS_UPDATED = "ASSIGNMENTS_UPDATED"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class RosterRevision(Base):
    __tablename__ = "roster_revision"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_period.id"), index=True
    )
    revision_number: Mapped[int]
    action: Mapped[RosterRevisionAction]
    changed_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    snapshot: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterImportJob(Base):
    __tablename__ = "roster_import_job"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    roster_period_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.roster_period.id"), nullable=True
    )
    file_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[ImportStatus] = mapped_column(default=ImportStatus.PENDING)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    total_rows: Mapped[int] = mapped_column(default=0)
    valid_rows: Mapped[int] = mapped_column(default=0)
    invalid_rows: Mapped[int] = mapped_column(default=0)
    error_summary: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RosterImportRow(Base):
    __tablename__ = "roster_import_row"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_import_job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_import_job.id"), index=True
    )
    row_number: Mapped[int]
    raw_data: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    validation_errors: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_valid: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class WorkPattern(str, Enum):
    """ROTATION: consecutive-shift and days-off rules; WEEKDAYS: Monday to Friday."""

    ROTATION = "ROTATION"
    WEEKDAYS = "WEEKDAYS"


class WorkerType(str, Enum):
    """Which hour limits apply: shift workers or non-shift (Monday to Friday) staff."""

    SHIFT = "SHIFT"
    NON_SHIFT = "NON_SHIFT"


class RosterRuleSet(Base):
    """Roster rule limits as data (#380).

    One row per organisation with ``department_id`` NULL holds the organisation
    default; a row with a department replaces it entirely for that department.
    Without any row the built-in defaults in ``rules.DEFAULT_RULES`` apply. A NULL
    limit disables that rule.
    """

    __tablename__ = "roster_rule_set"
    __table_args__ = (
        sa.Index(
            "uq_hr_roster_rule_set_org_default",
            "organisation_id",
            unique=True,
            postgresql_where=sa.text("department_id IS NULL"),
        ),
        sa.Index(
            "uq_hr_roster_rule_set_department",
            "department_id",
            unique=True,
            postgresql_where=sa.text("department_id IS NOT NULL"),
        ),
        sa.CheckConstraint(
            "work_pattern IN ('ROTATION', 'WEEKDAYS')",
            name="ck_hr_roster_rule_set_work_pattern",
        ),
        sa.CheckConstraint(
            "worker_type IN ('SHIFT', 'NON_SHIFT')",
            name="ck_hr_roster_rule_set_worker_type",
        ),
        {"schema": "hr"},
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    department_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("hr.department.id"), nullable=True
    )
    work_pattern: Mapped[str] = mapped_column(
        String(20), default=WorkPattern.ROTATION.value
    )
    worker_type: Mapped[str] = mapped_column(String(20), default=WorkerType.SHIFT.value)
    max_consecutive_shifts: Mapped[int | None] = mapped_column(nullable=True)
    min_days_off_after_run: Mapped[int | None] = mapped_column(nullable=True)
    shift_daily_hours: Mapped[Decimal | None] = mapped_column(
        sa.Numeric(5, 2), nullable=True
    )
    shift_weekly_hours: Mapped[Decimal | None] = mapped_column(
        sa.Numeric(5, 2), nullable=True
    )
    non_shift_daily_hours: Mapped[Decimal | None] = mapped_column(
        sa.Numeric(5, 2), nullable=True
    )
    non_shift_weekly_hours: Mapped[Decimal | None] = mapped_column(
        sa.Numeric(5, 2), nullable=True
    )
    weekend_window_weeks: Mapped[int | None] = mapped_column(nullable=True)
    notice_days: Mapped[int | None] = mapped_column(nullable=True)
    overtime_bands_enabled: Mapped[bool] = mapped_column(default=True)
    weekday_first_hours: Mapped[Decimal] = mapped_column(sa.Numeric(5, 2))
    weekday_first_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    weekday_after_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    saturday_window_start: Mapped[str] = mapped_column(String(5))
    saturday_window_end: Mapped[str] = mapped_column(String(5))
    saturday_window_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    saturday_after_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    rest_day_first_hours: Mapped[Decimal] = mapped_column(sa.Numeric(5, 2))
    rest_day_first_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    rest_day_after_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    after_midnight_rate: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2))
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class RuleOverrideContext(str, Enum):
    """Where a supervisor saved a change despite roster rule warnings."""

    PUBLISH = "PUBLISH"
    ROSTER_CHANGE = "ROSTER_CHANGE"
    SHIFT_SWAP = "SHIFT_SWAP"
    LEAVE = "LEAVE"
    ABSENCE = "ABSENCE"
    TIMESHEET = "TIMESHEET"
    ATTENDANCE = "ATTENDANCE"


class RosterRuleOverride(Base):
    """Audit record of a supervisor saving despite roster rule warnings (#380):
    who, when, which rules and why. Rows are only ever inserted."""

    __tablename__ = "roster_rule_override"
    __table_args__ = (
        sa.Index(
            "ix_hr_roster_rule_override_department_created",
            "department_id",
            "created_at",
        ),
        {"schema": "hr"},
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    department_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.department.id")
    )
    context: Mapped[str] = mapped_column(String(20))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(100))
    rule_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    violations: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    reason: Mapped[str] = mapped_column(String(1000))
    overridden_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
