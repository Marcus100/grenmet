"""Timesheet service tests — policy enforcement and state transitions."""

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.audit.models import AuditEntry
from src.exceptions import AuthorizationError, NotFoundError
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.models import EmploymentStatus
from src.hr.timesheet.models import (
    SubmissionMode,
    Timesheet,
    TimesheetEntry,
    TimesheetStatus,
)
from src.hr.timesheet.schemas import TimesheetCreate
from src.hr.timesheet.service import (
    _get_or_create_policy,
    approve_timesheet,
    create_timesheet,
    delete_draft_timesheet,
    submit_timesheet,
)
from src.utils.timezones import local_today
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_supervised_pair,
    make_user,
)


async def _make_timesheet(db_async: AsyncSession, user, department_id: str):
    """Helper to create a timesheet for testing."""
    timesheet, _ = await create_timesheet(
        session=db_async,
        current_user=user,
        payload=TimesheetCreate(
            user_id=user.id,
            department_id=department_id,
            period_start="2026-06-01",
            period_end="2026-06-15",
            entries=[],
        ),
    )
    return timesheet


async def test_self_submit_disabled_raises(db_async: AsyncSession) -> None:
    """submit_timesheet raises HRPermissionDeniedError when self-submit is disabled."""
    dept = await make_department(db_async, "dept_ts_self_disabled")
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=dept.id)

    role, _ = await make_role_with_permission(
        db_async, "timesheet.submit.self", "timesheet.submit.proxy"
    )
    await assign_role(db_async, user=user, role=role)

    # Create the draft while self-submit is still allowed (default policy),
    # then disable self-submit before attempting to submit.
    timesheet = await _make_timesheet(db_async, user, dept.id)

    policy = await _get_or_create_policy(session=db_async, department_id=dept.id)
    policy.allow_employee_self_submit = False
    db_async.add(policy)
    await db_async.commit()

    with pytest.raises(HRPermissionDeniedError):
        await submit_timesheet(
            session=db_async,
            current_user=user,
            timesheet_id=timesheet.id,
            submission_mode=SubmissionMode.SELF,
        )


async def test_proxy_submit_disabled_raises(db_async: AsyncSession) -> None:
    """submit_timesheet raises HRPermissionDeniedError when proxy-submit is disabled."""
    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "timesheet.approve", "timesheet.submit.proxy"
    )

    # Create the draft via proxy while proxy-submit is still allowed (default
    # policy), then disable proxy-submit before attempting to submit.
    timesheet, _ = await create_timesheet(
        session=db_async,
        current_user=supervisor,
        payload=TimesheetCreate(
            user_id=employee.id,
            department_id=dept.id,
            period_start="2026-06-01",
            period_end="2026-06-15",
            entries=[],
        ),
    )

    policy = await _get_or_create_policy(session=db_async, department_id=dept.id)
    policy.allow_supervisor_proxy_submit = False
    db_async.add(policy)
    await db_async.commit()

    with pytest.raises(HRPermissionDeniedError):
        await submit_timesheet(
            session=db_async,
            current_user=supervisor,
            timesheet_id=timesheet.id,
            submission_mode=SubmissionMode.PROXY,
        )


async def test_submit_timesheet_already_submitted_raises(
    db_async: AsyncSession,
) -> None:
    """submit_timesheet raises HRValidationError when timesheet is not in DRAFT status."""
    dept = await make_department(db_async, "dept_ts_double_submit")
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=dept.id)

    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=user, role=role)

    timesheet = await _make_timesheet(db_async, user, dept.id)
    await submit_timesheet(
        session=db_async,
        current_user=user,
        timesheet_id=timesheet.id,
        submission_mode=SubmissionMode.SELF,
    )

    with pytest.raises(HRValidationError):
        await submit_timesheet(
            session=db_async,
            current_user=user,
            timesheet_id=timesheet.id,
            submission_mode=SubmissionMode.SELF,
        )


async def test_approve_timesheet_requires_permission(db_async: AsyncSession) -> None:
    """approve_timesheet raises AuthorizationError for a user without the approve permission."""
    dept = await make_department(db_async, "dept_ts_approve_perm")
    user = await make_user(db_async)
    approver = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=dept.id)

    submit_role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=user, role=submit_role)

    timesheet = await _make_timesheet(db_async, user, dept.id)
    await submit_timesheet(
        session=db_async,
        current_user=user,
        timesheet_id=timesheet.id,
        submission_mode=SubmissionMode.SELF,
    )

    with pytest.raises(AuthorizationError):
        await approve_timesheet(
            session=db_async,
            current_user=approver,
            timesheet_id=timesheet.id,
        )


