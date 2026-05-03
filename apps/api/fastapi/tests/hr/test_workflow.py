from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import Permission, Role
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department
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
)
from tests.utils.utils import random_email, random_lower_string


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
