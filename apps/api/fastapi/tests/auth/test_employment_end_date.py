"""#797: an employment end date stops access on that date, before any job runs.

"Today" is the Grenada calendar date (America/Grenada, UTC-4), never UTC, so a
record ends on its last day in Grenada rather than at 20:00 local time.
"""

from datetime import date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.access import effective_roles
from src.auth.models import RoleAssignmentScope
from src.auth.policy import _active_assignments
from src.hr.models import EmploymentStatus
from src.utils import timezones
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)

TODAY = date(2026, 10, 30)
TOMORROW = date(2026, 10, 31)
YESTERDAY = date(2026, 10, 29)


@pytest.fixture(autouse=True)
def grenada_today(monkeypatch: pytest.MonkeyPatch) -> date:
    # 14:00 UTC is 10:00 in Grenada, so the Grenada date is TODAY everywhere.
    monkeypatch.setattr(timezones, "utc_now", lambda: datetime(2026, 10, 30, 14, 0))
    return TODAY


async def _live_ids(db: AsyncSession, user_id) -> set:
    return {a.id for a in await _active_assignments(session=db, user_id=user_id)}


async def test_end_date_today_ends_roles_before_any_job_runs(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_gate_dept1")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    grant = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    assert grant.id in await _live_ids(db_async, user.id)

    record.end_date = TODAY
    await db_async.commit()

    assert grant.id not in await _live_ids(db_async, user.id)
    assert role.id not in {r.id for r in await effective_roles(db_async, user)}


async def test_end_date_in_the_past_ends_roles(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_gate_dept2")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    grant = await assign_role(db_async, user=user, role=role)

    record.end_date = YESTERDAY
    await db_async.commit()

    assert grant.id not in await _live_ids(db_async, user.id)


async def test_end_date_tomorrow_keeps_roles_until_that_day(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_gate_dept3")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    grant = await assign_role(db_async, user=user, role=role)

    record.end_date = TOMORROW
    await db_async.commit()

    assert grant.id in await _live_ids(db_async, user.id)


async def test_department_scope_role_ends_on_end_date(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_gate_dept4")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    grant = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )
    assert grant.id in await _live_ids(db_async, user.id)

    record.end_date = TODAY
    await db_async.commit()

    assert grant.id not in await _live_ids(db_async, user.id)


async def test_old_plain_role_link_ends_on_end_date(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_gate_dept5")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    user.roles.append(role)
    db_async.add(user)
    await db_async.commit()
    assert role.id in {r.id for r in await effective_roles(db_async, user)}

    record.end_date = TODAY
    await db_async.commit()

    assert role.id not in {r.id for r in await effective_roles(db_async, user)}


async def test_end_date_gate_uses_the_grenada_calendar_date(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """02:00 UTC on 30 October is still 29 October in Grenada (UTC-4)."""
    monkeypatch.setattr(timezones, "utc_now", lambda: datetime(2026, 10, 30, 2, 0))
    assert timezones.local_today() == YESTERDAY

    department = await make_department(db_async, "end_gate_dept6")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    grant = await assign_role(db_async, user=user, role=role)

    record.end_date = YESTERDAY
    await db_async.commit()
    assert grant.id not in await _live_ids(db_async, user.id)

    record.end_date = date(2026, 10, 30)
    await db_async.commit()
    assert grant.id in await _live_ids(db_async, user.id)


def test_live_employment_helper_matches_the_status_and_end_date_rule() -> None:
    from src.hr.models import EmploymentRecord

    def record(status: EmploymentStatus, end: date | None) -> EmploymentRecord:
        return EmploymentRecord(status=status, end_date=end)

    assert record(EmploymentStatus.ACTIVE, None).is_live(TODAY)
    assert record(EmploymentStatus.ACTIVE, TOMORROW).is_live(TODAY)
    assert not record(EmploymentStatus.ACTIVE, TODAY).is_live(TODAY)
    assert not record(EmploymentStatus.ACTIVE, YESTERDAY).is_live(TODAY)
    assert not record(EmploymentStatus.TERMINATED, None).is_live(TODAY)
    assert not record(EmploymentStatus.INACTIVE, TOMORROW).is_live(TODAY)
