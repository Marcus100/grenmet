"""#1431: former staff date of birth and address go 6 years after employment ends."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import placeholders, service
from src.auth.models import User
from src.hr import retention
from src.hr.models import EmploymentRecord, Gender, UserAddress, UserProfile
from src.worker import main
from tests.factories import make_department, make_employee, make_user

TODAY = date(2026, 11, 14)
LONG_AGO = date(2020, 11, 13)  # more than 6 years before TODAY
INSIDE = date(2020, 11, 14)  # exactly 6 years: still inside the period
DOB = date(1990, 4, 12)
STREET = "1 Church Street"


async def _former_employee(
    db: AsyncSession,
    dept_id: str,
    end: date | None,
    *,
    anonymised: bool = True,
) -> User:
    user = await make_user(db)
    record = await make_employee(db, user=user, department_id=dept_id)
    record.end_date = end
    db.add(UserProfile(user_id=user.id, date_of_birth=DOB, gender=Gender.FEMALE))
    db.add(UserAddress(user_id=user.id, line_1=STREET, city="St. George's"))
    await db.commit()
    if anonymised:
        await service.delete_user(session=db, user=user)
    return user


async def _state(db: AsyncSession, user_id: uuid.UUID) -> tuple[date | None, bool]:
    db.expire_all()
    dob = await db.scalar(
        select(UserProfile.date_of_birth).where(UserProfile.user_id == user_id)
    )
    address = await db.scalar(
        select(UserAddress.id).where(UserAddress.user_id == user_id)
    )
    return dob, address is not None


def test_job_is_registered_and_scheduled_daily() -> None:
    assert main.clear_former_staff_personal_details in main.WorkerSettings.functions
    jobs = [
        job
        for job in main.WorkerSettings.cron_jobs
        if job.coroutine is main.clear_former_staff_personal_details
    ]
    assert len(jobs) == 1
    assert jobs[0].hour == 3
    assert jobs[0].minute == 50


def test_cutoff_is_six_years_and_clamps_leap_day() -> None:
    assert retention.retention_cutoff(date(2026, 11, 14)) == date(2020, 11, 14)
    assert retention.retention_cutoff(date(2028, 2, 29)) == date(2022, 2, 28)


async def test_past_the_period_is_cleared_and_inside_is_kept(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "ret_dept1")
    old = await _former_employee(db_async, dept.id, LONG_AGO)
    inside = await _former_employee(db_async, dept.id, INSIDE)
    old_id, inside_id = old.id, inside.id

    cleared = await retention.clear_expired_personal_details(db_async, today=TODAY)

    assert cleared == 1
    assert await _state(db_async, old_id) == (None, False)
    assert await _state(db_async, inside_id) == (DOB, True)
    # Employment records are never changed.
    ends = (await db_async.scalars(select(EmploymentRecord.end_date))).all()
    assert LONG_AGO in ends
    assert INSIDE in ends


async def test_a_non_anonymised_former_employee_is_untouched(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "ret_dept2")
    user = await _former_employee(db_async, dept.id, LONG_AGO, anonymised=False)
    user_id = user.id

    assert await retention.clear_expired_personal_details(db_async, today=TODAY) == 0
    assert await _state(db_async, user_id) == (DOB, True)


async def test_placeholder_email_alone_is_not_enough(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "ret_dept3")
    user = await _former_employee(db_async, dept.id, LONG_AGO, anonymised=False)
    user.email = placeholders.placeholder_email(placeholders.new_placeholder_token())
    await db_async.commit()
    user_id = user.id

    assert await retention.clear_expired_personal_details(db_async, today=TODAY) == 0
    assert await _state(db_async, user_id) == (DOB, True)


async def test_a_record_without_an_end_date_blocks(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "ret_dept4")
    user = await _former_employee(db_async, dept.id, None)
    user_id = user.id

    assert await retention.clear_expired_personal_details(db_async, today=TODAY) == 0
    assert await _state(db_async, user_id) == (DOB, True)


async def test_second_run_changes_nothing_and_audit_has_no_personal_value(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "ret_dept6")
    user = await _former_employee(db_async, dept.id, LONG_AGO)
    user_id = str(user.id)

    assert await retention.clear_expired_personal_details(db_async, today=TODAY) == 1
    assert await retention.clear_expired_personal_details(db_async, today=TODAY) == 0

    rows = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "hr_retention_cleanup",
                AuditEntry.entity_id == user_id,
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].action == "cleared"
    dump = str(rows[0].changes)
    assert STREET not in dump
    assert "1990" not in dump
