from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import Permission, Role, RoleAssignmentScope
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.leave.models import LeaveRequest
from src.hr.leave.schemas import LeaveRequestCreate, LeaveRequestSubmit
from src.hr.leave.service import create_leave_request, submit_leave_request
from src.hr.models import Department, RequestStatus
from src.hr.workflow.models import WorkflowAction, WorkflowStatus, WorkflowType
from src.hr.workflow.schemas import (
    WorkflowActionRequest,
    WorkflowInstanceCreate,
    WorkflowStepTemplateCreate,
    WorkflowTemplateCreate,
)
from src.hr.workflow.service import (
    apply_workflow_action,
    create_workflow_instance,
    create_workflow_step_template,
    create_workflow_template,
    read_workflow_instance_details,
)
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)
from tests.utils.utils import random_email, random_lower_string


async def _approve(db: AsyncSession, actor, instance_id) -> None:
    await apply_workflow_action(
        session=db,
        current_user=actor,
        workflow_instance_id=instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )


async def _setup_leave_template(db: AsyncSession, department_id: str) -> None:
    """Create an active LEAVE_REQUEST workflow template with one approval step."""
    admin = await make_user(db, superuser=True)
    step_role, _ = await make_role_with_permission(db, "workflow.instance.action")
    template = await create_workflow_template(
        session=db,
        current_user=admin,
        template_in=WorkflowTemplateCreate(
            department_id=department_id,
            workflow_type=WorkflowType.LEAVE_REQUEST,
            name="Leave Flow",
        ),
    )
    await create_workflow_step_template(
        session=db,
        current_user=admin,
        workflow_template_id=template.id,
        step_in=WorkflowStepTemplateCreate(step_order=1, required_role_id=step_role.id),
    )


def _leave_payload(department_id: str) -> LeaveRequestCreate:
    return LeaveRequestCreate(
        department_id=department_id,
        leave_type="VACATION",
        start_date="2026-07-01",
        end_date="2026-07-02",
        days_requested=Decimal("1.0"),
    )


async def test_self_submit_does_not_require_approver_permission(
    db_async: AsyncSession,
) -> None:
    """A rank-and-file requester (no workflow.instance.action) can create a leave
    request that auto-submits through an existing workflow template."""
    dept = await make_department(db_async, "dept_self_submit")
    await _setup_leave_template(db_async, dept.id)

    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=user, role=role)

    leave_request = await create_leave_request(
        session=db_async, current_user=user, payload=_leave_payload(dept.id)
    )

    assert leave_request.workflow_instance_id is not None
    assert leave_request.status == RequestStatus.SUBMITTED


