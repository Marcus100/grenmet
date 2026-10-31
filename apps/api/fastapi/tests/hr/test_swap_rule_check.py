"""Roster rule check for a shift exchange (#380): only introduced breaches, short
notice for exchanged cells, and enforcement at approval."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.exchange.swap_rules import check_swap_rules
from src.hr.models import Department
from src.hr.roster import change_checks
from src.hr.roster.models import RosterRuleOverride, ShiftCatalog, ShiftCategory
from src.hr.roster.rule_service import (
    RosterRuleWarningsError,
    save_department_rule_set,
    update_from_rules,
)
from src.hr.roster.rules import DEFAULT_RULES, RuleCode
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from src.utils.timezones import local_today
from tests.factories import make_employee, make_user

DEPT = "dept_swaprules"
JUL_6 = date(2026, 7, 6)


async def _setup(
    db: AsyncSession, first: date = JUL_6
) -> tuple[User, User, ShiftSwapRequest]:
    second = first + timedelta(days=1)
    if not await db.get(Department, DEPT):
        db.add(Department(organisation_id="gaa", code=DEPT, id=DEPT, name=DEPT))
    for code, category, start, end in (
        ("SE", ShiftCategory.WORK, "14:00", "22:30"),
        ("SM", ShiftCategory.WORK, "05:30", "14:00"),
        ("SO", ShiftCategory.OFF, None, None),
    ):
        if not await db.get(ShiftCatalog, code):
            db.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=category,
                    start_time=start,
                    end_time=end,
                    counts_as_work_hours=category == ShiftCategory.WORK,
                )
            )
    await db.commit()
    manager = await make_user(db, superuser=True)
    other = await make_user(db, superuser=True)
    await make_employee(db, user=manager, department_id=DEPT)
    await make_employee(db, user=other, department_id=DEPT)
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=first - timedelta(days=5),
            period_end=first + timedelta(days=20),
        ),
    )
    plan = {
        (manager.id, first): "SE",
        (manager.id, second): "SO",
        (other.id, first): "SO",
        (other.id, second): "SM",
    }
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(user_id=u, assignment_date=d, shift_code=c)
                for (u, d), c in plan.items()
            ],
        ),
    )
    # SE and SM are 8.5 h: publishing already breaks the 8 h daily limit.
    await publish_roster_period(
        session=db,
        current_user=manager,
        period_id=period.id,
        rule_override_reason="Existing long shifts",
    )
    swap = ShiftSwapRequest(
        requesting_user_id=manager.id,
        counterpart_user_id=other.id,
        department_id=DEPT,
        source_date=second,
        source_shift_code="SO",
        target_date=second,
        target_shift_code="SM",
    )
    db.add(swap)
    await db.commit()
    return manager, other, swap


async def test_only_breaches_the_swap_introduces_are_reported(
    db_async: AsyncSession,
) -> None:
    manager, _, swap = await _setup(db_async)
    _, violations = await check_swap_rules(
        session=db_async, current_user=manager, swap=swap
    )
    [violation] = violations
    assert violation.code == RuleCode.MAX_DAILY_HOURS
    assert violation.user_id == manager.id
    assert violation.start_date == JUL_6 + timedelta(days=1)
    assert violation.observed == Decimal("8.50")


async def test_rules_switched_off_report_nothing(db_async: AsyncSession) -> None:
    manager, _, swap = await _setup(db_async)
    off = update_from_rules(DEFAULT_RULES).model_copy(
        update={"shift_daily_hours": None, "notice_days": None}
    )
    await save_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT, data=off
    )
    _, violations = await check_swap_rules(
        session=db_async, current_user=manager, swap=swap
    )
    assert violations == []


async def test_swap_inside_the_notice_window_is_flagged(
    db_async: AsyncSession,
) -> None:
    manager, other, swap = await _setup(db_async, local_today() + timedelta(days=1))
    _, violations = await check_swap_rules(
        session=db_async, current_user=manager, swap=swap
    )
    notice = [v for v in violations if v.code == RuleCode.SHORT_NOTICE]
    assert {v.user_id for v in notice} == {manager.id, other.id}


async def test_approval_needs_a_reason_for_a_breaking_swap(
    db_async: AsyncSession,
) -> None:
    manager, _, swap = await _setup(db_async)
    with pytest.raises(RosterRuleWarningsError) as warned:
        await change_checks.check_swap_approval(
            db_async, swap=swap, actor_id=manager.id, reason=None
        )
    assert warned.value.context.value == "SHIFT_SWAP"
    await change_checks.check_swap_approval(
        db_async, swap=swap, actor_id=manager.id, reason="Agreed by both officers"
    )
    await db_async.commit()
    override = (
        await db_async.scalars(
            select(RosterRuleOverride).where(
                RosterRuleOverride.entity_id == str(swap.id)
            )
        )
    ).one()
    assert override.rule_codes == ["MAX_DAILY_HOURS"]


async def test_outsider_without_roster_view_is_refused(db_async: AsyncSession) -> None:
    _, _, swap = await _setup(db_async)
    outsider = await make_user(db_async)
    with pytest.raises(AppException):
        await check_swap_rules(session=db_async, current_user=outsider, swap=swap)