async def test_approve_timesheet_succeeds(db_async: AsyncSession) -> None:
    """Supervisor with correct permission and scope can approve a timesheet."""
    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "timesheet.approve", "timesheet.submit.self"
    )

    submit_role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=employee, role=submit_role)

    timesheet = await _make_timesheet(db_async, employee, dept.id)
    await submit_timesheet(
        session=db_async,
        current_user=employee,
        timesheet_id=timesheet.id,
        submission_mode=SubmissionMode.SELF,
    )

    approved = await approve_timesheet(
        session=db_async,
        current_user=supervisor,
        timesheet_id=timesheet.id,
    )
    assert approved.status == TimesheetStatus.APPROVED
    assert approved.approved_by_user_id == supervisor.id


async def _draft_owner(db_async: AsyncSession, dept_id: str, *, entries: int = 0):
    dept = await make_department(db_async, dept_id)
    user = await make_user(db_async)
    employment = await make_employee(db_async, user=user, department_id=dept.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=user, role=role)
    timesheet = await _make_timesheet(db_async, user, dept.id)
    for day in range(entries):
        db_async.add(
            TimesheetEntry(timesheet_id=timesheet.id, entry_date=date(2026, 6, 1 + day))
        )
    await db_async.commit()
    return user, employment, timesheet.id


async def test_owner_deletes_an_unsubmitted_draft(db_async: AsyncSession) -> None:
    user, _, timesheet_id = await _draft_owner(db_async, "dept_ts_del_ok")
    await delete_draft_timesheet(
        session=db_async, current_user=user, timesheet_id=timesheet_id
    )
    assert await db_async.get(Timesheet, timesheet_id) is None


async def test_draft_delete_needs_the_self_submit_permission(
    db_async: AsyncSession,
) -> None:
    _, _, timesheet_id = await _draft_owner(db_async, "dept_ts_del_perm")
    bare = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await delete_draft_timesheet(
            session=db_async, current_user=bare, timesheet_id=timesheet_id
        )
    assert await db_async.get(Timesheet, timesheet_id) is not None


async def test_draft_delete_hides_missing_and_other_peoples_timesheets(
    db_async: AsyncSession,
) -> None:
    _, _, timesheet_id = await _draft_owner(db_async, "dept_ts_del_other")
    other = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=other, role=role)
    for target in (timesheet_id, uuid.uuid4()):
        with pytest.raises(NotFoundError):
            await delete_draft_timesheet(
                session=db_async, current_user=other, timesheet_id=target
            )
    assert await db_async.get(Timesheet, timesheet_id) is not None


@pytest.mark.parametrize("ended", ["status", "end_date"])
async def test_draft_delete_refused_after_employment_ended(
    db_async: AsyncSession, ended: str
) -> None:
    user, employment, timesheet_id = await _draft_owner(
        db_async, f"dept_ts_del_end_{ended}"
    )
    if ended == "status":
        employment.status = EmploymentStatus.TERMINATED
    else:
        employment.end_date = local_today() - timedelta(days=1)
    await db_async.commit()
    with pytest.raises(HRPermissionDeniedError):
        await delete_draft_timesheet(
            session=db_async, current_user=user, timesheet_id=timesheet_id
        )
    assert await db_async.get(Timesheet, timesheet_id) is not None


async def test_draft_delete_refuses_a_submitted_timesheet(
    db_async: AsyncSession,
) -> None:
    user, _, timesheet_id = await _draft_owner(db_async, "dept_ts_del_sub")
    await submit_timesheet(
        session=db_async,
        current_user=user,
        timesheet_id=timesheet_id,
        submission_mode=SubmissionMode.SELF,
    )
    with pytest.raises(HRValidationError):
        await delete_draft_timesheet(
            session=db_async, current_user=user, timesheet_id=timesheet_id
        )
    assert await db_async.get(Timesheet, timesheet_id) is not None


async def test_draft_delete_is_audited_entry_by_entry(db_async: AsyncSession) -> None:
    user, _, timesheet_id = await _draft_owner(db_async, "dept_ts_del_audit", entries=2)
    await delete_draft_timesheet(
        session=db_async, current_user=user, timesheet_id=timesheet_id
    )
    rows = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "timesheet",
                AuditEntry.entity_id == str(timesheet_id),
                AuditEntry.action == "delete",
            )
        )
    ).all()
    assert sorted(r.record_type for r in rows) == [
        "timesheet",
        "timesheet_entry",
        "timesheet_entry",
    ]
    assert {r.actor_user_id for r in rows} == {user.id}

    # Only a superuser can still read the trail: the record's own access check
    # needs the (now deleted) timesheet.
    admin = await make_user(db_async, superuser=True)
    history = await audit_service.list_history(
        session=db_async,
        actor=admin,
        entity_type="timesheet",
        entity_id=str(timesheet_id),
    )
    assert history.count >= 3
    with pytest.raises(AuthorizationError):
        await audit_service.list_history(
            session=db_async,
            actor=user,
            entity_type="timesheet",
            entity_id=str(timesheet_id),
        )
