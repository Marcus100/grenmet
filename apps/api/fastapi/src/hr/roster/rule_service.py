"""Roster rule sets, the rule checks for each change path, and audited overrides.

Rules are data (#380): an organisation default ``RosterRuleSet`` row, optionally
replaced per department; with no row the built-in ``DEFAULT_RULES`` apply. A
break is a warning, and the change is saved only when the acting supervisor gives
a reason (``enforce``). Each override is stored in ``RosterRuleOverride`` and in
the change history of the record that was saved.
"""

import uuid
from collections.abc import Callable, Iterable, Sequence
from datetime import date, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.auth.policy import require_permission
from src.exceptions import AppException
from src.hr import organisations
from src.hr.dependencies import get_roster_period_or_404
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.models import Department, EmploymentRecord, RequestStatus
from src.utils.datetime import utc_now
from src.utils.timezones import local_today

from .models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    RosterRuleOverride,
    RosterRuleSet,
    RuleOverrideContext,
    ShiftCatalog,
    WorkerType,
    WorkPattern,
)
from .rules import (
    DEFAULT_RULES,
    EmployeeRuleProfile,
    OvertimeBandRules,
    RosterRules,
    RosterShift,
    RuleViolation,
    check_notice,
    check_roster_rules,
    introduced,
    with_worked_hours,
)
from .schemas import (
    RosterRuleProfileUpdate,
    RosterRuleSetUpdate,
    RosterRulesUpdate,
    RuleSetSource,
)
from .service import require_roster_manage_scope, require_roster_read_scope

RULES_KEY = "roster.rules.manage"
_REASON_MIN = 3
Cell = tuple[uuid.UUID, date]
Cells = dict[Cell, RosterShift]
RowFilter = Callable[[object], bool]


class RosterRuleWarningsError(AppException):
    """A change breaks roster rules and no override reason was given (409)."""

    def __init__(
        self, context: RuleOverrideContext, violations: Sequence[RuleViolation]
    ) -> None:
        count = len(violations)
        super().__init__(
            f"{count} roster rule warning{'s' if count != 1 else ''}: give a reason "
            "to save anyway",
            409,
        )
        self.context = context
        self.violations = list(violations)
        self.extra = {
            "code": "ROSTER_RULE_WARNINGS",
            "context": context.value,
            "violations": [violation_json(v) for v in violations],
        }


def violation_json(violation: RuleViolation) -> dict[str, object]:
    return {
        "code": violation.code.value,
        "user_id": str(violation.user_id),
        "start_date": violation.start_date.isoformat(),
        "end_date": violation.end_date.isoformat(),
        "observed": str(violation.observed),
        "limit": str(violation.limit),
        "detail": violation.detail,
    }


# ---------------------------------------------------------------------------
# Rule sets
# ---------------------------------------------------------------------------


def rules_from_row(row: RosterRuleSet | None) -> RosterRules:
    if row is None:
        return DEFAULT_RULES
    return RosterRules(
        work_pattern=WorkPattern(row.work_pattern),
        worker_type=WorkerType(row.worker_type),
        max_consecutive_shifts=row.max_consecutive_shifts,
        min_days_off_after_run=row.min_days_off_after_run,
        shift_daily_hours=row.shift_daily_hours,
        shift_weekly_hours=row.shift_weekly_hours,
        non_shift_daily_hours=row.non_shift_daily_hours,
        non_shift_weekly_hours=row.non_shift_weekly_hours,
        weekend_window_weeks=row.weekend_window_weeks,
        notice_days=row.notice_days,
        overtime=(
            OvertimeBandRules(
                weekday_first_hours=row.weekday_first_hours,
                weekday_first_rate=row.weekday_first_rate,
                weekday_after_rate=row.weekday_after_rate,
                saturday_window_start=time.fromisoformat(row.saturday_window_start),
                saturday_window_end=time.fromisoformat(row.saturday_window_end),
                saturday_window_rate=row.saturday_window_rate,
                saturday_after_rate=row.saturday_after_rate,
                rest_day_first_hours=row.rest_day_first_hours,
                rest_day_first_rate=row.rest_day_first_rate,
                rest_day_after_rate=row.rest_day_after_rate,
                after_midnight_rate=row.after_midnight_rate,
            )
            if row.overtime_bands_enabled
            else None
        ),
    )


