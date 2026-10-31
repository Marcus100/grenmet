"""Pay periods: compute quantities, add manual lines, review, lock and export.

Lifecycle: OPEN -> IN_REVIEW (submit) -> APPROVED (second person, PAYROLL_RUN
workflow) -> EXPORTED (CSV) -> CLOSED. A returned or rejected review reopens
the period. Lines change only while OPEN (enforced by a database trigger); a
change to attendance in an approved period appears as REVERSAL and
REPLACEMENT lines in the ADJUSTMENT run of a later open period.

Logs carry IDs and counts only: no names, quantities or reasons.
"""

import calendar as calendar_module
import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    ColumnElement,
    Select,
    and_,
    delete,
    func,
    insert,
    or_,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppException, NotFoundError
from src.hr.attendance.models import AttendanceRecord
from src.hr.models import Department, EmploymentRecord
from src.hr.organisations import require_organisation_permission, resolve_organisation
from src.hr.roster.models import PublicHoliday, RosterAssignment
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from src.utils.datetime import utc_now

from . import access, export, overtime, rules
from .models import (
    LOCKED_STATUSES,
    EmployeePayProfile,
    PayCalendar,
    PayFrequency,
    PayItem,
    PayItemMethod,
    PayItemUnit,
    PayLine,
    PayLineKind,
    PayPeriod,
    PayPeriodStatus,
    PayrollDepartmentSetting,
    PayRun,
    PayRunKind,
)
from .schemas import (
    EmployeePayProfileUpdate,
    PayCalendarCreate,
    PayLineManualCreate,
    PayPeriodCreate,
)

logger = logging.getLogger(__name__)

ENTITY_TYPE = "pay_period"
FORTNIGHT_DAYS = 14
#: Pay frequency when a new calendar does not say (owner, 2026-10-31: GAA pays
#: fortnightly). Every other organisation defaults to calendar months.
DEFAULT_FREQUENCY = {"gaa": PayFrequency.FORTNIGHTLY}
#: Periods a year, for annualised calculations in later slices.
PERIODS_PER_YEAR = {PayFrequency.MONTHLY: 12, PayFrequency.FORTNIGHTLY: 26}
ATTENDANCE_SOURCE = "attendance"
MANUAL_SOURCE = "manual"
LOCKED_VALUES = frozenset(status.value for status in LOCKED_STATUSES)


class PayrollConflictError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 409)


class PayrollValidationError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 400)


# ── Organisation data: catalogue, calendars, profiles ──────────────────────────


async def organisation_for(
    session: AsyncSession, actor: User, organisation_id: str | None
) -> tuple[str, set[str]]:
    if organisation_id is None:
        organisation_id = await resolve_organisation(session, actor)
    return organisation_id, await access.require_visible(
        session, actor, organisation_id
    )


def accepts_manual_lines(item: PayItem) -> bool:
    return item.method == PayItemMethod.MANUAL or (
        item.method == PayItemMethod.OVERTIME_BAND and not overtime.source().available
    )


async def list_items(
    session: AsyncSession, actor: User, organisation_id: str | None
) -> list[PayItem]:
    organisation_id, _ = await organisation_for(session, actor, organisation_id)
    return list(
        (
            await session.execute(
                select(PayItem)
                .where(PayItem.organisation_id == organisation_id)
                .order_by(PayItem.sort_order, PayItem.code)
            )
        )
        .scalars()
        .all()
    )


async def list_calendars(
    session: AsyncSession, actor: User, organisation_id: str | None
) -> list[PayCalendar]:
    organisation_id, _ = await organisation_for(session, actor, organisation_id)
    return list(
        (
            await session.execute(
                select(PayCalendar)
                .where(PayCalendar.organisation_id == organisation_id)
                .order_by(PayCalendar.is_default.desc(), PayCalendar.name)
            )
        )
        .scalars()
        .all()
    )


async def create_calendar(
    session: AsyncSession, actor: User, payload: PayCalendarCreate
) -> PayCalendar:
    await access.require_organisation_wide(
        session, actor, payload.organisation_id, access.PREPARE
    )
    department = await session.get(Department, payload.approval_department_id)
    if department is None or department.organisation_id != payload.organisation_id:
        raise PayrollValidationError(
            "The approving department must belong to this organisation"
        )
    has_default = await session.scalar(
        select(PayCalendar.id).where(
            PayCalendar.organisation_id == payload.organisation_id,
            PayCalendar.is_default.is_(True),
        )
    )
    frequency = payload.frequency or DEFAULT_FREQUENCY.get(
        payload.organisation_id, PayFrequency.MONTHLY
    )
    if frequency == PayFrequency.FORTNIGHTLY and payload.anchor_date is None:
        raise PayrollValidationError(
            "Give the first day of one fortnightly pay period as the anchor date"
        )
    is_default = payload.is_default or has_default is None
    if is_default and has_default is not None:
        await session.execute(
            update(PayCalendar)
            .where(PayCalendar.organisation_id == payload.organisation_id)
            .values(is_default=False, updated_at=utc_now())
        )
    calendar = PayCalendar(
        organisation_id=payload.organisation_id,
        name=payload.name,
        frequency=frequency.value,
        approval_department_id=payload.approval_department_id,
        is_default=is_default,
        anchor_date=(
            payload.anchor_date if frequency == PayFrequency.FORTNIGHTLY else None
        ),
        created_by_user_id=actor.id,
    )
    session.add(calendar)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise PayrollConflictError("A pay calendar with this name exists") from exc
    await session.refresh(calendar)
    logger.info("Pay calendar created", extra={"calendar_id": str(calendar.id)})
    return calendar


