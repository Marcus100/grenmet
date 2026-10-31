"""Payroll inputs: quantities per pay period and employee, never money (slice 1).

HrPlus stays GAA's payroll of record. These tables hold the pay items an
organisation recognises, the periods they are counted in and the resulting
lines (hours and counts). No rate, amount, tax, NIS number or bank detail is
stored here; adding any of them is a later, separately approved slice.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class PayFrequency(str, Enum):
    MONTHLY = "MONTHLY"
    #: 14-day periods counted from the calendar's anchor date (GAA, 2026-10-31).
    FORTNIGHTLY = "FORTNIGHTLY"


class RuleState(str, Enum):
    """PROVISIONAL until the organisation confirms the rule in writing."""

    PROVISIONAL = "PROVISIONAL"
    CONFIRMED = "CONFIRMED"


class PayPeriodStatus(str, Enum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    EXPORTED = "EXPORTED"
    CLOSED = "CLOSED"


#: Periods whose lines are final; corrections go to a later period instead.
LOCKED_STATUSES = frozenset(
    {PayPeriodStatus.APPROVED, PayPeriodStatus.EXPORTED, PayPeriodStatus.CLOSED}
)


class PayItemKind(str, Enum):
    BASE_HOURS = "BASE_HOURS"
    OVERTIME = "OVERTIME"
    PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"
    SHIFT_PREMIUM = "SHIFT_PREMIUM"
    MEAL_ALLOWANCE = "MEAL_ALLOWANCE"
    CALL_OUT = "CALL_OUT"
    OTHER = "OTHER"


class PayItemUnit(str, Enum):
    HOURS = "HOURS"
    COUNT = "COUNT"


class PayItemMethod(str, Enum):
    """How a pay item's quantity is found (``params`` holds the rule's numbers)."""

    ATTENDANCE_BASE = "ATTENDANCE_BASE"
    PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"
    TIME_WINDOW = "TIME_WINDOW"
    THRESHOLD_EVENT = "THRESHOLD_EVENT"
    OVERTIME_BAND = "OVERTIME_BAND"
    MANUAL = "MANUAL"


class PayRunKind(str, Enum):
    REGULAR = "REGULAR"
    ADJUSTMENT = "ADJUSTMENT"


class PayLineKind(str, Enum):
    COMPUTED = "COMPUTED"
    MANUAL = "MANUAL"
    REVERSAL = "REVERSAL"
    REPLACEMENT = "REPLACEMENT"


def _check_in(column: str, values: type[Enum], name: str) -> sa.CheckConstraint:
    allowed = ", ".join(f"'{member.value}'" for member in values)
    return sa.CheckConstraint(f"{column} IN ({allowed})", name=name)


class PayCalendar(Base):
    __tablename__ = "pay_calendar"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["approval_department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_hr_pay_calendar_department_org",
        ),
        sa.UniqueConstraint(
            "organisation_id", "name", name="uq_hr_pay_calendar_org_name"
        ),
        sa.Index(
            "uq_hr_pay_calendar_org_default",
            "organisation_id",
            unique=True,
            postgresql_where=sa.text("is_default"),
        ),
        _check_in("frequency", PayFrequency, "ck_hr_pay_calendar_frequency"),
        sa.CheckConstraint(
            "frequency <> 'FORTNIGHTLY' OR anchor_date IS NOT NULL",
            name="ck_hr_pay_calendar_fortnight_anchor",
        ),
        _check_in("rule_state", RuleState, "ck_hr_pay_calendar_rule_state"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    frequency: Mapped[str] = mapped_column(
        String(16), default=PayFrequency.MONTHLY.value
    )
    # The department whose PAYROLL_RUN approval workflow approves this calendar's
    # periods (for GAA, Accounts Payroll once confirmed).
    approval_department_id: Mapped[str] = mapped_column(String(100))
    is_default: Mapped[bool] = mapped_column(default=False)
    # FORTNIGHTLY only: the first day of any one fortnight; every period starts
    # a whole number of fortnights from it.
    anchor_date: Mapped[date | None]
    rule_state: Mapped[str] = mapped_column(
        String(16), default=RuleState.PROVISIONAL.value
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class PayPeriod(Base):
    __tablename__ = "pay_period"
    __table_args__ = (
        sa.UniqueConstraint(
            "calendar_id", "start_date", name="uq_hr_pay_period_calendar_start"
        ),
        sa.CheckConstraint(
            "end_date >= start_date", name="ck_hr_pay_period_end_not_before_start"
        ),
        _check_in("status", PayPeriodStatus, "ck_hr_pay_period_status"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.pay_calendar.id"), index=True
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    start_date: Mapped[date]
    end_date: Mapped[date]
    status: Mapped[str] = mapped_column(String(16), default=PayPeriodStatus.OPEN.value)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id")
    )
    computed_at: Mapped[datetime | None]
    submitted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id")
    )
    submitted_at: Mapped[datetime | None]
    approved_at: Mapped[datetime | None]
    exported_at: Mapped[datetime | None]
    export_count: Mapped[int] = mapped_column(default=0)
    closed_at: Mapped[datetime | None]
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class PayItem(Base):
    """One quantity an organisation counts: organisation data, never code-defined."""

    __tablename__ = "pay_item"
    __table_args__ = (
        sa.UniqueConstraint("organisation_id", "code", name="uq_hr_pay_item_org_code"),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_hr_pay_item_effective_dates",
        ),
        _check_in("kind", PayItemKind, "ck_hr_pay_item_kind"),
        _check_in("unit", PayItemUnit, "ck_hr_pay_item_unit"),
        _check_in("method", PayItemMethod, "ck_hr_pay_item_method"),
        _check_in("rule_state", RuleState, "ck_hr_pay_item_rule_state"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(24))
    unit: Mapped[str] = mapped_column(String(8))
    method: Mapped[str] = mapped_column(String(24))
    params: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    effective_from: Mapped[date]
    effective_to: Mapped[date | None]
    rule_state: Mapped[str] = mapped_column(
        String(16), default=RuleState.PROVISIONAL.value
    )
    source_reference: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class EmployeePayProfile(Base):
    """Per-person payroll facts. Empty fields fall back to the defaults."""

    __tablename__ = "employee_pay_profile"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id",
            "payroll_reference",
            name="uq_hr_employee_pay_profile_org_reference",
        ),
        {"schema": "hr"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    # Null means "the organisation's default calendar".
    calendar_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.pay_calendar.id")
    )
    # Null means "the department default" (PayrollDepartmentSetting).
    shift_worker: Mapped[bool | None]
    # The person's identifier in the payroll of record (HrPlus), when known.
    payroll_reference: Mapped[str | None] = mapped_column(String(50))
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class PayrollDepartmentSetting(Base):
    __tablename__ = "payroll_department_setting"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_hr_payroll_department_setting_department_org",
        ),
        {"schema": "hr"},
    )

    department_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(String(100), index=True)
    shift_worker_default: Mapped[bool] = mapped_column(default=False)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class PayRun(Base):
    __tablename__ = "pay_run"
    __table_args__ = (
        sa.UniqueConstraint("period_id", "kind", name="uq_hr_pay_run_period_kind"),
        _check_in("kind", PayRunKind, "ck_hr_pay_run_kind"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.pay_period.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class PayLine(Base):
    """One quantity for one person and pay item. Written only while OPEN.

    The ``pay_line_locked`` trigger refuses inserts, updates and deletes once
    the period has left OPEN, so approved lines are final; corrections arrive
    as REVERSAL and REPLACEMENT lines in a later period.
    """

    __tablename__ = "pay_line"
    __table_args__ = (
        sa.UniqueConstraint("run_id", "source_key", name="uq_hr_pay_line_run_source"),
        sa.Index("ix_hr_pay_line_period_user", "period_id", "user_id"),
        sa.Index("ix_hr_pay_line_source", "source_type", "source_id"),
        sa.CheckConstraint("quantity <> 0", name="ck_hr_pay_line_quantity_nonzero"),
        _check_in("line_kind", PayLineKind, "ck_hr_pay_line_kind"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hr.pay_run.id"), index=True)
    period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hr.pay_period.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    pay_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.pay_item.id"), index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    line_kind: Mapped[str] = mapped_column(String(16))
    source_type: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[uuid.UUID | None]
    source_revision: Mapped[int | None]
    source_key: Mapped[str] = mapped_column(String(200))
    work_date: Mapped[date | None]
    reason: Mapped[str | None] = mapped_column(String(500))
    # The locked period a REVERSAL or REPLACEMENT corrects.
    adjusts_period_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.pay_period.id")
    )
    adjusts_line_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.pay_line.id")
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