async def test_workflow_start_failure_rolls_back_entity(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If workflow kickoff raises, the leave request must not be left persisted
    (create is atomic: entity + workflow instance land in one transaction)."""
    from src.hr.leave import service as leave_service

    dept = await make_department(db_async, "dept_rollback")
    user = await make_user(db_async)
    user_id = user.id  # capture before rollback expires the instance
    role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=user, role=role)

    async def _boom(**_kwargs: object) -> None:
        raise RuntimeError("workflow kickoff failed")

    monkeypatch.setattr(leave_service, "start_workflow_for_entity", _boom)

    with pytest.raises(RuntimeError):
        await create_leave_request(
            session=db_async, current_user=user, payload=_leave_payload(dept.id)
        )

    # Simulate the request-scoped rollback get_db performs on an unhandled error,
    # then confirm nothing was committed for this user.
    await db_async.rollback()
    result = await db_async.execute(
        select(LeaveRequest).where(col(LeaveRequest.user_id) == user_id)
    )
    assert result.scalars().first() is None


async def test_workflow_transition_submit_to_approve(
    db_async: AsyncSession,
) -> None:
    user = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"wf_{random_lower_string()}",
            password="password123",
            first_name="Workflow",
            last_name="Owner",
        ),
    )
    if not await db_async.get(Department, "dept_workflow"):
        db_async.add(Department(id="dept_workflow", name="Dept Workflow"))
        await db_async.commit()
    result = await db_async.execute(select(Role).where(Role.name == "SUPERVISOR"))
    role = result.scalars().first()
    if not role:
        role = Role(name="SUPERVISOR")
        db_async.add(role)
        await db_async.commit()
        await db_async.refresh(role)
    result = await db_async.execute(
        select(Permission).where(Permission.key == "workflow.template.manage")
    )
    workflow_manage_permission = result.scalars().first()
    if not workflow_manage_permission:
        workflow_manage_permission = Permission(
            key="workflow.template.manage",
            action="update",
            entity="workflow_template",
            access="department",
            description="Manage workflow template",
        )
    result = await db_async.execute(
        select(Permission).where(Permission.key == "workflow.instance.action")
    )
    workflow_action_permission = result.scalars().first()
    if not workflow_action_permission:
        workflow_action_permission = Permission(
            key="workflow.instance.action",
            action="update",
            entity="workflow_instance",
            access="department",
            description="Action workflow instance",
        )
    result = await db_async.execute(
        select(Permission).where(Permission.key == "workflow.instance.view")
    )
    workflow_view_permission = result.scalars().first()
    if not workflow_view_permission:
        workflow_view_permission = Permission(
            key="workflow.instance.view",
            action="read",
            entity="workflow_instance",
            access="department",
            description="View workflow instance",
        )
    await db_async.refresh(role, attribute_names=["permissions"])
    role.permissions.append(workflow_manage_permission)
    role.permissions.append(workflow_action_permission)
    role.permissions.append(workflow_view_permission)
    await db_async.refresh(user, attribute_names=["roles"])
    user.roles.append(role)
    db_async.add(role)
    db_async.add(workflow_manage_permission)
    db_async.add(workflow_action_permission)
    db_async.add(user)
    await db_async.commit()

    template = await create_workflow_template(
        session=db_async,
        current_user=user,
        template_in=WorkflowTemplateCreate(
            department_id="dept_workflow",
            workflow_type=WorkflowType.LEAVE_REQUEST,
            name="Leave Flow",
        ),
    )
    await create_workflow_step_template(
        session=db_async,
        current_user=user,
        workflow_template_id=template.id,
        step_in=WorkflowStepTemplateCreate(step_order=1, required_role_id=role.id),
    )
    instance = await create_workflow_instance(
        session=db_async,
        current_user=user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type="leave_request",
            entity_id=template.id,
        ),
    )
    submitted = await apply_workflow_action(
        session=db_async,
        current_user=user,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
    )
    assert submitted.status == WorkflowStatus.PENDING


async def _setup_coapproval(db: AsyncSession, department_id: str):
    """Template with a single supervisor role step; returns the supervisor role."""
    admin = await make_user(db, superuser=True)
    sup_role, _ = await make_role_with_permission(
        db, "workflow.instance.action", "workflow.instance.view"
    )
    template = await create_workflow_template(
        session=db,
        current_user=admin,
        template_in=WorkflowTemplateCreate(
            department_id=department_id,
            workflow_type=WorkflowType.LEAVE_REQUEST,
            name="Leave Flow",
        ),
    )
    await create_workflow_step_template(
        session=db,
        current_user=admin,
        workflow_template_id=template.id,
        step_in=WorkflowStepTemplateCreate(step_order=1, required_role_id=sup_role.id),
    )
    return sup_role


async def _make_requester(db: AsyncSession):
    requester = await make_user(db)
    creator_role, _ = await make_role_with_permission(db, "leave.request.create.self")
    await assign_role(db, user=requester, role=creator_role)
    return requester


async def _make_peer(db: AsyncSession):
    peer = await make_user(db)
    peer_role, _ = await make_role_with_permission(
        db, "workflow.instance.action", "workflow.instance.view"
    )
    await assign_role(db, user=peer, role=peer_role)
    return peer


async def test_named_coapprovers_all_must_approve(db_async: AsyncSession) -> None:
    """Every named co-approver must approve before the request advances to the
    supervisor tier, then supervisor approval resolves it to APPROVED."""
    dept = await make_department(db_async, "dept_coapprove")
    sup_role = await _setup_coapproval(db_async, dept.id)

    requester = await _make_requester(db_async)
    peer_a = await _make_peer(db_async)
    peer_b = await _make_peer(db_async)
    supervisor = await make_user(db_async)
    await assign_role(
        db_async, user=supervisor, role=sup_role, scope=RoleAssignmentScope.ALL
    )

    payload = _leave_payload(dept.id)
    payload.co_approver_user_ids = [peer_a.id, peer_b.id]
    leave = await create_leave_request(
        session=db_async, current_user=requester, payload=payload
    )
    assert leave.status == RequestStatus.SUBMITTED
    instance_id = leave.workflow_instance_id
    assert instance_id is not None

    instance, steps = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=instance_id
    )
    assert instance.status == WorkflowStatus.PENDING
    assert instance.current_step_order == 1
    order1 = [s for s in steps if s.step_order == 1]
    assert len(order1) == 2  # two parallel peer steps
    assert {s.required_user_id for s in order1} == {peer_a.id, peer_b.id}
    # the template supervisor step is shifted behind the peer gate
    assert any(s.step_order == 2 and s.required_role_id == sup_role.id for s in steps)

    # first peer approves — order 1 is NOT complete, no advance
    await _approve(db_async, peer_a, instance_id)
    instance, _ = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=instance_id
    )
    assert instance.status == WorkflowStatus.PENDING
    assert instance.current_step_order == 1

    # second peer approves — order 1 complete, advance to supervisor
    await _approve(db_async, peer_b, instance_id)
    instance, _ = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=instance_id
    )
    assert instance.status == WorkflowStatus.PENDING
    assert instance.current_step_order == 2

    # supervisor approves — resolved
    await _approve(db_async, supervisor, instance_id)
    instance, _ = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=instance_id
    )
    assert instance.status == WorkflowStatus.APPROVED


async def test_coapprover_rejection_rejects_instance(db_async: AsyncSession) -> None:
    """A single co-approver rejecting kills the whole request."""
    dept = await make_department(db_async, "dept_coapprove_reject")
    await _setup_coapproval(db_async, dept.id)
    requester = await _make_requester(db_async)
    peer_a = await _make_peer(db_async)
    peer_b = await _make_peer(db_async)

    payload = _leave_payload(dept.id)
    payload.co_approver_user_ids = [peer_a.id, peer_b.id]
    leave = await create_leave_request(
        session=db_async, current_user=requester, payload=payload
    )

    await apply_workflow_action(
        session=db_async,
        current_user=peer_a,
        workflow_instance_id=leave.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.REJECT),
    )
    instance, _ = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=leave.workflow_instance_id
    )
    assert instance.status == WorkflowStatus.REJECTED


async def test_save_draft_then_submit(db_async: AsyncSession) -> None:
    """as_draft create persists a DRAFT with no approval chain; submitting later
    builds the chain (peers + template tail) and moves it to PENDING."""
    dept = await make_department(db_async, "dept_draft")
    await _setup_coapproval(db_async, dept.id)
    requester = await _make_requester(db_async)
    peer = await _make_peer(db_async)

    draft_payload = _leave_payload(dept.id)
    draft_payload.as_draft = True
    draft = await create_leave_request(
        session=db_async, current_user=requester, payload=draft_payload
    )
    assert draft.status == RequestStatus.DRAFT
    # a DRAFT workflow instance exists but has no steps yet
    _instance, steps = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=draft.workflow_instance_id
    )
    assert _instance.status == WorkflowStatus.DRAFT
    assert steps == []

    submitted = await submit_leave_request(
        session=db_async,
        current_user=requester,
        leave_request_id=draft.id,
        payload=LeaveRequestSubmit(co_approver_user_ids=[peer.id]),
    )
    assert submitted.status == RequestStatus.SUBMITTED
    instance, steps = await read_workflow_instance_details(
        session=db_async, workflow_instance_id=submitted.workflow_instance_id
    )
    assert instance.status == WorkflowStatus.PENDING
    assert any(s.required_user_id == peer.id for s in steps)
