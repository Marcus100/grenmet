"""Roster rule check for a proposed shift exchange (#380).

Applies the exchange to the two employees' published rosters in memory and reports
only the breaches the exchange would introduce, so a pre-existing breach is not
blamed on the swap, plus short notice for each exchanged date. The workflow's
final approval enforces the same check (``swap_violations``): the approver must
give a reason to approve an exchange that breaks a rule.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.roster import rule_service
from src.hr.roster.rules import (
    RosterRules,
    RosterShift,
    RuleViolation,
    check_notice,
)
from src.hr.roster.service import require_roster_read_scope
from src.utils.timezones import local_today

from .models import ShiftSwapRequest


async def swap_violations(
    session: AsyncSession, swap: ShiftSwapRequest
) -> tuple[RosterRules, list[RuleViolation]]:
    parties = {swap.requesting_user_id, swap.counterpart_user_id}
    dates = {swap.source_date, swap.target_date}
    changed: list[rule_service.Cell] = []

    def mutate(cells: rule_service.Cells) -> rule_service.Cells:
        for day in dates:
            mine = (swap.requesting_user_id, day)
            theirs = (swap.counterpart_user_id, day)
            if mine in cells and theirs in cells:
                if cells[mine].shift.code != cells[theirs].shift.code:
                    changed.extend([mine, theirs])
                mine_shift, their_shift = cells[mine].shift, cells[theirs].shift
                cells[mine] = RosterShift(
                    user_id=swap.requesting_user_id,
                    assignment_date=day,
                    shift=their_shift,
                )
                cells[theirs] = RosterShift(
                    user_id=swap.counterpart_user_id,
                    assignment_date=day,
                    shift=mine_shift,
                )
        return cells

    rules, found = await rule_service.change_violations(
        session,
        department_id=swap.department_id,
        user_ids=parties,
        dates=dates,
        mutate=mutate,
    )
    # Notice applies to the cells the exchange actually changes.
    profiles = await rule_service.profiles_for(session, parties)
    found += check_notice(changed, today=local_today(), rules=rules, profiles=profiles)
    return rules, found


async def check_swap_rules(
    *, session: AsyncSession, current_user: User, swap: ShiftSwapRequest
) -> tuple[RosterRules, list[RuleViolation]]:
    parties = {swap.requesting_user_id, swap.counterpart_user_id}
    if current_user.id not in parties:
        require_permission(current_user=current_user, permission_key="roster.view")
        await require_roster_read_scope(session, current_user, swap.department_id)
    return await swap_violations(session, swap)
