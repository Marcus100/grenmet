"""#797: the daily job ends employment whose last day has passed, once.

It goes through the same status helper as the HR route and offboarding, so the
role ending and its audit entries are identical whichever path ends a record.
"""

from datetime import date, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics
from src.audit.models import AuditEntry
from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.auth.policy import STAFF_ROLE
from src.hr import employment_status
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.utils import timezones
from src.worker import main
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)

TODAY = date(2026, 10, 30)
# The last day was yesterday: roles end at midnight, so the record is due today.
ENDED_ON = date(2026, 10, 29)


def test_job_is_scheduled_at_ten_past_four_utc() -> None:
    """04:10 UTC is 00:10 in Grenada (UTC-4, no daylight saving)."""
    assert main.end_due_employment_records in main.WorkerSettings.functions
    scheduled = [
        job
        for job in main.WorkerSettings.cron_jobs
        if job.coroutine is main.end_due_employment_records
    ]
    assert len(scheduled) == 1
    assert scheduled[0].hour == 4
    assert scheduled[0].minute == 10


async def _ended_candidate(
    db: AsyncSession, dept_id: str, end: date | None
) -> tuple[User, EmploymentRecord, UserRoleAssignment]:
    user = await make_user(db)
    record = await make_employee(db, user=user, department_id=dept_id)
    record.end_date = end
    await db.commit()
    await db.refresh(record)
    role, _ = await make_role_with_permission(db, "cap.alert.approve")
    grant = await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.ALL)
    return user, record, grant


async def test_last_day_reached_terminates_and_ends_roles_with_audit(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_job_dept1")
    user, record, grant = await _ended_candidate(db_async, department.id, ENDED_ON)

    ended = await employment_status.end_due_employments(db_async, today=TODAY)

    assert ended == 1
    await db_async.refresh(record)
    assert record.status == EmploymentStatus.TERMINATED
    await db_async.refresh(grant)
    assert grant.effective_to is not None
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "role_assignment",
                AuditEntry.record_id == str(grant.id),
                AuditEntry.action == "UPDATE",
            )
        )
    ).all()
    assert entries
    live = (
        await db_async.scalars(
            select(UserRoleAssignment.id).where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.effective_to.is_(None),
            )
        )
    ).all()
    assert grant.id not in live


