"""Timesheet service tests — policy enforcement and state transitions."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.timesheet.models import DepartmentPolicy, SubmissionMode, TimesheetStatus
from src.hr.timesheet.schemas import TimesheetCreate
from src.hr.timesheet.service import (
    approve_timesheet,
    create_timesheet,
    submit_timesheet,
)
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

    policy = DepartmentPolicy(
        department_id=dept.id,
        allow_employee_self_submit=False,
        allow_supervisor_proxy_submit=True,
    )
    db_async.add(policy)
    await db_async.commit()

    timesheet = await _make_timesheet(db_async, user, dept.id)

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

    policy = DepartmentPolicy(
        department_id=dept.id,
        allow_employee_self_submit=True,
        allow_supervisor_proxy_submit=False,
    )
    db_async.add(policy)
    await db_async.commit()

    timesheet = await _make_timesheet(db_async, employee, dept.id)

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
