"""#1431: former staff date of birth and address go 6 years after employment ends."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import placeholders, service
from src.auth.models import User
from src.hr import retention
from src.hr.constants import FORMER_STAFF_PERSONAL_DETAILS_RETENTION_YEARS
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


def test_retention_period_is_at_least_one_year() -> None:
    # 0 would clear everyone who has left at once.
    assert FORMER_STAFF_PERSONAL_DETAILS_RETENTION_YEARS >= 1


async def test_audit_history_loses_the_cleared_values(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "ret_dept7")
    user_id = str((await _former_employee(db_async, dept.id, LONG_AGO)).id)
    kept_id = (await _former_employee(db_async, dept.id, INSIDE)).id
    # An earlier edit by HR, so the history holds an old and a new value.
    profile = await db_async.scalar(
        select(UserProfile).where(UserProfile.user_id == kept_id)
    )
    assert profile is not None
    profile.date_of_birth = date(1991, 5, 6)
    db_async.add(
        AuditEntry(
            entity_type="employee",
            entity_id=user_id,
            record_type="user_address",
            record_id=str(uuid.uuid4()),
            action="update",
            changes=[
                {
                    "field": "line_1",
                    "old": "2 Old Road",
                    "new": STREET,
                    "sensitive": True,
                },
                {"field": "country", "old": None, "new": "Grenada", "sensitive": False},
            ],
        )
    )
    db_async.add(
        AuditEntry(
            entity_type="employee",
            entity_id=user_id,
            record_type="user_profile",
            record_id=str(uuid.uuid4()),
            action="update",
            changes=[
                {"field": "date_of_birth", "old": "1989-01-01", "new": DOB.isoformat()},
                {"field": "gender", "old": None, "new": "female", "sensitive": False},
            ],
        )
    )
    await db_async.commit()

    assert await retention.clear_expired_personal_details(db_async, today=TODAY) == 1

    db_async.expire_all()
    history = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "employee",
                AuditEntry.entity_id == user_id,
                AuditEntry.record_type.in_(["user_profile", "user_address"]),
            )
        )
    ).all()
    assert history
    # Check the scrubbed values themselves. A substring search over the whole dump
    # is not safe: the history also holds the random user ID, and a UUID can contain
    # a year such as "1989" by chance (flaky CI, issue #1912).
    changes = [change for entry in history for change in (entry.changes or [])]
    scrubbed = [
        change
        for change in changes
        if change.get("field") in {"date_of_birth", "line_1"}
    ]
    assert scrubbed
    for change in scrubbed:
        assert change["old"] is None
        assert change["new"] is None
        assert change["scrubbed"] is True
    values = {str(change.get(key)) for change in changes for key in ("old", "new")}
    for personal in (STREET, "2 Old Road", DOB.isoformat(), "1989-01-01"):
        assert personal not in values
    # Entries, field names and non-personal values stay.
    dump = str([entry.changes for entry in history])
    assert "Grenada" in dump
    assert "female" in dump
    assert "'field': 'line_1'" in dump

    # The person still inside the period keeps their history.
    kept_dump = str(
        (
            await db_async.scalars(
                select(AuditEntry.changes).where(
                    AuditEntry.entity_type == "employee",
                    AuditEntry.entity_id == str(kept_id),
                    AuditEntry.record_type == "user_profile",
                )
            )
        ).all()
    )
    assert "1991" in kept_dump or "1990" in kept_dump