@dataclass(frozen=True)
class ProfileRow:
    user_id: uuid.UUID
    employee_name: str
    employee_number: str | None
    department_id: str
    calendar_id: uuid.UUID | None
    shift_worker: bool | None
    effective_shift_worker: bool
    payroll_reference: str | None


def _employee_name() -> ColumnElement[str]:
    return func.concat(User.first_name, " ", User.last_name)


async def list_profiles(
    session: AsyncSession,
    actor: User,
    organisation_id: str | None,
    *,
    skip: int,
    limit: int,
) -> tuple[list[ProfileRow], int]:
    organisation_id, visible = await organisation_for(session, actor, organisation_id)
    where = (
        EmploymentRecord.organisation_id == organisation_id,
        EmploymentRecord.department_id.in_(visible),
    )
    count = await session.scalar(
        select(func.count()).select_from(EmploymentRecord).where(*where)
    )
    rows = (
        await session.execute(
            select(
                EmploymentRecord.user_id,
                _employee_name(),
                EmploymentRecord.employee_number,
                EmploymentRecord.department_id,
                EmployeePayProfile.calendar_id,
                EmployeePayProfile.shift_worker,
                func.coalesce(
                    EmployeePayProfile.shift_worker,
                    PayrollDepartmentSetting.shift_worker_default,
                    False,
                ),
                EmployeePayProfile.payroll_reference,
            )
            .join(User, User.id == EmploymentRecord.user_id)
            .outerjoin(
                EmployeePayProfile,
                EmployeePayProfile.user_id == EmploymentRecord.user_id,
            )
            .outerjoin(
                PayrollDepartmentSetting,
                PayrollDepartmentSetting.department_id
                == EmploymentRecord.department_id,
            )
            .where(*where)
            .order_by(User.last_name, User.first_name, EmploymentRecord.user_id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return [ProfileRow(*row) for row in rows], count or 0


async def update_profile(
    session: AsyncSession,
    actor: User,
    user_id: uuid.UUID,
    payload: EmployeePayProfileUpdate,
) -> ProfileRow:
    organisation_id = payload.organisation_id
    await access.require_organisation_wide(
        session, actor, organisation_id, access.PREPARE
    )
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == user_id,
            EmploymentRecord.organisation_id == organisation_id,
        )
    )
    if employment is None:
        raise NotFoundError("Employee not found in this organisation")
    if payload.calendar_id is not None:
        calendar = await session.get(PayCalendar, payload.calendar_id)
        if calendar is None or calendar.organisation_id != organisation_id:
            raise PayrollValidationError("Pay calendar not found in this organisation")
    profile = await session.get(EmployeePayProfile, user_id)
    if profile is None:
        profile = EmployeePayProfile(user_id=user_id, organisation_id=organisation_id)
        session.add(profile)
    profile.calendar_id = payload.calendar_id
    profile.shift_worker = payload.shift_worker
    profile.payroll_reference = payload.payroll_reference
    profile.updated_by_user_id = actor.id
    profile.updated_at = utc_now()
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise PayrollConflictError(
            "Another employee already has this payroll reference"
        ) from exc
    rows, _ = await list_profiles(session, actor, organisation_id, skip=0, limit=10_000)
    return next(row for row in rows if row.user_id == user_id)


async def list_department_settings(
    session: AsyncSession, actor: User, organisation_id: str | None
) -> list[tuple[str, str, bool]]:
    organisation_id, visible = await organisation_for(session, actor, organisation_id)
    rows = (
        await session.execute(
            select(
                Department.id,
                Department.name,
                func.coalesce(PayrollDepartmentSetting.shift_worker_default, False),
            )
            .outerjoin(
                PayrollDepartmentSetting,
                PayrollDepartmentSetting.department_id == Department.id,
            )
            .where(
                Department.organisation_id == organisation_id,
                Department.id.in_(visible),
            )
            .order_by(Department.name)
        )
    ).all()
    return [(row[0], row[1], bool(row[2])) for row in rows]


async def update_department_setting(
    session: AsyncSession, actor: User, department_id: str, shift_worker_default: bool
) -> tuple[str, str, bool]:
    department = await session.get(Department, department_id)
    if department is None:
        raise NotFoundError("Department not found")
    await access.require_organisation_wide(
        session, actor, department.organisation_id, access.PREPARE
    )
    setting = await session.get(PayrollDepartmentSetting, department_id)
    if setting is None:
        setting = PayrollDepartmentSetting(
            department_id=department_id, organisation_id=department.organisation_id
        )
        session.add(setting)
    setting.shift_worker_default = shift_worker_default
    setting.updated_by_user_id = actor.id
    setting.updated_at = utc_now()
    await session.commit()
    return department.id, department.name, shift_worker_default


# ── Periods ────────────────────────────────────────────────────────────────────


def month_end(day: date) -> date:
    return day.replace(day=calendar_module.monthrange(day.year, day.month)[1])


async def create_period(
    session: AsyncSession, actor: User, payload: PayPeriodCreate
) -> PayPeriod:
    calendar = await session.get(PayCalendar, payload.calendar_id)
    if calendar is None:
        raise NotFoundError("Pay calendar not found")
    await access.require_visible(session, actor, calendar.organisation_id)
    await access.require_organisation_wide(
        session, actor, calendar.organisation_id, access.PREPARE
    )
    start = payload.start_date
    if calendar.frequency == PayFrequency.FORTNIGHTLY:
        assert calendar.anchor_date is not None
        if (start - calendar.anchor_date).days % FORTNIGHT_DAYS:
            raise PayrollValidationError(
                "A fortnightly period must start a whole number of fortnights "
                f"from the calendar's anchor date ({calendar.anchor_date.isoformat()})"
            )
        end = start + timedelta(days=FORTNIGHT_DAYS - 1)
        if payload.end_date not in {None, end}:
            raise PayrollValidationError("A fortnightly period is 14 days long")
    else:
        end = payload.end_date or month_end(start)
    if end < start:
        raise PayrollValidationError("The period cannot end before it starts")
    if (end - start).days > 62:
        raise PayrollValidationError("A pay period cannot be longer than two months")
    overlapping = await session.scalar(
        select(PayPeriod.id).where(
            PayPeriod.calendar_id == calendar.id,
            PayPeriod.start_date <= end,
            PayPeriod.end_date >= start,
        )
    )
    if overlapping is not None:
        raise PayrollConflictError("This period overlaps another one in the calendar")
    period = PayPeriod(
        calendar_id=calendar.id,
        organisation_id=calendar.organisation_id,
        start_date=start,
        end_date=end,
        created_by_user_id=actor.id,
    )
    session.add(period)
    await session.flush()
    session.add_all(
        [PayRun(period_id=period.id, kind=kind.value) for kind in PayRunKind]
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise PayrollConflictError("This period already exists") from exc
    await session.refresh(period)
    logger.info("Pay period created", extra={"period_id": str(period.id)})
    return period


async def list_periods(
    session: AsyncSession,
    actor: User,
    organisation_id: str | None,
    *,
    calendar_id: uuid.UUID | None,
    skip: int,
    limit: int,
) -> tuple[list[tuple[PayPeriod, str, WorkflowStatus | None]], int]:
    organisation_id, _ = await organisation_for(session, actor, organisation_id)
    where = [PayPeriod.organisation_id == organisation_id]
    if calendar_id is not None:
        where.append(PayPeriod.calendar_id == calendar_id)
    count = await session.scalar(
        select(func.count()).select_from(PayPeriod).where(*where)
    )
    rows = (
        await session.execute(
            select(PayPeriod, PayCalendar.name, WorkflowInstance.status)
            .join(PayCalendar, PayCalendar.id == PayPeriod.calendar_id)
            .outerjoin(
                WorkflowInstance, WorkflowInstance.id == PayPeriod.workflow_instance_id
            )
            .where(*where)
            .order_by(PayPeriod.start_date.desc(), PayCalendar.name)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return [(row[0], row[1], row[2]) for row in rows], count or 0


async def period_view(
    session: AsyncSession, period: PayPeriod
) -> tuple[PayPeriod, str, WorkflowStatus | None]:
    name = await session.scalar(
        select(PayCalendar.name).where(PayCalendar.id == period.calendar_id)
    )
    status = (
        await session.scalar(
            select(WorkflowInstance.status).where(
                WorkflowInstance.id == period.workflow_instance_id
            )
        )
        if period.workflow_instance_id
        else None
    )
    return period, name or "", status


async def _holds(
    session: AsyncSession, actor: User, organisation_id: str, key: str
) -> bool:
    try:
        await require_organisation_permission(session, actor, organisation_id, key)
    except AppException:
        return False
    return True


async def allowed_actions(
    session: AsyncSession, actor: User, period: PayPeriod
) -> list[str]:
    org = period.organisation_id
    prepare = await _holds(session, actor, org, access.PREPARE)
    approve = await _holds(session, actor, org, access.APPROVE)
    exporter = await _holds(session, actor, org, access.EXPORT)
    own = period.submitted_by_user_id == actor.id
    status = period.status
    actions: list[str] = []
    if prepare and status == PayPeriodStatus.OPEN:
        actions += ["compute", "add_line", "submit"]
    if approve and not own and status == PayPeriodStatus.IN_REVIEW:
        actions += ["approve", "return"]
    if exporter and status in LOCKED_VALUES:
        actions.append("export")
    if prepare and status == PayPeriodStatus.EXPORTED:
        actions.append("close")
    return actions


async def period_detail(
    session: AsyncSession, actor: User, period_id: uuid.UUID
) -> dict[str, object]:
    period, visible = await access.load_period(session, actor, period_id)
    totals = (
        await session.execute(
            select(
                PayItem.id,
                PayItem.code,
                PayItem.name,
                PayItem.unit,
                PayItem.rule_state,
                PayRun.kind,
                func.sum(PayLine.quantity),
                func.count(PayLine.id),
            )
            .join(PayItem, PayItem.id == PayLine.pay_item_id)
            .join(PayRun, PayRun.id == PayLine.run_id)
            .where(PayLine.period_id == period.id, PayLine.department_id.in_(visible))
            .group_by(
                PayItem.id,
                PayItem.code,
                PayItem.name,
                PayItem.unit,
                PayItem.rule_state,
                PayItem.sort_order,
                PayRun.kind,
            )
            .order_by(PayRun.kind.desc(), PayItem.sort_order, PayItem.code)
        )
    ).all()
    counts = (
        await session.execute(
            select(
                func.count(func.distinct(PayLine.user_id)), func.count(PayLine.id)
            ).where(PayLine.period_id == period.id, PayLine.department_id.in_(visible))
        )
    ).one()
    view = await period_view(session, period)
    return {
        "view": view,
        "totals": [
            {
                "pay_item_id": row[0],
                "code": row[1],
                "name": row[2],
                "unit": row[3],
                "rule_state": row[4],
                "run_kind": row[5],
                "quantity": row[6],
                "line_count": row[7],
            }
            for row in totals
        ],
        "employee_count": counts[0] or 0,
        "line_count": counts[1] or 0,
        "allowed_actions": await allowed_actions(session, actor, period),
        "prepared_by_caller": period.submitted_by_user_id == actor.id,
    }


async def list_lines(
    session: AsyncSession,
    actor: User,
    period_id: uuid.UUID,
    *,
    department_id: str | None,
    user_id: uuid.UUID | None,
    skip: int,
    limit: int,
) -> tuple[list[dict[str, object]], int]:
    period, visible = await access.load_period(session, actor, period_id)
    if department_id is not None:
        visible = visible & {department_id}
    where = [PayLine.period_id == period.id, PayLine.department_id.in_(visible)]
    if user_id is not None:
        where.append(PayLine.user_id == user_id)
    count = await session.scalar(
        select(func.count()).select_from(PayLine).where(*where)
    )
    rows = (
        await session.execute(
            _line_columns()
            .where(*where)
            .order_by(
                User.last_name,
                User.first_name,
                PayLine.user_id,
                PayLine.work_date.nulls_last(),
                PayItem.sort_order,
                PayLine.created_at,
            )
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return [dict(row._mapping) for row in rows], count or 0


def _line_columns() -> Select[Any]:
    return (
        select(
            PayLine.id,
            PayRun.kind.label("run_kind"),
            PayLine.line_kind,
            PayLine.user_id,
            _employee_name().label("employee_name"),
            EmploymentRecord.employee_number,
            EmployeePayProfile.payroll_reference,
            PayLine.department_id,
            PayLine.pay_item_id,
            PayItem.code.label("pay_item_code"),
            PayItem.name.label("pay_item_name"),
            PayItem.unit,
            PayItem.rule_state,
            PayLine.quantity,
            PayLine.work_date,
            PayLine.source_type,
            PayLine.source_id,
            PayLine.reason,
            PayLine.adjusts_period_id,
            PayLine.adjusts_line_id,
            PayLine.created_at,
        )
        .join(PayRun, PayRun.id == PayLine.run_id)
        .join(PayItem, PayItem.id == PayLine.pay_item_id)
        .join(User, User.id == PayLine.user_id)
        .outerjoin(EmploymentRecord, EmploymentRecord.user_id == PayLine.user_id)
        .outerjoin(EmployeePayProfile, EmployeePayProfile.user_id == PayLine.user_id)
    )


# ── Computation ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class LineSpec:
    user_id: uuid.UUID
    department_id: str
    pay_item_id: uuid.UUID
    quantity: Decimal
    line_kind: PayLineKind
    source_id: uuid.UUID
    source_revision: int
    work_date: date
    adjusts_period_id: uuid.UUID | None = None


async def _runs(session: AsyncSession, period: PayPeriod) -> dict[str, PayRun]:
    runs = {
        run.kind: run
        for run in (
            await session.execute(select(PayRun).where(PayRun.period_id == period.id))
        )
        .scalars()
        .all()
    }
    for kind in PayRunKind:
        if kind.value not in runs:
            run = PayRun(period_id=period.id, kind=kind.value)
            session.add(run)
            await session.flush()
            runs[kind.value] = run
    return runs


async def _computed_items(
    session: AsyncSession, organisation_id: str, until: date
) -> list[PayItem]:
    return list(
        (
            await session.execute(
                select(PayItem).where(
                    PayItem.organisation_id == organisation_id,
                    PayItem.is_active.is_(True),
                    PayItem.method != PayItemMethod.MANUAL.value,
                    PayItem.effective_from <= until,
                )
            )
        )
        .scalars()
        .all()
    )


async def approved_shifts(
    session: AsyncSession,
    calendar: PayCalendar,
    ranges: Iterable[tuple[date, date]],
) -> list[rules.ShiftFacts]:
    """Approved, completed attendance whose roster date falls in any range.

    Only attendance whose current review is APPROVED counts: pending, returned
    or rejected attendance produces nothing.
    """
    ranges = list(ranges)
    if not ranges:
        return []
    org = calendar.organisation_id
    in_calendar = (
        or_(
            EmployeePayProfile.calendar_id.is_(None),
            EmployeePayProfile.calendar_id == calendar.id,
        )
        if calendar.is_default
        else EmployeePayProfile.calendar_id == calendar.id
    )
    rows = (
        await session.execute(
            select(
                AttendanceRecord.id,
                AttendanceRecord.revision,
                AttendanceRecord.user_id,
                AttendanceRecord.department_id,
                RosterAssignment.assignment_date,
                AttendanceRecord.arrived_at,
                AttendanceRecord.departed_at,
                AttendanceRecord.break_minutes,
                func.coalesce(
                    EmployeePayProfile.shift_worker,
                    PayrollDepartmentSetting.shift_worker_default,
                    False,
                ),
            )
            .join(
                WorkflowInstance,
                and_(
                    WorkflowInstance.id == AttendanceRecord.workflow_instance_id,
                    WorkflowInstance.status == WorkflowStatus.APPROVED,
                ),
            )
            .join(
                RosterAssignment,
                RosterAssignment.id == AttendanceRecord.roster_assignment_id,
            )
            .join(Department, Department.id == AttendanceRecord.department_id)
            .join(
                EmploymentRecord, EmploymentRecord.user_id == AttendanceRecord.user_id
            )
            .outerjoin(
                EmployeePayProfile,
                EmployeePayProfile.user_id == AttendanceRecord.user_id,
            )
            .outerjoin(
                PayrollDepartmentSetting,
                PayrollDepartmentSetting.department_id
                == EmploymentRecord.department_id,
            )
            .where(
                Department.organisation_id == org,
                EmploymentRecord.organisation_id == org,
                AttendanceRecord.departed_at.is_not(None),
                in_calendar,
                or_(
                    *(
                        RosterAssignment.assignment_date.between(start, end)
                        for start, end in ranges
                    )
                ),
            )
            .order_by(RosterAssignment.assignment_date, AttendanceRecord.id)
        )
    ).all()
    return [
        rules.ShiftFacts(
            attendance_id=row[0],
            revision=row[1],
            user_id=row[2],
            department_id=row[3],
            work_date=row[4],
            arrived=rules.local(row[5]),
            departed=rules.local(row[6]),
            break_minutes=row[7],
            shift_worker=bool(row[8]),
        )
        for row in rows
    ]


async def _holidays(
    session: AsyncSession, shifts: list[rules.ShiftFacts]
) -> frozenset[date]:
    if not shifts:
        return frozenset()
    first = min(shift.arrived.date() for shift in shifts)
    last = max(shift.departed.date() for shift in shifts)
    return frozenset(
        (
            await session.execute(
                select(PublicHoliday.holiday_date).where(
                    PublicHoliday.holiday_date.between(first, last)
                )
            )
        )
        .scalars()
        .all()
    )


def _effective(item: PayItem, day: date) -> bool:
    return item.effective_from <= day and (
        item.effective_to is None or day <= item.effective_to
    )


async def shift_quantities(
    session: AsyncSession,
    organisation_id: str,
    items: list[PayItem],
    shifts: list[rules.ShiftFacts],
) -> dict[tuple[uuid.UUID, uuid.UUID], tuple[rules.ShiftFacts, Decimal]]:
    """Non-zero quantity per (attendance, pay item) for every computed item."""
    holidays = await _holidays(session, shifts)
    bands: overtime.BandHours = {}
    if shifts and any(item.method == PayItemMethod.OVERTIME_BAND for item in items):
        bands = await overtime.source().band_hours(
            session, organisation_id=organisation_id, shifts=shifts
        )
    result: dict[tuple[uuid.UUID, uuid.UUID], tuple[rules.ShiftFacts, Decimal]] = {}
    for shift in shifts:
        for item in items:
            if not _effective(item, shift.work_date):
                continue
            try:
                if item.method == PayItemMethod.OVERTIME_BAND:
                    band = str(item.params.get("band", ""))
                    quantity = Decimal(
                        str(bands.get(shift.attendance_id, {}).get(band, 0))
                    )
                else:
                    quantity = rules.quantity_for(
                        item.method, shift, item.params, holidays
                    )
            except rules.PayRuleError as exc:
                raise PayrollConflictError(
                    f"Pay item {item.code} has invalid rule settings: {exc}"
                ) from exc
            quantity = quantity.quantize(rules.HUNDREDTH)
            if item.unit == PayItemUnit.COUNT:
                quantity = quantity.quantize(Decimal(1))
            if quantity:
                result[(shift.attendance_id, item.id)] = (shift, quantity)
    return result


def _source_key(spec: LineSpec) -> str:
    if spec.line_kind == PayLineKind.COMPUTED:
        return f"att:{spec.source_id}:{spec.pay_item_id}"
    return f"adj:{spec.source_id}:{spec.pay_item_id}:{spec.line_kind.value.lower()}"


async def _sync_run(
    session: AsyncSession,
    period: PayPeriod,
    run: PayRun,
    desired: list[LineSpec],
    kinds: tuple[PayLineKind, ...],
    actor_id: uuid.UUID,
) -> int:
    """Make the run's computed lines equal ``desired``; manual lines are kept.

    Unchanged lines keep their IDs, so a repeated computation changes nothing.
    Bulk statements on purpose: computed lines are reproducible from approved
    attendance, and one audit entry per computation summarises them.
    """
    existing = {
        line.source_key: line
        for line in (
            await session.execute(
                select(PayLine).where(
                    PayLine.run_id == run.id,
                    PayLine.line_kind.in_([kind.value for kind in kinds]),
                )
            )
        )
        .scalars()
        .all()
    }
    wanted = {_source_key(spec): spec for spec in desired}
    changes = 0
    stale = [line.id for key, line in existing.items() if key not in wanted]
    if stale:
        await session.execute(delete(PayLine).where(PayLine.id.in_(stale)))
        changes += len(stale)
    inserts = []
    for key, spec in wanted.items():
        line = existing.get(key)
        if line is None:
            inserts.append(
                {
                    "id": uuid.uuid4(),
                    "run_id": run.id,
                    "period_id": period.id,
                    "user_id": spec.user_id,
                    "department_id": spec.department_id,
                    "pay_item_id": spec.pay_item_id,
                    "quantity": spec.quantity,
                    "line_kind": spec.line_kind.value,
                    "source_type": ATTENDANCE_SOURCE,
                    "source_id": spec.source_id,
                    "source_revision": spec.source_revision,
                    "source_key": key,
                    "work_date": spec.work_date,
                    "adjusts_period_id": spec.adjusts_period_id,
                    "created_by_user_id": actor_id,
                    "created_at": utc_now(),
                }
            )
        elif (
            line.quantity != spec.quantity
            or line.source_revision != spec.source_revision
            or line.department_id != spec.department_id
            or line.adjusts_period_id != spec.adjusts_period_id
        ):
            await session.execute(
                update(PayLine)
                .where(PayLine.id == line.id)
                .values(
                    quantity=spec.quantity,
                    source_revision=spec.source_revision,
                    department_id=spec.department_id,
                    adjusts_period_id=spec.adjusts_period_id,
                )
            )
            changes += 1
    if inserts:
        await session.execute(insert(PayLine), inserts)
        changes += len(inserts)
    return changes


async def _adjustments(
    session: AsyncSession,
    period: PayPeriod,
    calendar: PayCalendar,
    items: list[PayItem],
) -> list[LineSpec]:
    """REVERSAL and REPLACEMENT lines for attendance in earlier approved periods.

    For each attendance record dated inside an earlier locked period of this
    calendar, compare what it yields now with the net of every line already
    recorded for it outside this period. A difference reverses the recorded
    net and replaces it with today's figure. A late first approval has nothing
    to reverse and only gets a replacement.
    """
    locked = list(
        (
            await session.execute(
                select(PayPeriod.id, PayPeriod.start_date, PayPeriod.end_date).where(
                    PayPeriod.calendar_id == calendar.id,
                    PayPeriod.id != period.id,
                    PayPeriod.status.in_(LOCKED_VALUES),
                    PayPeriod.end_date < period.start_date,
                )
            )
        ).all()
    )
    if not locked:
        return []

    def owner(day: date) -> uuid.UUID | None:
        for period_id, start, end in locked:
            if start <= day <= end:
                found: uuid.UUID = period_id
                return found
        return None

    shifts = await approved_shifts(
        session, calendar, ((start, end) for _, start, end in locked)
    )
    now = await shift_quantities(session, calendar.organisation_id, items, shifts)
    recorded_rows = (
        await session.execute(
            select(
                PayLine.source_id,
                PayLine.pay_item_id,
                PayLine.user_id,
                PayLine.department_id,
                PayLine.work_date,
                func.sum(PayLine.quantity),
            )
            .join(PayPeriod, PayPeriod.id == PayLine.period_id)
            .where(
                PayPeriod.calendar_id == calendar.id,
                PayLine.period_id != period.id,
                PayLine.source_type == ATTENDANCE_SOURCE,
                PayLine.work_date < period.start_date,
            )
            .group_by(
                PayLine.source_id,
                PayLine.pay_item_id,
                PayLine.user_id,
                PayLine.department_id,
                PayLine.work_date,
            )
        )
    ).all()
    recorded: dict[
        tuple[uuid.UUID, uuid.UUID], tuple[uuid.UUID, str, date, Decimal]
    ] = {}
    for source_id, item_id, user_id, department_id, work_date, total in recorded_rows:
        if source_id is None or work_date is None or owner(work_date) is None:
            continue
        key = (source_id, item_id)
        previous = recorded.get(key)
        quantity = Decimal(total) + (previous[3] if previous else Decimal(0))
        recorded[key] = (user_id, department_id, work_date, quantity)
    revisions = {shift.attendance_id: shift.revision for shift, _ in now.values()}
    specs: list[LineSpec] = []
    for key in sorted(set(now) | set(recorded), key=lambda k: (str(k[0]), str(k[1]))):
        attendance_id, item_id = key
        current = now.get(key)
        net = recorded[key][3] if key in recorded else Decimal(0)
        target = current[1] if current else Decimal(0)
        if target == net:
            continue
        if current:
            shift = current[0]
            user_id, department_id, work_date = (
                shift.user_id,
                shift.department_id,
                shift.work_date,
            )
        else:
            user_id, department_id, work_date, _ = recorded[key]
        for quantity, kind in (
            (-net, PayLineKind.REVERSAL),
            (target, PayLineKind.REPLACEMENT),
        ):
            if quantity:
                specs.append(
                    LineSpec(
                        user_id=user_id,
                        department_id=department_id,
                        pay_item_id=item_id,
                        quantity=quantity,
                        line_kind=kind,
                        source_id=attendance_id,
                        source_revision=revisions.get(attendance_id, 0),
                        work_date=work_date,
                        adjusts_period_id=owner(work_date),
                    )
                )
    return specs


async def _compute(session: AsyncSession, period: PayPeriod, actor: User) -> int:
    calendar = await session.get(PayCalendar, period.calendar_id)
    if calendar is None:
        raise NotFoundError("Pay calendar not found")
    runs = await _runs(session, period)
    items = await _computed_items(session, period.organisation_id, period.end_date)
    shifts = await approved_shifts(
        session, calendar, [(period.start_date, period.end_date)]
    )
    regular = [
        LineSpec(
            user_id=shift.user_id,
            department_id=shift.department_id,
            pay_item_id=item_id,
            quantity=quantity,
            line_kind=PayLineKind.COMPUTED,
            source_id=shift.attendance_id,
            source_revision=shift.revision,
            work_date=shift.work_date,
        )
        for (_, item_id), (shift, quantity) in (
            await shift_quantities(session, period.organisation_id, items, shifts)
        ).items()
    ]
    changes = await _sync_run(
        session,
        period,
        runs[PayRunKind.REGULAR.value],
        regular,
        (PayLineKind.COMPUTED,),
        actor.id,
    )
    changes += await _sync_run(
        session,
        period,
        runs[PayRunKind.ADJUSTMENT.value],
        await _adjustments(session, period, calendar, items),
        (PayLineKind.REVERSAL, PayLineKind.REPLACEMENT),
        actor.id,
    )
    period.computed_at = period.updated_at = utc_now()
    if changes:
        await audit_service.record_change(
            session,
            entity_type=ENTITY_TYPE,
            entity_id=str(period.id),
            record_type="pay_period_computation",
            record_id=str(period.id),
            action="compute",
            changes={"changed_lines": (None, changes)},
            organisation_id=period.organisation_id,
        )
    logger.info(
        "Pay period computed",
        extra={"period_id": str(period.id), "changed_lines": changes},
    )
    return changes


async def compute(
    session: AsyncSession, actor: User, period_id: uuid.UUID
) -> PayPeriod:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.PREPARE
    )
    if period.status != PayPeriodStatus.OPEN:
        raise PayrollConflictError("Only an open period can be recomputed")
    await _compute(session, period, actor)
    await session.commit()
    await session.refresh(period)
    return period


# ── Manual lines ───────────────────────────────────────────────────────────────


async def add_manual_line(
    session: AsyncSession,
    actor: User,
    period_id: uuid.UUID,
    payload: PayLineManualCreate,
) -> PayLine:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.PREPARE
    )
    if period.status != PayPeriodStatus.OPEN:
        raise PayrollConflictError("Lines can only be added while the period is open")
    item = await session.get(PayItem, payload.pay_item_id)
    if item is None or item.organisation_id != period.organisation_id:
        raise NotFoundError("Pay item not found")
    if not item.is_active:
        raise PayrollValidationError("This pay item is no longer in use")
    if not accepts_manual_lines(item):
        raise PayrollValidationError(
            "This pay item is counted from approved attendance; correct the attendance instead"
        )
    if (
        item.unit == PayItemUnit.COUNT
        and payload.quantity != payload.quantity.to_integral_value()
    ):
        raise PayrollValidationError("A count must be a whole number")
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == payload.user_id,
            EmploymentRecord.organisation_id == period.organisation_id,
        )
    )
    if employment is None:
        raise NotFoundError("Employee not found in this organisation")
    runs = await _runs(session, period)
    run = runs[PayRunKind.REGULAR.value]
    adjusts_period_id = None
    if payload.adjusts_line_id is not None:
        target = await session.get(PayLine, payload.adjusts_line_id)
        target_period = (
            await session.get(PayPeriod, target.period_id) if target else None
        )
        if (
            target is None
            or target_period is None
            or target_period.calendar_id != period.calendar_id
            or target_period.status not in LOCKED_VALUES
            or target.user_id != payload.user_id
            or target.pay_item_id != payload.pay_item_id
        ):
            raise PayrollValidationError(
                "A correction must point to the same employee and pay item in an approved period"
            )
        run = runs[PayRunKind.ADJUSTMENT.value]
        adjusts_period_id = target_period.id
    elif payload.quantity < 0:
        raise PayrollValidationError(
            "A negative quantity is only allowed when correcting an approved line"
        )
    line = PayLine(
        run_id=run.id,
        period_id=period.id,
        user_id=payload.user_id,
        department_id=employment.department_id,
        pay_item_id=item.id,
        quantity=payload.quantity,
        line_kind=PayLineKind.MANUAL.value,
        source_type=MANUAL_SOURCE,
        source_key=f"manual:{uuid.uuid4()}",
        work_date=payload.work_date,
        reason=payload.reason,
        adjusts_period_id=adjusts_period_id,
        adjusts_line_id=payload.adjusts_line_id,
        created_by_user_id=actor.id,
    )
    session.add(line)
    period.updated_at = utc_now()
    await session.commit()
    await session.refresh(line)
    logger.info(
        "Manual pay line added",
        extra={"period_id": str(period.id), "line_id": str(line.id)},
    )
    return line


async def delete_manual_line(
    session: AsyncSession, actor: User, period_id: uuid.UUID, line_id: uuid.UUID
) -> None:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.PREPARE
    )
    line = await session.get(PayLine, line_id)
    if line is None or line.period_id != period.id:
        raise NotFoundError("Pay line not found")
    if line.line_kind != PayLineKind.MANUAL:
        raise PayrollValidationError("Only lines entered by hand can be removed")
    if period.status != PayPeriodStatus.OPEN:
        raise PayrollConflictError("Lines can only be removed while the period is open")
    await session.delete(line)
    await session.commit()


# ── Review, lock, export ───────────────────────────────────────────────────────


async def submit(session: AsyncSession, actor: User, period_id: uuid.UUID) -> PayPeriod:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.PREPARE
    )
    if period.status != PayPeriodStatus.OPEN:
        raise PayrollConflictError("Only an open period can be submitted for approval")
    calendar = await session.get(PayCalendar, period.calendar_id)
    assert calendar is not None
    # What the approver sees is what approved attendance yields at submission.
    await _compute(session, period, actor)
    instance_id = await workflow_service.start_workflow_for_entity(
        session=session,
        current_user=actor,
        department_id=calendar.approval_department_id,
        workflow_type=WorkflowType.PAYROLL_RUN,
        entity_type=ENTITY_TYPE,
        entity_id=period.id,
    )
    instance = await session.get(WorkflowInstance, instance_id)
    if instance is None:
        raise PayrollConflictError("The payroll approval could not be started")
    # The preparer can never approve, whatever the department policy says.
    instance.allow_self_approval = False
    instance.require_distinct_approvers = True
    period.workflow_instance_id = instance.id
    period.status = PayPeriodStatus.IN_REVIEW.value
    period.submitted_by_user_id = actor.id
    period.submitted_at = period.updated_at = utc_now()
    await session.commit()
    await session.refresh(period)
    logger.info("Pay period submitted", extra={"period_id": str(period.id)})
    return period