def update_from_rules(rules: RosterRules) -> RosterRuleSetUpdate:
    """The editable values of a rule set (used for the built-in defaults)."""
    bands = rules.overtime or OvertimeBandRules()
    return RosterRuleSetUpdate(
        work_pattern=rules.work_pattern,
        worker_type=rules.worker_type,
        max_consecutive_shifts=rules.max_consecutive_shifts,
        min_days_off_after_run=rules.min_days_off_after_run,
        shift_daily_hours=rules.shift_daily_hours,
        shift_weekly_hours=rules.shift_weekly_hours,
        non_shift_daily_hours=rules.non_shift_daily_hours,
        non_shift_weekly_hours=rules.non_shift_weekly_hours,
        weekend_window_weeks=rules.weekend_window_weeks,
        notice_days=rules.notice_days,
        overtime_bands_enabled=rules.overtime is not None,
        weekday_first_hours=bands.weekday_first_hours,
        weekday_first_rate=bands.weekday_first_rate,
        weekday_after_rate=bands.weekday_after_rate,
        saturday_window_start=bands.saturday_window_start.strftime("%H:%M"),
        saturday_window_end=bands.saturday_window_end.strftime("%H:%M"),
        saturday_window_rate=bands.saturday_window_rate,
        saturday_after_rate=bands.saturday_after_rate,
        rest_day_first_hours=bands.rest_day_first_hours,
        rest_day_first_rate=bands.rest_day_first_rate,
        rest_day_after_rate=bands.rest_day_after_rate,
        after_midnight_rate=bands.after_midnight_rate,
    )


async def _org_row(session: AsyncSession, organisation_id: str) -> RosterRuleSet | None:
    row: RosterRuleSet | None = await session.scalar(
        select(RosterRuleSet).where(
            RosterRuleSet.organisation_id == organisation_id,
            RosterRuleSet.department_id.is_(None),
        )
    )
    return row


async def _department_row(
    session: AsyncSession, department_id: str
) -> RosterRuleSet | None:
    row: RosterRuleSet | None = await session.scalar(
        select(RosterRuleSet).where(RosterRuleSet.department_id == department_id)
    )
    return row


async def effective_rule_set(
    session: AsyncSession, department: Department
) -> tuple[RosterRuleSet | None, RuleSetSource]:
    row = await _department_row(session, department.id)
    if row is not None:
        return row, RuleSetSource.DEPARTMENT
    row = await _org_row(session, department.organisation_id)
    if row is not None:
        return row, RuleSetSource.ORGANISATION
    return None, RuleSetSource.DEFAULT


async def rules_for_department(
    session: AsyncSession, department_id: str
) -> RosterRules:
    department = await organisations.department_for(session, department_id)
    row, _ = await effective_rule_set(session, department)
    return rules_from_row(row)


async def read_organisation_rule_set(
    *, session: AsyncSession, current_user: User, organisation_id: str
) -> tuple[RosterRuleSet | None, RuleSetSource]:
    require_permission(current_user=current_user, permission_key=RULES_KEY)
    await organisations.require_organisation_permission(
        session, current_user, organisation_id, RULES_KEY
    )
    row = await _org_row(session, organisation_id)
    return row, RuleSetSource.ORGANISATION if row else RuleSetSource.DEFAULT


async def read_department_rule_set(
    *, session: AsyncSession, current_user: User, department_id: str
) -> tuple[Department, RosterRuleSet | None, RuleSetSource]:
    require_permission(current_user=current_user, permission_key="roster.view")
    await require_roster_read_scope(session, current_user, department_id)
    department = await organisations.department_for(session, department_id)
    row, source = await effective_rule_set(session, department)
    return department, row, source


def _apply(row: RosterRuleSet, data: RosterRuleSetUpdate, actor: User) -> None:
    for name, value in data.model_dump().items():
        setattr(row, name, getattr(value, "value", value))
    row.updated_by_user_id = actor.id
    row.updated_at = utc_now()


async def save_organisation_rule_set(
    *,
    session: AsyncSession,
    current_user: User,
    organisation_id: str,
    data: RosterRuleSetUpdate,
) -> RosterRuleSet:
    require_permission(current_user=current_user, permission_key=RULES_KEY)
    # Organisation defaults need organisation-wide authority.
    await organisations.require_organisation_permission(
        session, current_user, organisation_id, RULES_KEY
    )
    audit_service.set_actor(session, current_user.id)
    row = await _org_row(session, organisation_id)
    if row is None:
        row = RosterRuleSet(organisation_id=organisation_id, department_id=None)
        session.add(row)
    _apply(row, data, current_user)
    await session.commit()
    await session.refresh(row)
    return row


