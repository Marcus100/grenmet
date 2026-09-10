from datetime import date
from decimal import Decimal

import pytest
from sqlmodel import select

from src.auth.models import Role, User
from src.exceptions import AppException
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest, LeaveType
from src.hr.models import Department, RequestStatus
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from src.hr.workflow.service import apply_workflow_action


@pytest.mark.asyncio
async def test_two_distinct_approvers_and_single_leave_debit(db_async):
    users = [
        User(
            username=name,
            email=f"{name}@example.com",
            first_name=name,
            last_name="Test",
            hashed_password="unused",
            is_superuser=True,
            roles=[],
        )
        for name in ("owner", "supervisor", "manager")
    ]
    db_async.add_all(users)
    db_async.add(
        Department(
            organisation_id="gaa",
            code="approval-test",
            id="approval-test",
            name="Approval test",
        )
    )
    role = Role(name="test-approver")
    db_async.add(role)
    await db_async.flush()
    leave = LeaveRequest(
        user_id=users[0].id,
        department_id="approval-test",
        leave_type=LeaveType.VACATION,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 2),
        days_requested=2,
    )
    template = WorkflowTemplate(
        department_id="approval-test",
        workflow_type=WorkflowType.LEAVE_REQUEST,
        name="Test two stages",
    )
    db_async.add_all([leave, template])
    await db_async.flush()
    instance = WorkflowInstance(
        workflow_template_id=template.id,
        department_id="approval-test",
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="leave_request",
        entity_id=leave.id,
        requested_by_user_id=users[0].id,
        status=WorkflowStatus.PENDING,
        current_step_order=1,
        allow_self_approval=False,
        require_distinct_approvers=True,
    )
    db_async.add(instance)
    await db_async.flush()
    leave.workflow_instance_id = instance.id
    for order in (1, 2):
        db_async.add(
            WorkflowStepInstance(
                workflow_instance_id=instance.id,
                step_order=order,
                required_role_id=role.id,
            )
        )
    db_async.add(
        LeaveBalanceEvent(
            user_id=users[0].id,
            leave_type="VACATION",
            delta_days=10,
            balance_after_days=10,
            reason="Opening balance",
            created_by_user_id=users[2].id,
        )
    )
    await db_async.commit()

    async def approve(actor):
        return await apply_workflow_action(
            session=db_async,
            current_user=actor,
            workflow_instance_id=instance.id,
            action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
        )

    with pytest.raises(AppException):
        await approve(users[0])
    await approve(users[1])
    assert instance.status == WorkflowStatus.PENDING
    assert leave.status == RequestStatus.SUBMITTED
    with pytest.raises(AppException):
        await approve(users[1])
    from src.hr.workflow.service import list_actionable_instances

    assert any(
        row[0].id == instance.id
        for row in await list_actionable_instances(
            session=db_async, current_user=users[2]
        )
    )
    await approve(users[2])
    assert instance.status == WorkflowStatus.APPROVED
    assert leave.status == RequestStatus.APPROVED
    with pytest.raises(AppException):
        await approve(users[2])
    debits = (
        (
            await db_async.execute(
                select(LeaveBalanceEvent).where(
                    LeaveBalanceEvent.related_leave_request_id == leave.id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(debits) == 1
    assert debits[0].balance_after_days == Decimal("8")

    from src.hr.workflow.finalize import finalize_entity

    forged = WorkflowInstance(
        workflow_template_id=template.id,
        department_id="approval-test",
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="leave_request",
        entity_id=leave.id,
        requested_by_user_id=users[1].id,
        status=WorkflowStatus.APPROVED,
    )
    db_async.add(forged)
    await db_async.flush()
    with pytest.raises(AppException, match="does not match"):
        await finalize_entity(db_async, forged, users[2].id)

    from src.hr.workflow.schemas import WorkflowInstanceCreate
    from src.hr.workflow.service import create_workflow_instance

    with pytest.raises(AppException, match="Submit the HR form"):
        await create_workflow_instance(
            session=db_async,
            current_user=users[2],
            instance_in=WorkflowInstanceCreate(
                workflow_template_id=template.id,
                entity_type="leave_request",
                entity_id=leave.id,
            ),
        )
