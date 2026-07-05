from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import NotFoundError
from src.hr import service as hr_service
from src.hr.models import Department, EmploymentRecord, EmploymentStatus
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterPeriodStatus
from src.hr.roster.schemas import RosterPeriodCreate
from tests.utils.utils import random_email, random_lower_string


async def _superuser(db_async: AsyncSession):
    return await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"dept_{random_lower_string()}",
            password="password123",
            first_name="Dept",
            last_name="Admin",
            is_superuser=True,
        ),
    )


async def _member(db_async: AsyncSession, first: str, last: str):
    return await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"m_{random_lower_string()}",
            password="password123",
            first_name=first,
            last_name=last,
        ),
    )


async def test_list_departments_ordered_by_name(db_async: AsyncSession) -> None:
    admin = await _superuser(db_async)
    for dept_id, name in (("dept_zz_test", "ZZ Test"), ("dept_aa_test", "AA Test")):
        if not await db_async.get(Department, dept_id):
            db_async.add(Department(id=dept_id, name=name))
    await db_async.commit()

    departments = await hr_service.list_departments(
        session=db_async, current_user=admin
    )
    names = [d.name for d in departments]
    assert names == sorted(names)
    assert {"AA Test", "ZZ Test"} <= set(names)


async def test_list_department_members_active_only_sorted(
    db_async: AsyncSession,
) -> None:
    admin = await _superuser(db_async)
    if not await db_async.get(Department, "dept_members"):
        db_async.add(Department(id="dept_members", name="Dept Members"))
    if not await db_async.get(Department, "dept_other"):
        db_async.add(Department(id="dept_other", name="Dept Other"))

    zeb = await _member(db_async, "Zeb", "Barry")
    ann = await _member(db_async, "Ann", "Charles")
    gone = await _member(db_async, "Terry", "Left")
    outsider = await _member(db_async, "Out", "Sider")
    db_async.add(
        EmploymentRecord(
            user_id=zeb.id,
            employee_number=f"E{random_lower_string()[:8]}",
            department_id="dept_members",
            position="Observer",
        )
    )
    db_async.add(
        EmploymentRecord(
            user_id=ann.id,
            employee_number=f"E{random_lower_string()[:8]}",
            department_id="dept_members",
        )
    )
    db_async.add(
        EmploymentRecord(
            user_id=gone.id,
            employee_number=f"E{random_lower_string()[:8]}",
            department_id="dept_members",
            status=EmploymentStatus.TERMINATED,
        )
    )
    db_async.add(
        EmploymentRecord(
            user_id=outsider.id,
            employee_number=f"E{random_lower_string()[:8]}",
            department_id="dept_other",
        )
    )
    await db_async.commit()

    members = await hr_service.list_department_members(
        session=db_async, current_user=admin, department_id="dept_members"
    )
    last_names = [user.last_name for _, user in members]
    assert last_names == ["Barry", "Charles"]
    employment, user = members[0]
    assert user.id == zeb.id
    assert employment.position == "Observer"


async def test_list_department_members_unknown_department(
    db_async: AsyncSession,
) -> None:
    admin = await _superuser(db_async)
    with pytest.raises(NotFoundError):
        await hr_service.list_department_members(
            session=db_async, current_user=admin, department_id="dept_nope"
        )


async def test_list_roster_periods_filters_by_department_and_status(
    db_async: AsyncSession,
) -> None:
    admin = await _superuser(db_async)
    for dept_id in ("dept_lp_a", "dept_lp_b"):
        if not await db_async.get(Department, dept_id):
            db_async.add(Department(id=dept_id, name=f"Dept {dept_id}"))
    await db_async.commit()

    july = await roster_service.create_roster_period(
        session=db_async,
        current_user=admin,
        period_in=RosterPeriodCreate(
            department_id="dept_lp_a",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    await roster_service.create_roster_period(
        session=db_async,
        current_user=admin,
        period_in=RosterPeriodCreate(
            department_id="dept_lp_a",
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
        ),
    )
    await roster_service.create_roster_period(
        session=db_async,
        current_user=admin,
        period_in=RosterPeriodCreate(
            department_id="dept_lp_b",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    await roster_service.publish_roster_period(
        session=db_async, current_user=admin, period_id=july.id
    )

    periods = await roster_service.list_roster_periods(
        session=db_async, current_user=admin, department_id="dept_lp_a"
    )
    assert len(periods) == 2
    assert [p.period_start for p in periods] == [date(2026, 8, 1), date(2026, 7, 1)]

    published = await roster_service.list_roster_periods(
        session=db_async,
        current_user=admin,
        department_id="dept_lp_a",
        period_status=RosterPeriodStatus.PUBLISHED,
    )
    assert [p.id for p in published] == [july.id]