async def _require_department_rules_scope(
    session: AsyncSession, actor: User, department_id: str
) -> Department:
    require_permission(current_user=actor, permission_key=RULES_KEY)
    department = await organisations.department_for(session, department_id)
    await organisations.require_organisation_permission(
        session, actor, department.organisation_id, RULES_KEY, department_id
    )
    return department


async def save_department_rule_set(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    data: RosterRuleSetUpdate,
) -> RosterRuleSet:
    department = await _require_department_rules_scope(
        session, current_user, department_id
    )
    audit_service.set_actor(session, current_user.id)
    row = await _department_row(session, department_id)
    if row is None:
        row = RosterRuleSet(
            organisation_id=department.organisation_id, department_id=department_id
        )
        session.add(row)
    _apply(row, data, current_user)
    await session.commit()
    await session.refresh(row)
    return row


async def clear_department_rule_set(
    *, session: AsyncSession, current_user: User, department_id: str
) -> None:
    await _require_department_rules_scope(session, current_user, department_id)
    audit_service.set_actor(session, current_user.id)
    row = await _department_row(session, department_id)
    if row is not None:
        await session.delete(row)
        await session.commit()


async def update_department_rules(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    data: RosterRulesUpdate,
) -> RosterRules:
    """Deprecated pre-#380 endpoint, mapped onto the department rule set:
    consecutive days and weekly hours only (there is no minimum-rest rule)."""
    department = await _require_department_rules_scope(
        session, current_user, department_id
    )
    row, _ = await effective_rule_set(session, department)
    update = update_from_rules(rules_from_row(row)).model_copy(
        update={
            "max_consecutive_shifts": data.max_consecutive_days,
            "shift_weekly_hours": data.max_weekly_hours,
        }
    )
    saved = await save_department_rule_set(
        session=session,
        current_user=current_user,
        department_id=department_id,
        data=update,
    )
    return rules_from_row(saved)


# ---------------------------------------------------------------------------
# Employee profiles (coverage and worker type)
# ---------------------------------------------------------------------------


async def profiles_for(
    session: AsyncSession, user_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, EmployeeRuleProfile]:
    ids = list(set(user_ids))
    if not ids:
        return {}
    rows = await session.execute(
        select(
            EmploymentRecord.user_id,
            EmploymentRecord.union_covered,
            EmploymentRecord.rule_worker_type,
        ).where(EmploymentRecord.user_id.in_(ids))
    )
    return {
        user_id: EmployeeRuleProfile(
            covered=covered,
            worker_type=WorkerType(worker) if worker else None,
        )
        for user_id, covered, worker in rows.all()
    }


async def list_rule_profiles(
    *, session: AsyncSession, current_user: User, department_id: str
) -> tuple[RosterRules, list[tuple[EmploymentRecord, User]]]:
    await _require_department_rules_scope(session, current_user, department_id)
    rows = await session.execute(
        select(EmploymentRecord, User)
        .join(User, User.id == EmploymentRecord.user_id)
        .where(EmploymentRecord.department_id == department_id)
        .order_by(User.last_name, User.first_name)
        .limit(500)
    )
    rules = await rules_for_department(session, department_id)
    return rules, [(employment, user) for employment, user in rows.all()]


async def update_rule_profile(
    *,
    session: AsyncSession,
    current_user: User,
    user_id: uuid.UUID,
    data: RosterRuleProfileUpdate,
) -> tuple[RosterRules, EmploymentRecord, User]:
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user_id)
    )
    user = await session.get(User, user_id)
    if employment is None or user is None:
        raise AppException("Employee not found", 404)
    await _require_department_rules_scope(
        session, current_user, employment.department_id
    )
    if current_user.id == user_id and not current_user.is_superuser:
        raise HRPermissionDeniedError("You cannot change your own roster rule coverage")
    audit_service.set_actor(session, current_user.id)
    employment.union_covered = data.union_covered
    employment.rule_worker_type = data.worker_type.value if data.worker_type else None
    employment.updated_at = utc_now()
    await session.commit()
    await session.refresh(employment)
    rules = await rules_for_department(session, employment.department_id)
    return rules, employment, user


# ---------------------------------------------------------------------------
# Loading worked shifts
# ---------------------------------------------------------------------------

_Absence = tuple[uuid.UUID, date, str | None, str | None, str | None]


