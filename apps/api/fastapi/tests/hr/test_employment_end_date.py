"""#797: the employment end date is recorded, validated and exposed.

Access and status effects of the date live in tests/auth/test_employment_end_date.py,
the daily job in tests/worker/test_employment_end_job.py.
"""

from datetime import date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope
from src.auth.policy import _active_assignments
from src.exceptions import AppException, AuthorizationError
from src.hr import service
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.hr.schemas import EmploymentUpdate
from src.hr.workflow.service import _named_actor_in_organisation
from src.utils import timezones
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


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


async def _department_hr_admin(db: AsyncSession, department_id: str):
    """An administrator with hr.employment.manage for one department only."""
    admin = await make_user(db)
    await make_employee(db, user=admin, department_id=department_id)
    role, _ = await make_role_with_permission(db, "hr.employment.manage")
    await assign_role(
        db,
        user=admin,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department_id,
    )
    return admin


async def _organisation_wide_hr_admin(db: AsyncSession, department_id: str):
    admin = await make_user(db)
    await make_employee(db, user=admin, department_id=department_id)
    role, _ = await make_role_with_permission(db, "hr.employment.manage")
    await assign_role(db, user=admin, role=role, scope=RoleAssignmentScope.ALL)
    return admin


async def _person_with_wide_role(db: AsyncSession, department_id: str):
    user = await make_user(db)
    record = await make_employee(db, user=user, department_id=department_id)
    role, _ = await make_role_with_permission(db, "cap.alert.approve")
    grant = await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.ALL)
    return user, record, grant


async def _set_end(db: AsyncSession, actor, user, end: date | None):
    return await service.update_employment_for_user(
        session=db,
        current_user=actor,
        target_user_id=user.id,
        employment_update=EmploymentUpdate.model_validate({"end_date": end}),
        approval_update=None,
    )


async def test_department_admin_cannot_set_end_date_on_someone_with_organisation_wide_roles(
    db_async: AsyncSession,
) -> None:
    """#794/#797: refused with 403 before anything changes."""
    department = await make_department(db_async, "end_date_wide1")
    admin = await _department_hr_admin(db_async, department.id)
    user, record, grant = await _person_with_wide_role(db_async, department.id)

    with pytest.raises(AuthorizationError) as raised:
        await _set_end(db_async, admin, user, FUTURE)

    assert raised.value.status_code == 403
    assert "end date" in raised.value.message
    await db_async.refresh(record)
    await db_async.refresh(grant)
    assert record.end_date is None
    assert record.status == EmploymentStatus.ACTIVE
    assert grant.effective_to is None
    assert grant.id in {
        a.id for a in await _active_assignments(session=db_async, user_id=user.id)
    }


async def test_organisation_wide_admin_may_set_end_date_on_someone_with_wide_roles(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_wide2")
    admin = await _organisation_wide_hr_admin(db_async, department.id)
    user, record, _ = await _person_with_wide_role(db_async, department.id)

    await _set_end(db_async, admin, user, FUTURE)

    await db_async.refresh(record)
    assert record.end_date == FUTURE


async def test_department_admin_may_set_end_date_on_someone_without_wide_roles(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_wide3")
    admin = await _department_hr_admin(db_async, department.id)
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)

    await _set_end(db_async, admin, user, FUTURE)

    await db_async.refresh(record)
    assert record.end_date == FUTURE


async def test_department_admin_cannot_clear_an_end_date_on_someone_with_wide_roles(
    db_async: AsyncSession,
) -> None:
    """Clearing an end date brings the ending back, so it needs organisation-wide authority."""
    department = await make_department(db_async, "end_date_wide4")
    admin = await _department_hr_admin(db_async, department.id)
    user, record, grant = await _person_with_wide_role(db_async, department.id)
    record.end_date = FUTURE
    await db_async.commit()

    with pytest.raises(AuthorizationError) as raised:
        await _set_end(db_async, admin, user, None)

    assert raised.value.status_code == 403
    await db_async.refresh(record)
    await db_async.refresh(grant)
    assert record.end_date == FUTURE
    assert grant.effective_to is None


async def test_department_admin_may_clear_an_end_date_without_wide_roles(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_date_wide5")
    admin = await _department_hr_admin(db_async, department.id)
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    record.end_date = FUTURE
    await db_async.commit()

    await _set_end(db_async, admin, user, None)

    await db_async.refresh(record)
    assert record.end_date is None


async def test_reinstating_on_the_last_day_is_allowed_and_before_it_is_refused(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The last day is still worked, so a record ending today may be reinstated."""
    monkeypatch.setattr(timezones, "utc_now", lambda: datetime(2026, 10, 30, 14, 0))
    department = await make_department(db_async, "end_date_reinstate4")
    superuser = await make_user(db_async, superuser=True)
    user, record = await _terminated_with_end_date(
        db_async, department.id, date(2026, 10, 29)
    )
    with pytest.raises(AppException):
        await service.update_employment_for_user(
            session=db_async,
            current_user=superuser,
            target_user_id=user.id,
            employment_update=EmploymentUpdate(status=EmploymentStatus.ACTIVE),
            approval_update=None,
        )
    await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(
            status=EmploymentStatus.ACTIVE, end_date=date(2026, 10, 30)
        ),
        approval_update=None,
    )
    await db_async.refresh(record)
    assert record.status == EmploymentStatus.ACTIVE


async def test_named_approver_is_not_live_once_the_last_day_has_passed(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """#797: a named approver whose last day has passed cannot act before the job runs."""
    monkeypatch.setattr(timezones, "utc_now", lambda: datetime(2026, 10, 30, 14, 0))
    department = await make_department(db_async, "end_date_approver")

    async def approver_with_end(end: date | None) -> object:
        user = await make_user(db_async)
        await make_employee(db_async, user=user, department_id=department.id)
        record = await db_async.scalar(
            select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
        )
        assert record is not None
        record.end_date = end
        await db_async.commit()
        return user

    yesterday = await approver_with_end(date(2026, 10, 29))
    last_day = await approver_with_end(date(2026, 10, 30))
    open_ended = await approver_with_end(None)

    assert not await _named_actor_in_organisation(db_async, yesterday.id, "gaa")
    assert await _named_actor_in_organisation(db_async, last_day.id, "gaa")
    assert await _named_actor_in_organisation(db_async, open_ended.id, "gaa")
