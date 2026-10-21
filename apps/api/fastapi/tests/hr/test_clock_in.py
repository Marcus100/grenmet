from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import AppException, AuthorizationError
from src.hr.attendance import clock_service
from src.hr.attendance.models import AttendanceRecord
from src.hr.models import Department
from src.hr.roster.models import ShiftCatalog, ShiftCategory
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
from tests.factories import make_employee, make_user
from tests.utils.utils import random_email, random_lower_string

DEPT = "dept_clock"
OTHER = "dept_clock_other"
SHIFT_DAY = datetime(2026, 7, 6).date()
# Grenada is UTC-4 with no daylight saving: shift CKM runs 05:30-14:00 local,
# which is 09:30-18:00 UTC.


def utc(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 6, hour, minute)


async def _user(db: AsyncSession) -> User:
    return await create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"clock_{random_lower_string()}",
            password="password123",
            first_name="Clock",
            last_name="Tester",
            is_superuser=True,
        ),
    )


async def _setup(db: AsyncSession) -> User:
    for dept in (DEPT, OTHER):
        if not await db.get(Department, dept):
            db.add(Department(organisation_id="gaa", code=dept, id=dept, name=dept))
    if not await db.get(ShiftCatalog, "CKM"):
        db.add(
            ShiftCatalog(
                code="CKM",
                label="Clock morning",
                category=ShiftCategory.WORK,
                start_time="05:30",
                end_time="14:00",
                ends_next_day=False,
            )
        )
    await db.commit()
    employee = await _user(db)
    await make_employee(db, user=employee, department_id=DEPT)
    period = await create_roster_period(
        session=db,
        current_user=employee,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=datetime(2026, 7, 1).date(),
            period_end=datetime(2026, 7, 31).date(),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=employee,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=employee.id, assignment_date=SHIFT_DAY, shift_code="CKM"
                )
            ],
        ),
    )
    await publish_roster_period(session=db, current_user=employee, period_id=period.id)
    return employee


async def _site_token(db: AsyncSession, employee: User) -> str:
    _, token = await clock_service.create_site(
        session=db,
        current_user=employee,
        department_id=DEPT,
        name="Main gate",
    )
    return token


async def test_arrive_then_depart_makes_two_pending_punches_and_no_attendance(
    db_async: AsyncSession,
) -> None:
    employee = await _setup(db_async)
    token = await _site_token(db_async, employee)

    action, punch, site, late, early, overtime, _ = await clock_service.clock(
        session=db_async, current_user=employee, token=token, now=utc(9, 40)
    )
    assert (action, late, early, overtime) == ("ARRIVED", 10, 0, 0)
    assert site.name == "Main gate"
    assert (punch.kind, punch.status) == ("ARRIVE", "PENDING")

    action, closing, _, late, early, overtime, arrived = await clock_service.clock(
        session=db_async, current_user=employee, token=token, now=utc(18, 30)
    )
    assert (action, late, early, overtime) == ("DEPARTED", 10, 0, 30)
    assert (closing.kind, closing.status) == ("DEPART", "PENDING")
    assert closing.roster_assignment_id == punch.roster_assignment_id
    assert arrived == utc(9, 40)
    # A pending phone punch is not attendance (ADR-0040).
    assert (await db_async.scalars(select(AttendanceRecord))).first() is None


async def test_early_departure_is_reported(db_async: AsyncSession) -> None:
    employee = await _setup(db_async)
    token = await _site_token(db_async, employee)
    await clock_service.clock(
        session=db_async, current_user=employee, token=token, now=utc(9, 30)
    )
    _, _, _, late, early, overtime, _ = await clock_service.clock(
        session=db_async, current_user=employee, token=token, now=utc(17, 0)
    )
    assert (late, early, overtime) == (0, 60, 0)


async def test_repeat_scan_within_a_minute_changes_nothing(
    db_async: AsyncSession,
) -> None:
    employee = await _setup(db_async)
    token = await _site_token(db_async, employee)
    _, first, *_ = await clock_service.clock(
        session=db_async, current_user=employee, token=token, now=utc(9, 30)
    )
    action, again, *_ = await clock_service.clock(
        session=db_async,
        current_user=employee,
        token=token,
        now=utc(9, 30).replace(second=30),
    )
    assert action == "ARRIVED"
    assert again.id == first.id


async def test_no_rostered_shift_is_refused_not_invented(
    db_async: AsyncSession,
) -> None:
    employee = await _setup(db_async)
    token = await _site_token(db_async, employee)
    with pytest.raises(AppException) as raised:
        await clock_service.clock(
            session=db_async, current_user=employee, token=token, now=utc(2, 0)
        )
    assert raised.value.status_code == 409


async def test_unknown_deactivated_and_rotated_tokens_are_rejected(
    db_async: AsyncSession,
) -> None:
    employee = await _setup(db_async)
    site, token = await clock_service.create_site(
        session=db_async, current_user=employee, department_id=DEPT, name="Gate"
    )
    with pytest.raises(AppException):
        await clock_service.clock(
            session=db_async,
            current_user=employee,
            token="not-a-real-token",
            now=utc(9, 30),
        )
    _, new_token = await clock_service.rotate_site(
        session=db_async, current_user=employee, site_id=site.id
    )
    with pytest.raises(AppException):
        await clock_service.clock(
            session=db_async, current_user=employee, token=token, now=utc(9, 30)
        )
    await clock_service.set_site_active(
        session=db_async, current_user=employee, site_id=site.id, active=False
    )
    with pytest.raises(AppException):
        await clock_service.clock(
            session=db_async, current_user=employee, token=new_token, now=utc(9, 30)
        )


async def test_site_belonging_to_another_department_is_refused(
    db_async: AsyncSession,
) -> None:
    employee = await _setup(db_async)
    _, token = await clock_service.create_site(
        session=db_async, current_user=employee, department_id=OTHER, name="Elsewhere"
    )
    with pytest.raises(AppException) as raised:
        await clock_service.clock(
            session=db_async, current_user=employee, token=token, now=utc(9, 30)
        )
    assert raised.value.status_code == 403


async def test_staff_without_roster_manage_cannot_create_sites(
    db_async: AsyncSession,
) -> None:
    await _setup(db_async)
    staff = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await clock_service.create_site(
            session=db_async, current_user=staff, department_id=DEPT, name="Nope"
        )