async def _overlay(
    session: AsyncSession,
    user_ids: list[uuid.UUID],
    start: date,
    end: date,
    include: RowFilter | None,
) -> tuple[set[Cell], list[_Absence]]:
    """Approved leave days and absences in range. ``include`` filters rows so a
    change being checked can be counted before and not after (or the reverse)."""
    from src.hr.absentee.models import AbsenteeReport
    from src.hr.leave.models import LeaveRequest

    leave_rows = (
        await session.scalars(
            select(LeaveRequest).where(
                LeaveRequest.user_id.in_(user_ids),
                LeaveRequest.status == RequestStatus.APPROVED,
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
        )
    ).all()
    cells: set[Cell] = set()
    for row in leave_rows:
        if include is not None and not include(row):
            continue
        day = max(row.start_date, start)
        while day <= min(row.end_date, end):
            cells.add((row.user_id, day))
            day += timedelta(days=1)
    absences = (
        await session.scalars(
            select(AbsenteeReport).where(
                AbsenteeReport.user_id.in_(user_ids),
                AbsenteeReport.status == RequestStatus.APPROVED,
                AbsenteeReport.report_date.between(start, end),
            )
        )
    ).all()
    return cells, [
        (
            row.user_id,
            row.report_date,
            row.expected_shift_code,
            row.absence_start_time,
            row.absence_end_time,
        )
        for row in absences
        if include is None or include(row)
    ]


def _full_absence(
    shift: ShiftCatalog, code: str | None, start: str | None, end: str | None
) -> bool:
    """Mirrors ``service.assignment_availability``: a full-day absence."""
    if code is not None and code != shift.code:
        return False
    return (start is None and end is None) or (
        start == shift.start_time and end == shift.end_time
    )


async def load_cells(
    session: AsyncSession,
    *,
    user_ids: Iterable[uuid.UUID],
    start: date,
    end: date,
    draft_period_id: uuid.UUID | None = None,
    include: RowFilter | None = None,
) -> Cells:
    """Rostered cells for ``user_ids`` in [start, end] from published and closed
    periods (plus ``draft_period_id``), with approved leave and full-day absences
    removed."""
    ids = list(set(user_ids))
    if not ids:
        return {}
    visible = RosterPeriod.status != RosterPeriodStatus.DRAFT
    if draft_period_id is not None:
        visible = visible | (RosterPeriod.id == draft_period_id)
    rows = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .where(
                RosterAssignment.user_id.in_(ids),
                RosterAssignment.assignment_date.between(start, end),
                visible,
            )
        )
    ).all()
    leave_cells, absences = await _overlay(session, ids, start, end, include)
    absent: dict[Cell, list[tuple[str | None, str | None, str | None]]] = {}
    for user_id, day, code, a_start, a_end in absences:
        absent.setdefault((user_id, day), []).append((code, a_start, a_end))
    cells: Cells = {}
    for assignment, shift in rows:
        cell = (assignment.user_id, assignment.assignment_date)
        if cell in leave_cells or any(
            _full_absence(shift, *entry) for entry in absent.get(cell, [])
        ):
            continue
        cells[cell] = RosterShift(
            user_id=assignment.user_id,
            assignment_date=assignment.assignment_date,
            shift=shift,
        )
    return cells


def _in_range(
    violations: Iterable[RuleViolation], start: date, end: date
) -> list[RuleViolation]:
    return [v for v in violations if v.end_date >= start and v.start_date <= end]


def worked_hours_cells(
    cells: Cells, worked: dict[Cell, tuple[ShiftCatalog, Decimal]]
) -> Cells:
    """Replace or add cells with the hours actually worked (overtime checks)."""
    for (user_id, day), (shift, hours) in worked.items():
        current = cells.get((user_id, day))
        base = (
            current
            if current is not None and current.is_worked
            else RosterShift(user_id=user_id, assignment_date=day, shift=shift)
        )
        cells[(user_id, day)] = with_worked_hours(base, hours)
    return cells


# ---------------------------------------------------------------------------
# Checks per change path
# ---------------------------------------------------------------------------


async def period_violations(
    session: AsyncSession, period: RosterPeriod
) -> tuple[RosterRules, list[RuleViolation]]:
    """All breaches in a period, with neighbouring published periods loaded so
    runs and weekend windows crossing its edges are seen."""
    rules = await rules_for_department(session, period.department_id)
    if not rules.checks_roster:
        return rules, []
    users = set(
        await session.scalars(
            select(RosterAssignment.user_id).where(
                RosterAssignment.roster_period_id == period.id
            )
        )
    )
    pad = rules.window_padding()
    coverage = (period.period_start - pad, period.period_end + pad)
    cells = await load_cells(
        session,
        user_ids=users,
        start=coverage[0],
        end=coverage[1],
        draft_period_id=period.id,
    )
    profiles = await profiles_for(session, users)
    violations = check_roster_rules(list(cells.values()), rules, profiles, coverage)
    return rules, _in_range(violations, period.period_start, period.period_end)


