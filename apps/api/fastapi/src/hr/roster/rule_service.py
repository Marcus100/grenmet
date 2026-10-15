"""Department roster rule limits and the warn-only rule check for a period.

Limits live on ``DepartmentPolicy`` (NULL disables a rule). The check never blocks
publishing: it returns violations for the manager to review, and blocking is a
later, explicit decision once GAA HR confirms the limits.
"""

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.dependencies import get_roster_period_or_404
from src.hr.timesheet.models import DepartmentPolicy
from src.utils.datetime import utc_now

from .models import RosterAssignment, RosterPeriod, RosterPeriodStatus, ShiftCatalog
from .rules import RosterRules, RosterShift, RuleViolation, check_roster_rules
from .schemas import RosterRulesUpdate
from .service import require_roster_manage_scope, require_roster_read_scope

_MIN_WINDOW_DAYS = 7


def rules_from_policy(policy: DepartmentPolicy | None) -> RosterRules:
    if policy is None:
        return RosterRules()
    return RosterRules(
        min_rest_hours=policy.min_rest_hours,
        max_consecutive_days=policy.max_consecutive_days,
        max_weekly_hours=policy.max_weekly_hours,
    )


async def _policy_for(
    session: AsyncSession, department_id: str
) -> DepartmentPolicy | None:
    result = await session.execute(
        select(DepartmentPolicy).where(DepartmentPolicy.department_id == department_id)
    )
    return result.scalars().first()


async def read_department_rules(
    *, session: AsyncSession, current_user: User, department_id: str
) -> DepartmentPolicy | None:
    require_permission(current_user=current_user, permission_key="roster.view")
    await require_roster_read_scope(session, current_user, department_id)
    return await _policy_for(session, department_id)


async def update_department_rules(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    data: RosterRulesUpdate,
) -> DepartmentPolicy:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, department_id)
    audit_service.set_actor(session, current_user.id)
    policy = await _policy_for(session, department_id)
    if policy is None:
        policy = DepartmentPolicy(department_id=department_id)
        session.add(policy)
    policy.min_rest_hours = data.min_rest_hours
    policy.max_consecutive_days = data.max_consecutive_days
    policy.max_weekly_hours = data.max_weekly_hours
    policy.updated_at = utc_now()
    await session.commit()
    await session.refresh(policy)
    return policy


async def _window_shifts(
    session: AsyncSession, period: RosterPeriod, rules: RosterRules
) -> list[RosterShift]:
    """Shifts for the period's employees, padded so runs and rest gaps that cross
    the period boundary are seen. Neighbouring draft periods are not included."""
    pad = timedelta(days=max(_MIN_WINDOW_DAYS, rules.max_consecutive_days or 0))
    users = select(RosterAssignment.user_id).where(
        RosterAssignment.roster_period_id == period.id
    )
    result = await session.execute(
        select(RosterAssignment, ShiftCatalog)
        .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
        .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
        .where(
            RosterAssignment.user_id.in_(users),
            RosterAssignment.assignment_date >= period.period_start - pad,
            RosterAssignment.assignment_date <= period.period_end + pad,
            (RosterPeriod.id == period.id)
            | (RosterPeriod.status != RosterPeriodStatus.DRAFT),
        )
    )
    return [
        RosterShift(
            user_id=assignment.user_id,
            assignment_date=assignment.assignment_date,
            shift=shift,
        )
        for assignment, shift in result.all()
    ]


async def check_period_rules(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> tuple[RosterPeriod, RosterRules, list[RuleViolation]]:
    require_permission(current_user=current_user, permission_key="roster.view")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    await require_roster_read_scope(session, current_user, period.department_id)
    rules = rules_from_policy(await _policy_for(session, period.department_id))
    if rules == RosterRules():
        return period, rules, []
    violations = check_roster_rules(await _window_shifts(session, period, rules), rules)
    in_period = [
        v
        for v in violations
        if v.end_date >= period.period_start and v.start_date <= period.period_end
    ]
    return period, rules, in_period