async def test_baseline_staff_role_survives_the_job(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_job_dept2")
    user, _, _ = await _ended_candidate(db_async, department.id, ENDED_ON)
    staff = await db_async.scalar(select(Role).where(Role.name == STAFF_ROLE))
    if staff is None:
        staff, _ = await make_role_with_permission(
            db_async, "leave.request.create", role_name=STAFF_ROLE
        )
    own = await assign_role(db_async, user=user, role=staff)

    await employment_status.end_due_employments(db_async, today=TODAY)

    await db_async.refresh(own)
    assert own.effective_to is None


async def test_records_not_yet_at_their_last_day_are_left_alone(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_job_dept3")
    _, tomorrow, tomorrow_grant = await _ended_candidate(
        db_async, department.id, date(2026, 10, 31)
    )
    _, open_ended, open_grant = await _ended_candidate(db_async, department.id, None)
    _, last_day, last_day_grant = await _ended_candidate(db_async, department.id, TODAY)

    ended = await employment_status.end_due_employments(db_async, today=TODAY)

    assert ended == 0
    await db_async.refresh(tomorrow)
    await db_async.refresh(open_ended)
    await db_async.refresh(tomorrow_grant)
    await db_async.refresh(open_grant)
    await db_async.refresh(last_day)
    await db_async.refresh(last_day_grant)
    assert tomorrow.status == EmploymentStatus.ACTIVE
    assert open_ended.status == EmploymentStatus.ACTIVE
    # The last day itself is still worked: nothing ends until it has passed.
    assert last_day.status == EmploymentStatus.ACTIVE
    assert last_day_grant.effective_to is None
    assert tomorrow_grant.effective_to is None
    assert open_grant.effective_to is None


async def test_running_twice_changes_nothing_the_second_time(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_job_dept4")
    _, record, _ = await _ended_candidate(db_async, department.id, ENDED_ON)

    first = await employment_status.end_due_employments(db_async, today=TODAY)
    audit_after_first = len((await db_async.scalars(select(AuditEntry))).all())
    second = await employment_status.end_due_employments(db_async, today=TODAY)
    audit_after_second = len((await db_async.scalars(select(AuditEntry))).all())

    assert (first, second) == (1, 0)
    assert audit_after_second == audit_after_first
    await db_async.refresh(record)
    assert record.status == EmploymentStatus.TERMINATED


async def test_setting_the_same_status_ends_nothing(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "end_job_dept5")
    _, record, grant = await _ended_candidate(db_async, department.id, None)
    record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    await db_async.refresh(record)

    changed = await employment_status.set_employment_status(
        session=db_async,
        employment=record,
        status=EmploymentStatus.TERMINATED,
        organisation_wide=True,
    )
    await db_async.commit()

    assert changed is False
    await db_async.refresh(grant)
    assert grant.effective_to is None


async def test_job_entry_point_uses_the_grenada_date_and_records_the_run(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """At 02:00 UTC on 30 October it is still 29 October in Grenada."""
    monkeypatch.setattr(timezones, "utc_now", lambda: datetime(2026, 10, 30, 2, 0))
    department = await make_department(db_async, "end_job_dept6")
    # Grenada's today is 29 October: a 28 October end ended at midnight, a 29
    # October end is the last day and is still worked.
    _, ended_before_today, _ = await _ended_candidate(
        db_async, department.id, date(2026, 10, 28)
    )
    _, last_day, _ = await _ended_candidate(db_async, department.id, date(2026, 10, 29))
    recorded: list[tuple[str, bool]] = []

    async def record(_: object, name: str, __: str, success: bool) -> None:
        recorded.append((name, success))

    monkeypatch.setattr(operational_metrics, "record_job", record)

    result = await main.end_due_employment_records({"job_id": "test-run"})

    assert result == 1
    assert recorded == [("end_due_employment_records", True)]
    await db_async.refresh(ended_before_today)
    await db_async.refresh(last_day)
    assert ended_before_today.status == EmploymentStatus.TERMINATED
    assert last_day.status == EmploymentStatus.ACTIVE


async def test_one_failing_record_does_not_roll_back_the_others(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each record has its own savepoint; the run still reports the failure."""
    department = await make_department(db_async, "end_job_dept7")
    failing_user, failing, _ = await _ended_candidate(db_async, department.id, ENDED_ON)
    _, healthy, _ = await _ended_candidate(db_async, department.id, ENDED_ON)
    real = employment_status.end_assignments_for_employment

    async def fail_for_one_user(**kwargs: Any) -> int:
        if kwargs["user_id"] == failing_user.id:
            raise RuntimeError("simulated failure for one record")
        return await real(**kwargs)

    monkeypatch.setattr(
        employment_status, "end_assignments_for_employment", fail_for_one_user
    )

    with pytest.raises(RuntimeError, match="1 employment record"):
        await employment_status.end_due_employments(db_async, today=TODAY)

    await db_async.refresh(failing)
    await db_async.refresh(healthy)
    assert failing.status == EmploymentStatus.ACTIVE
    assert healthy.status == EmploymentStatus.TERMINATED


async def test_ending_writes_an_audit_entry_for_the_status_change(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "end_job_dept8")
    _, record, _ = await _ended_candidate(db_async, department.id, ENDED_ON)

    await employment_status.end_due_employments(db_async, today=TODAY)

    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "employment_record",
                AuditEntry.record_id == str(record.id),
            )
        )
    ).all()
    assert entries, "the TERMINATED change itself must be audited"
    assert any("TERMINATED" in str(entry.changes) for entry in entries)