async def change_violations(
    session: AsyncSession,
    *,
    department_id: str,
    user_ids: Iterable[uuid.UUID],
    dates: Iterable[date],
    mutate: Callable[[Cells], Cells] = lambda cells: cells,
    changed: Iterable[Cell] = (),
    include_before: RowFilter | None = None,
    include_after: RowFilter | None = None,
) -> tuple[RosterRules, list[RuleViolation]]:
    """Breaches a change introduces on published rosters, plus short notice for
    each changed cell. ``mutate`` turns the current cells into the changed ones;
    ``include_before``/``include_after`` filter leave and absence rows."""
    rules = await rules_for_department(session, department_id)
    ids = set(user_ids)
    days = sorted(set(dates))
    if not ids or not days:
        return rules, []
    profiles = await profiles_for(session, ids)
    found: list[RuleViolation] = []
    if rules.checks_roster:
        pad = rules.window_padding()
        coverage = (days[0] - pad, days[-1] + pad)
        before_cells = await load_cells(
            session,
            user_ids=ids,
            start=coverage[0],
            end=coverage[1],
            include=include_before,
        )
        after_cells = (
            dict(before_cells)
            if include_after is include_before
            else await load_cells(
                session,
                user_ids=ids,
                start=coverage[0],
                end=coverage[1],
                include=include_after,
            )
        )
        before = check_roster_rules(
            list(before_cells.values()), rules, profiles, coverage
        )
        after = check_roster_rules(
            list(mutate(after_cells).values()), rules, profiles, coverage
        )
        found += introduced(before, after)
    found += check_notice(changed, today=local_today(), rules=rules, profiles=profiles)
    return rules, found


async def enforce(
    session: AsyncSession,
    *,
    actor: User,
    violations: Sequence[RuleViolation],
    reason: str | None,
    context: RuleOverrideContext,
    entity_type: str,
    entity_id: str,
    department_id: str,
) -> RosterRuleOverride | None:
    """Raise the warnings unless a reason is given; with a reason, record the
    override (who, when, rules, reason) and let the change continue."""
    if not violations:
        return None
    text = (reason or "").strip()
    if not text:
        raise RosterRuleWarningsError(context, violations)
    if len(text) < _REASON_MIN:
        raise HRValidationError("Give a reason of at least 3 characters")
    department = await organisations.department_for(session, department_id)
    codes = sorted({v.code.value for v in violations})
    override = RosterRuleOverride(
        id=uuid.uuid4(),
        organisation_id=department.organisation_id,
        department_id=department_id,
        context=context.value,
        entity_type=entity_type,
        entity_id=entity_id,
        rule_codes=codes,
        violations=[violation_json(v) for v in violations],
        reason=text,
        overridden_by_user_id=actor.id,
        created_at=utc_now(),
    )
    session.add(override)
    audit_service.set_actor(session, actor.id)
    await audit_service.record_change(
        session,
        entity_type=entity_type,
        entity_id=entity_id,
        record_type="roster_rule_override",
        record_id=str(override.id),
        action="rule_override",
        changes={
            "rules_overridden": (None, ", ".join(codes)),
            "override_reason": (None, text),
        },
        organisation_id=department.organisation_id,
    )
    return override


async def list_overrides(
    *, session: AsyncSession, current_user: User, department_id: str, limit: int
) -> list[tuple[RosterRuleOverride, User]]:
    """For HR rule administrators and the department's roster managers."""
    try:
        await _require_department_rules_scope(session, current_user, department_id)
    except AppException:
        require_permission(current_user=current_user, permission_key="roster.manage")
        await require_roster_manage_scope(session, current_user, department_id)
    rows = await session.execute(
        select(RosterRuleOverride, User)
        .join(User, User.id == RosterRuleOverride.overridden_by_user_id)
        .where(RosterRuleOverride.department_id == department_id)
        .order_by(RosterRuleOverride.created_at.desc())
        .limit(limit)
    )
    return [(override, user) for override, user in rows.all()]


async def check_period_rules(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> tuple[RosterPeriod, RosterRules, list[RuleViolation]]:
    require_permission(current_user=current_user, permission_key="roster.view")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    await require_roster_read_scope(session, current_user, period.department_id)
    rules, violations = await period_violations(session, period)
    return period, rules, violations


async def read_department_rules(
    *, session: AsyncSession, current_user: User, department_id: str
) -> RosterRules:
    require_permission(current_user=current_user, permission_key="roster.view")
    await require_roster_read_scope(session, current_user, department_id)
    return await rules_for_department(session, department_id)
