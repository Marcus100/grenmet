from sqlmodel import Session, select

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


def test_workflow_transition_submit_to_approve(db: Session) -> None:
    user = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"wf_{random_lower_string()}",
            password="password123",
            first_name="Workflow",
            last_name="Owner",
        ),
    )
    if not db.get(Department, "dept_workflow"):
        db.add(Department(id="dept_workflow", name="Dept Workflow"))
        db.commit()
    role = db.exec(select(Role).where(Role.name == "SUPERVISOR")).first()
    if not role:
        role = Role(name="SUPERVISOR")
        db.add(role)
        db.commit()
        db.refresh(role)
    workflow_manage_permission = db.exec(
        select(Permission).where(Permission.key == "workflow.template.manage")
    ).first()
    if not workflow_manage_permission:
        workflow_manage_permission = Permission(
            key="workflow.template.manage",
            action="update",
            entity="workflow_template",
            access="department",
            description="Manage workflow template",
        )
    workflow_action_permission = db.exec(
        select(Permission).where(Permission.key == "workflow.instance.action")
    ).first()
    if not workflow_action_permission:
        workflow_action_permission = Permission(
            key="workflow.instance.action",
            action="update",
            entity="workflow_instance",
            access="department",
            description="Action workflow instance",
        )
    role.permissions.append(workflow_manage_permission)
    role.permissions.append(workflow_action_permission)
    user.roles.append(role)
    db.add(role)
    db.add(workflow_manage_permission)
    db.add(workflow_action_permission)
    db.add(user)
    db.commit()

    template = create_workflow_template(
        session=db,
        current_user=user,
        template_in=WorkflowTemplateCreate(
            department_id="dept_workflow",
            workflow_type=WorkflowType.LEAVE_REQUEST,
            name="Leave Flow",
        ),
    )
    create_workflow_step_template(
        session=db,
        current_user=user,
        workflow_template_id=template.id,
        step_in=WorkflowStepTemplateCreate(step_order=1, required_role_id=role.id),
    )
    instance = create_workflow_instance(
        session=db,
        current_user=user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type="leave_request",
            entity_id=template.id,
        ),
    )
    submitted = apply_workflow_action(
        session=db,
        current_user=user,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
    )
    assert submitted.status == WorkflowStatus.PENDING
