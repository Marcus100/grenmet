"""Warn-only roster rule check for a proposed shift exchange.

Applies the exchange to the two employees' published rosters in memory and reports
only the rule breaches the exchange would introduce, so a pre-existing breach is not
blamed on the swap. It never blocks approval.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
)
from src.hr.roster.rule_service import policy_for, rules_from_policy
from src.hr.roster.rules import (
    RosterRules,
    RosterShift,
    RuleViolation,
    check_roster_rules,
)
from src.hr.roster.service import require_roster_read_scope

from .models import ShiftSwapRequest

_MIN_WINDOW_DAYS = 7


def _key(violation: RuleViolation) -> tuple[str, str, str, str]:
    return (
        violation.code.value,
        str(violation.user_id),
        violation.start_date.isoformat(),
        violation.end_date.isoformat(),
    )


async def check_swap_rules(
    *, session: AsyncSession, current_user: User, swap: ShiftSwapRequest
) -> tuple[RosterRules, list[RuleViolation]]:
    parties = {swap.requesting_user_id, swap.counterpart_user_id}
    if current_user.id not in parties:
        require_permission(current_user=current_user, permission_key="roster.view")
        await require_roster_read_scope(session, current_user, swap.department_id)
    rules = rules_from_policy(await policy_for(session, swap.department_id))
    if rules == RosterRules():
        return rules, []

    dates = {swap.source_date, swap.target_date}
    pad = timedelta(days=max(_MIN_WINDOW_DAYS, rules.max_consecutive_days or 0))
    rows = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(
                RosterAssignment.user_id.in_(parties),
                RosterAssignment.assignment_date >= min(dates) - pad,
                RosterAssignment.assignment_date <= max(dates) + pad,
                RosterPeriod.status.in_(
                    [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                ),
            )
        )
    ).all()
    cells = {(a.user_id, a.assignment_date): shift for a, shift in rows}
    before = [
        RosterShift(user_id=user_id, assignment_date=day, shift=shift)
        for (user_id, day), shift in cells.items()
    ]
    swapped = dict(cells)
    for day in dates:
        mine = (swap.requesting_user_id, day)
        theirs = (swap.counterpart_user_id, day)
        if mine in cells and theirs in cells:
            swapped[mine], swapped[theirs] = cells[theirs], cells[mine]
    after = [
        RosterShift(user_id=user_id, assignment_date=day, shift=shift)
        for (user_id, day), shift in swapped.items()
    ]
    existing = {_key(v) for v in check_roster_rules(before, rules)}
    introduced = [
        v for v in check_roster_rules(after, rules) if _key(v) not in existing
    ]
    return rules, introduced
