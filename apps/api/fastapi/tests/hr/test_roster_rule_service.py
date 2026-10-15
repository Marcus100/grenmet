from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import AuthorizationError
from src.hr.models import Department
from src.hr.roster.models import (
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.rule_service import (
    check_period_rules,
    read_department_rules,
    update_department_rules,
)
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
from tests.utils.utils import random_email, random_lower_string

DEPT = "dept_rules"


async def _manager(db: AsyncSession, *, superuser: bool = True) -> User:
    return await create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"rules_{random_lower_string()}",
            password="password123",
            first_name="Rules",
            last_name="Manager",
            is_superuser=superuser,
        ),
    )


async def _seed(db: AsyncSession) -> None:
    if not await db.get(Department, DEPT):
        db.add(Department(organisation_id="gaa", code=DEPT, id=DEPT, name="Dept Rules"))
    for code, start, end, next_day in (
        ("M", "05:30", "14:00", False),
        ("N", "22:30", "06:00", True),
    ):
        if not await db.get(ShiftCatalog, code):
            db.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=ShiftCategory.WORK,
                    start_time=start,
                    end_time=end,
                    ends_next_day=next_day,
                )
            )
    await db.commit()


async def _night_then_morning(db: AsyncSession) -> tuple[User, RosterPeriod]:
    await _seed(db)
    manager = await _manager(db)
    await make_employee(db, user=manager, department_id=DEPT)
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id,
                    assignment_date=date(2026, 8, 3),
                    shift_code="N",
                ),
                RosterAssignmentInput(
                    user_id=manager.id,
                    assignment_date=date(2026, 8, 4),
                    shift_code="M",
                ),
            ],
        ),
    )
    return manager, period


async def test_no_limits_means_no_violations(db_async: AsyncSession) -> None:
    manager, period = await _night_then_morning(db_async)
    rules = await read_department_rules(
        session=db_async, current_user=manager, department_id=DEPT
    )
    assert rules is None or rules.min_rest_hours is None
    _, _, violations = await check_period_rules(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert violations == []


async def test_rest_violation_is_reported_and_publish_still_succeeds(
    db_async: AsyncSession,
) -> None:
    manager, period = await _night_then_morning(db_async)
    saved = await update_department_rules(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=RosterRulesUpdate(min_rest_hours=Decimal(11)),
    )
    assert saved.min_rest_hours == Decimal("11.00")
    assert saved.max_weekly_hours is None

    _, rules, violations = await check_period_rules(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert rules.min_rest_hours == Decimal("11.00")
    [violation] = violations
    assert violation.code == RuleCode.MIN_REST
    assert violation.user_id == manager.id

    published = await publish_roster_period(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert published.status == RosterPeriodStatus.PUBLISHED


async def test_update_replaces_all_limits(db_async: AsyncSession) -> None:
    manager, _ = await _night_then_morning(db_async)
    await update_department_rules(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=RosterRulesUpdate(min_rest_hours=Decimal(11), max_consecutive_days=6),
    )
    saved = await update_department_rules(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=RosterRulesUpdate(max_weekly_hours=Decimal(40)),
    )
    assert saved.min_rest_hours is None
    assert saved.max_consecutive_days is None
    assert saved.max_weekly_hours == Decimal("40.00")


async def test_user_without_roster_manage_cannot_set_limits(
    db_async: AsyncSession,
) -> None:
    await _seed(db_async)
    staff = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await update_department_rules(
            session=db_async,
            current_user=staff,
            department_id=DEPT,
            data=RosterRulesUpdate(min_rest_hours=Decimal(11)),
        )