async def _review(
    session: AsyncSession,
    actor: User,
    period_id: uuid.UUID,
    action: WorkflowAction,
    comments: str | None,
    token: str | None,
) -> PayPeriod:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.APPROVE
    )
    if token is not None:
        await access.require_mfa(session, actor, token)
    if (
        period.status != PayPeriodStatus.IN_REVIEW
        or period.workflow_instance_id is None
    ):
        raise PayrollConflictError("This period is not awaiting approval")
    if period.submitted_by_user_id == actor.id:
        raise AppException(
            "The person who prepared this period cannot approve or return it", 403
        )
    await workflow_service.apply_workflow_action(
        session=session,
        current_user=actor,
        workflow_instance_id=period.workflow_instance_id,
        action_in=WorkflowActionRequest(action=action, comments=comments),
        require_actor_permission=False,
        commit=False,
    )
    await session.commit()
    await session.refresh(period)
    logger.info(
        "Pay period reviewed",
        extra={
            "period_id": str(period.id),
            "action": action.value,
            "status": period.status,
        },
    )
    return period


async def approve(
    session: AsyncSession,
    actor: User,
    period_id: uuid.UUID,
    *,
    comments: str | None,
    token: str,
) -> PayPeriod:
    return await _review(
        session, actor, period_id, WorkflowAction.APPROVE, comments, token
    )


