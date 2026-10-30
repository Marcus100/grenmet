"""#797: the employment end date is recorded, validated and exposed.

Access and status effects of the date live in tests/auth/test_employment_end_date.py,
the daily job in tests/worker/test_employment_end_job.py.
"""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.hr import service
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.hr.schemas import EmploymentUpdate
from tests.factories import make_department, make_employee, make_user


async def _record_with_start(db: AsyncSession, dept_id: str, start: date | None):
    user = await make_user(db)
    record = await make_employee(db, user=user, department_id=dept_id)
    record.start_date = start
    await db.commit()
    await db.refresh(record)
    return user, record


async def test_end_date_before_start_date_is_rejected_and_changes_nothing(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_dept1")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _record_with_start(db_async, department.id, date(2026, 1, 10))

    with pytest.raises(AppException) as raised:
        await service.update_employment_for_user(
            session=db_async,
            current_user=superuser,
            target_user_id=user.id,
            employment_update=EmploymentUpdate(end_date=date(2026, 1, 9)),
            approval_update=None,
        )

    assert raised.value.status_code == 400
    await db_async.refresh(record)
    assert record.end_date is None


async def test_end_date_on_start_date_is_allowed_and_returned(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_dept2")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _record_with_start(db_async, department.id, date(2026, 1, 10))

    profile = await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(end_date=date(2026, 1, 10)),
        approval_update=None,
    )

    await db_async.refresh(record)
    assert record.end_date == date(2026, 1, 10)
    assert profile.employment.end_date == date(2026, 1, 10)


async def test_end_date_can_be_set_without_a_start_date(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_date_dept3")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _record_with_start(db_async, department.id, None)

    await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(end_date=date(2027, 3, 1)),
        approval_update=None,
    )

    await db_async.refresh(record)
    assert record.end_date == date(2027, 3, 1)


async def test_end_date_can_be_cleared(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_date_dept4")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _record_with_start(db_async, department.id, None)
    record.end_date = date(2027, 3, 1)
    await db_async.commit()

    profile = await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate.model_validate({"end_date": None}),
        approval_update=None,
    )

    await db_async.refresh(record)
    assert record.end_date is None
    assert profile.employment.end_date is None


async def test_database_refuses_end_date_before_start_date(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_dept5")
    _, record = await _record_with_start(db_async, department.id, date(2026, 5, 2))
    record_id = record.id
    record.end_date = date(2026, 5, 1)

    with pytest.raises(IntegrityError):
        await db_async.commit()
    await db_async.rollback()
    persisted = await db_async.get(EmploymentRecord, record_id)
    assert persisted is not None
    assert persisted.end_date is None


PAST = date(2000, 1, 1)
FUTURE = date(2999, 1, 1)


async def _terminated_with_end_date(db: AsyncSession, dept_id: str, end: date):
    user = await make_user(db)
    record = await make_employee(db, user=user, department_id=dept_id)
    record.status = EmploymentStatus.TERMINATED
    record.end_date = end
    await db.commit()
    return user, record


async def test_reinstating_with_a_passed_end_date_is_refused(
    db_async: AsyncSession,
) -> None:
    """Reinstating must not leave a record that the next day's job ends again."""
    department = await make_department(db_async, "end_date_reinstate1")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _terminated_with_end_date(db_async, department.id, PAST)

    with pytest.raises(AppException) as raised:
        await service.update_employment_for_user(
            session=db_async,
            current_user=superuser,
            target_user_id=user.id,
            employment_update=EmploymentUpdate(status=EmploymentStatus.ACTIVE),
            approval_update=None,
        )

    assert raised.value.status_code == 400
    await db_async.refresh(record)
    assert record.status == EmploymentStatus.TERMINATED


async def test_reinstating_with_the_end_date_cleared_in_the_same_edit(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_reinstate2")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _terminated_with_end_date(db_async, department.id, PAST)

    await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(
            status=EmploymentStatus.ACTIVE, end_date=None
        ),
        approval_update=None,
    )

    await db_async.refresh(record)
    assert record.status == EmploymentStatus.ACTIVE
    assert record.end_date is None


async def test_reinstating_with_a_future_end_date_is_allowed(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_reinstate3")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _terminated_with_end_date(db_async, department.id, FUTURE)

    await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(status=EmploymentStatus.ACTIVE),
        approval_update=None,
    )

    await db_async.refresh(record)
    assert record.status == EmploymentStatus.ACTIVE
    assert record.end_date == FUTURE


async def test_admin_employment_read_carries_the_end_date(
    db_async: AsyncSession,
) -> None:
    """GET /hr/employment/{user_id} (the admin editor's read) exposes end_date."""
    from src.hr.schemas import EmploymentRecordPublic

    department = await make_department(db_async, "end_date_read1")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    record.end_date = date(2027, 3, 1)
    await db_async.commit()
    await db_async.refresh(record)

    read = EmploymentRecordPublic.model_validate(record, from_attributes=True)

    assert read.end_date == date(2027, 3, 1)
