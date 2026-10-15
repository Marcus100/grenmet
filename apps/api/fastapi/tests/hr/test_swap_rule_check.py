from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.exchange.swap_rules import check_swap_rules
from src.hr.models import Department
from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.roster.rule_service import update_department_rules
from src.hr.roster.rules import RuleCode
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
    RosterRulesUpdate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from tests.factories import make_employee, make_user

DEPT = "dept_swaprules"
JUL_6, JUL_7 = date(2026, 7, 6), date(2026, 7, 7)


async def _setup(
    db: AsyncSession,
) -> tuple[User, User, ShiftSwapRequest]:
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
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    plan = {
        (manager.id, JUL_6): "SE",
        (manager.id, JUL_7): "SO",
        (other.id, JUL_6): "SO",
        (other.id, JUL_7): "SM",
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
    await publish_roster_period(session=db, current_user=manager, period_id=period.id)
    swap = ShiftSwapRequest(
        requesting_user_id=manager.id,
        counterpart_user_id=other.id,
        department_id=DEPT,
        source_date=JUL_7,
        source_shift_code="SO",
        target_date=JUL_7,
        target_shift_code="SM",
    )
    db.add(swap)
    await db.commit()
    return manager, other, swap


async def test_swap_that_creates_short_rest_is_reported(db_async: AsyncSession) -> None:
    manager, _, swap = await _setup(db_async)
    await update_department_rules(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=RosterRulesUpdate(min_rest_hours=Decimal(11)),
    )
    _, violations = await check_swap_rules(
        session=db_async, current_user=manager, swap=swap
    )
    [violation] = violations
    assert violation.code == RuleCode.MIN_REST
    assert violation.user_id == manager.id
    assert violation.observed == Decimal("7.00")


async def test_swap_within_limits_reports_nothing(db_async: AsyncSession) -> None:
    manager, _, swap = await _setup(db_async)
    await update_department_rules(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=RosterRulesUpdate(min_rest_hours=Decimal(6)),
    )
    _, violations = await check_swap_rules(
        session=db_async, current_user=manager, swap=swap
    )
    assert violations == []


async def test_no_limits_means_no_check(db_async: AsyncSession) -> None:
    manager, _, swap = await _setup(db_async)
    _, violations = await check_swap_rules(
        session=db_async, current_user=manager, swap=swap
    )
    assert violations == []


async def test_outsider_without_roster_view_is_refused(db_async: AsyncSession) -> None:
    _, _, swap = await _setup(db_async)
    outsider = await make_user(db_async)
    with pytest.raises(AppException):
        await check_swap_rules(session=db_async, current_user=outsider, swap=swap)
