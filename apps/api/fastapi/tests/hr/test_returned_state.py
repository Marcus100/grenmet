"""Returned state: an approver sends a form back with a reason; the author edits
and resubmits; the approval chain restarts. Rejected stays final."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope
from src.hr.exceptions import HRValidationError
from src.hr.leave.schemas import (
    LeaveRequestAction,
    LeaveRequestPublic,
    LeaveRequestSubmit,
)
from src.hr.leave.service import (
    action_leave_request,
    create_leave_request,
    delete_leave_request,
    submit_leave_request,
    update_leave_request,
)
from src.hr.models import RequestStatus
from src.hr.submission import submission_public
from src.hr.timesheet.models import SubmissionMode, TimesheetStatus
from src.hr.timesheet.service import submit_timesheet
from src.hr.workflow.models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowStatus,
    WorkflowType,
)
from src.hr.workflow.schemas import (
    WorkflowActionRequest,
    WorkflowStepTemplateCreate,
    WorkflowTemplateCreate,
)
from src.hr.workflow.service import (
    apply_workflow_action,
    create_workflow_step_template,
    create_workflow_template,
    read_workflow_instance_details,
)
from tests.factories import (
    assign_role,
    make_department,
    make_ready_staff,
    make_role_with_permission,
    make_user,
)
from tests.hr.test_timesheet_service import _make_timesheet
from tests.hr.test_workflow import (
    _approve,
    _leave_payload,
    _make_requester,
    _setup_coapproval,
)


async def _return(db: AsyncSession, actor, instance_id, comments: str | None):
    return await apply_workflow_action(
        session=db,
        current_user=actor,
        workflow_instance_id=instance_id,
        action_in=WorkflowActionRequest(
            action=WorkflowAction.RETURN, comments=comments
        ),
    )


async def _submitted_leave(db: AsyncSession, department_id: str):
    sup_role = await _setup_coapproval(db, department_id)
    requester = await _make_requester(db)
    await make_ready_staff(db, requester, department_id)
    supervisor = await make_user(db)
    await assign_role(db, user=supervisor, role=sup_role, scope=RoleAssignmentScope.ALL)
    leave = await create_leave_request(
        session=db, current_user=requester, payload=_leave_payload(department_id)
    )
    assert leave.status == RequestStatus.SUBMITTED
    return requester, supervisor, leave


@pytest.mark.parametrize("reason", [None, "", "   "])
async def test_return_requires_a_reason(db_async: AsyncSession, reason) -> None:
    dept = await make_department(db_async, "dept_return_reason")
    _, supervisor, leave = await _submitted_leave(db_async, dept.id)
    instance_id = leave.workflow_instance_id
    with pytest.raises(HRValidationError, match="reason"):
        await _return(db_async, supervisor, instance_id, reason)
    await db_async.rollback()
    instance, _ = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=instance_id
    )
    assert instance.status == WorkflowStatus.PENDING
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.SUBMITTED


async def test_returned_form_is_edited_and_resubmitted_with_a_fresh_chain(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "dept_return_journey")
    requester, supervisor, leave = await _submitted_leave(db_async, dept.id)
    first_instance_id = leave.workflow_instance_id

    await _return(db_async, supervisor, first_instance_id, "Dates clash with roster")
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.RETURNED
    instance, _ = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=first_instance_id
    )
    assert instance.status == WorkflowStatus.RETURNED
    logged = (
        await db_async.scalars(
            select(ApprovalActionLog).where(
                ApprovalActionLog.workflow_instance_id == first_instance_id,
                ApprovalActionLog.action == WorkflowAction.RETURN,
            )
        )
    ).all()
    assert [row.comments for row in logged] == ["Dates clash with roster"]
    assert logged[0].actor_user_id == supervisor.id

    public = await submission_public(db_async, leave, LeaveRequestPublic)
    assert public.status == RequestStatus.RETURNED
    assert public.returned_reason == "Dates clash with roster"

    edited = _leave_payload(dept.id)
    edited.end_date = edited.start_date
    await update_leave_request(
        session=db_async,
        current_user=requester,
        leave_request_id=leave.id,
        payload=edited,
    )
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.RETURNED

    resubmitted = await submit_leave_request(
        session=db_async,
        current_user=requester,
        leave_request_id=leave.id,
        payload=LeaveRequestSubmit(),
    )
    assert resubmitted.status == RequestStatus.SUBMITTED
    again = await submission_public(db_async, resubmitted, LeaveRequestPublic)
    assert again.returned_reason is None
    assert resubmitted.workflow_instance_id != first_instance_id
    fresh, steps = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=resubmitted.workflow_instance_id
    )
    assert fresh.status == WorkflowStatus.PENDING
    assert fresh.current_step_order == 1
    assert all(step.action is None for step in steps)

    await _approve(db_async, supervisor, resubmitted.workflow_instance_id)
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.APPROVED


async def test_returned_form_cannot_be_deleted_or_returned_by_status_patch(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "dept_return_guards")
    requester, supervisor, leave = await _submitted_leave(db_async, dept.id)
    leave_id, instance_id = leave.id, leave.workflow_instance_id
    admin = await make_user(db_async, superuser=True)
    with pytest.raises(HRValidationError, match="approvals inbox"):
        await action_leave_request(
            session=db_async,
            current_user=admin,
            leave_request_id=leave_id,
            payload=LeaveRequestAction(status=RequestStatus.RETURNED),
        )
    await _return(db_async, supervisor, instance_id, "Add details")
    with pytest.raises(HRValidationError):
        await delete_leave_request(
            session=db_async, current_user=requester, leave_request_id=leave_id
        )


async def test_rejected_form_is_final_and_cannot_be_edited(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "dept_return_vs_reject")
    requester, supervisor, leave = await _submitted_leave(db_async, dept.id)
    await apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=leave.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.REJECT),
    )
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.REJECTED
    with pytest.raises(HRValidationError):
        await update_leave_request(
            session=db_async,
            current_user=requester,
            leave_request_id=leave.id,
            payload=_leave_payload(dept.id),
        )
    with pytest.raises(HRValidationError):
        await submit_leave_request(
            session=db_async,
            current_user=requester,
            leave_request_id=leave.id,
            payload=LeaveRequestSubmit(),
        )


async def test_returned_timesheet_is_resubmitted(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "dept_return_timesheet")
    admin = await make_user(db_async, superuser=True)
    sup_role, _ = await make_role_with_permission(
        db_async, "workflow.instance.action", "workflow.instance.view"
    )
    template = await create_workflow_template(
        session=db_async,
        current_user=admin,
        template_in=WorkflowTemplateCreate(
            department_id=dept.id,
            workflow_type=WorkflowType.TIMESHEET,
            name="Timesheet Flow",
        ),
    )
    await create_workflow_step_template(
        session=db_async,
        current_user=admin,
        workflow_template_id=template.id,
        step_in=WorkflowStepTemplateCreate(
            step_order=1,
            required_role_id=sup_role.id,
            required_scope=RoleAssignmentScope.ALL,
        ),
    )
    supervisor = await make_user(db_async)
    await assign_role(
        db_async, user=supervisor, role=sup_role, scope=RoleAssignmentScope.ALL
    )
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=user, role=role)
    await make_ready_staff(db_async, user, dept.id)

    timesheet = await _make_timesheet(db_async, user, dept.id)
    await submit_timesheet(
        session=db_async,
        current_user=user,
        timesheet_id=timesheet.id,
        submission_mode=SubmissionMode.SELF,
    )
    from src.hr.workflow.models import WorkflowInstance

    first = await db_async.scalar(
        select(WorkflowInstance).where(WorkflowInstance.entity_id == timesheet.id)
    )
    await _return(db_async, supervisor, first.id, "Hours do not match the roster")
    await db_async.refresh(timesheet)
    assert timesheet.status == TimesheetStatus.RETURNED

    await submit_timesheet(
        session=db_async,
        current_user=user,
        timesheet_id=timesheet.id,
        submission_mode=SubmissionMode.SELF,
    )
    await db_async.refresh(timesheet)
    assert timesheet.status == TimesheetStatus.SUBMITTED
    instances = (
        await db_async.scalars(
            select(WorkflowInstance).where(WorkflowInstance.entity_id == timesheet.id)
        )
    ).all()
    assert sorted(row.status.value for row in instances) == ["PENDING", "RETURNED"]