async def return_for_changes(
    session: AsyncSession, actor: User, period_id: uuid.UUID, *, comments: str
) -> PayPeriod:
    return await _review(
        session, actor, period_id, WorkflowAction.RETURN, comments, None
    )


async def finalize_review(
    session: AsyncSession, instance: WorkflowInstance, actor_id: uuid.UUID
) -> None:
    """Workflow finalize hook: approval locks the period; anything else reopens it."""
    del actor_id
    period = await session.scalar(
        select(PayPeriod).where(PayPeriod.id == instance.entity_id).with_for_update()
    )
    if (
        period is None
        or period.workflow_instance_id != instance.id
        or instance.workflow_type != WorkflowType.PAYROLL_RUN
    ):
        raise PayrollConflictError("Workflow does not match this pay period")
    if instance.status == WorkflowStatus.APPROVED:
        period.status = PayPeriodStatus.APPROVED.value
        period.approved_at = utc_now()
    elif instance.status in {
        WorkflowStatus.RETURNED,
        WorkflowStatus.REJECTED,
        WorkflowStatus.CANCELLED,
    }:
        period.status = PayPeriodStatus.OPEN.value
    period.updated_at = utc_now()


async def export_csv(
    session: AsyncSession, actor: User, period_id: uuid.UUID, *, token: str
) -> tuple[str, str]:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.EXPORT
    )
    await access.require_mfa(session, actor, token)
    if period.status not in LOCKED_VALUES:
        raise PayrollConflictError("Only an approved period can be exported")
    rows = [
        dict(row._mapping)
        for row in (
            await session.execute(
                _line_columns()
                .add_columns(Department.code.label("department_code"))
                .join(Department, Department.id == PayLine.department_id)
                .where(PayLine.period_id == period.id)
                .order_by(
                    EmploymentRecord.employee_number.nulls_last(),
                    PayLine.user_id,
                    PayRun.kind.desc(),
                    PayLine.work_date.nulls_last(),
                    PayItem.sort_order,
                    PayLine.created_at,
                )
            )
        ).all()
    ]
    adjusted = {
        row[0]: row[1]
        for row in (
            await session.execute(
                select(PayPeriod.id, PayPeriod.start_date).where(
                    PayPeriod.id.in_(
                        {r["adjusts_period_id"] for r in rows if r["adjusts_period_id"]}
                    )
                )
            )
        ).all()
    }
    content = export.render(period, rows, adjusted)
    previous_count = period.export_count
    if period.status == PayPeriodStatus.APPROVED:
        period.status = PayPeriodStatus.EXPORTED.value
        period.exported_at = utc_now()
    period.export_count = previous_count + 1
    period.updated_at = utc_now()
    await audit_service.record_change(
        session,
        entity_type=ENTITY_TYPE,
        entity_id=str(period.id),
        record_type="pay_period_export",
        record_id=str(period.id),
        action="export",
        changes={
            "export_count": (previous_count, period.export_count),
            "row_count": (None, len(rows)),
        },
        organisation_id=period.organisation_id,
    )
    await session.commit()
    logger.info(
        "Pay period exported",
        extra={
            "period_id": str(period.id),
            "row_count": len(rows),
            "actor_id": str(actor.id),
        },
    )
    return export.filename(period), content


async def close(session: AsyncSession, actor: User, period_id: uuid.UUID) -> PayPeriod:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.PREPARE
    )
    if period.status != PayPeriodStatus.EXPORTED:
        raise PayrollConflictError("Export the period before closing it")
    period.status = PayPeriodStatus.CLOSED.value
    period.closed_at = period.updated_at = utc_now()
    await session.commit()
    await session.refresh(period)
    return period
