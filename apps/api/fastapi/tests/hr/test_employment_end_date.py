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
from src.hr.models import EmploymentRecord
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
