import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.auth.models import User
from src.auth.policy import can_act_on_user_for_role, require_permission

from .models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
)
from .schemas import (
    WorkflowActionRequest,
    WorkflowInstanceCreate,
    WorkflowStepTemplateCreate,
    WorkflowTemplateCreate,
)

ERROR_WORKFLOW_TEMPLATE_NOT_FOUND = "Workflow template not found"
ERROR_WORKFLOW_INSTANCE_NOT_FOUND = "Workflow instance not found"
ERROR_WORKFLOW_STEP_NOT_FOUND = "Workflow step not found"
ERROR_WORKFLOW_PERMISSION_DENIED = "Not allowed to perform this workflow action"


def create_workflow_template(
    *, session: Session, current_user: User, template_in: WorkflowTemplateCreate
) -> WorkflowTemplate:
    require_permission(current_user=current_user, permission_key="workflow.template.manage")
    db_template = WorkflowTemplate.model_validate(
        template_in,
        update={
            "created_by": current_user.id,
        },
    )
    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    return db_template


def create_workflow_step_template(
    *,
    session: Session,
    current_user: User,
    workflow_template_id: uuid.UUID,
    step_in: WorkflowStepTemplateCreate,
) -> WorkflowStepTemplate:
    require_permission(current_user=current_user, permission_key="workflow.template.manage")
    workflow_template = session.get(WorkflowTemplate, workflow_template_id)
    if not workflow_template:
        raise HTTPException(status_code=404, detail=ERROR_WORKFLOW_TEMPLATE_NOT_FOUND)
    db_step = WorkflowStepTemplate.model_validate(
        step_in, update={"workflow_template_id": workflow_template_id}
    )
    session.add(db_step)
    session.commit()
    session.refresh(db_step)
    return db_step


def read_workflow_templates(
    *, session: Session, current_user: User, department_id: str | None = None
) -> list[WorkflowTemplate]:
    require_permission(current_user=current_user, permission_key="workflow.template.view")
    statement = select(WorkflowTemplate)
    if department_id:
        statement = statement.where(col(WorkflowTemplate.department_id) == department_id)
    return list(session.exec(statement).all())


def _create_step_instances_for_workflow(
    *,
    session: Session,
    workflow_instance_id: uuid.UUID,
    workflow_template_id: uuid.UUID,
) -> None:
    steps = session.exec(
        select(WorkflowStepTemplate)
        .where(col(WorkflowStepTemplate.workflow_template_id) == workflow_template_id)
        .order_by(col(WorkflowStepTemplate.step_order))
    ).all()
    for step in steps:
        step_instance = WorkflowStepInstance(
            workflow_instance_id=workflow_instance_id,
            step_order=step.step_order,
            required_role_id=step.required_role_id,
            required_scope=step.required_scope,
            is_required=step.is_required,
        )
        session.add(step_instance)


def create_workflow_instance(
    *, session: Session, current_user: User, instance_in: WorkflowInstanceCreate
) -> WorkflowInstance:
    workflow_template = session.get(WorkflowTemplate, instance_in.workflow_template_id)
    if not workflow_template:
        raise HTTPException(status_code=404, detail=ERROR_WORKFLOW_TEMPLATE_NOT_FOUND)
    db_instance = WorkflowInstance(
        workflow_template_id=workflow_template.id,
        department_id=workflow_template.department_id,
        workflow_type=workflow_template.workflow_type,
        entity_type=instance_in.entity_type,
        entity_id=instance_in.entity_id,
        requested_by_user_id=current_user.id,
    )
    session.add(db_instance)
    session.commit()
    session.refresh(db_instance)

    _create_step_instances_for_workflow(
        session=session,
        workflow_instance_id=db_instance.id,
        workflow_template_id=workflow_template.id,
    )
    session.commit()
    session.refresh(db_instance)
    return db_instance


def read_workflow_instance_details(
    *,
    session: Session,
    workflow_instance_id: uuid.UUID,
    current_user: User | None = None,
) -> tuple[WorkflowInstance, list[WorkflowStepInstance]]:
    if current_user:
        require_permission(current_user=current_user, permission_key="workflow.instance.view")
    workflow_instance = session.get(WorkflowInstance, workflow_instance_id)
    if not workflow_instance:
        raise HTTPException(status_code=404, detail=ERROR_WORKFLOW_INSTANCE_NOT_FOUND)
    steps = list(
        session.exec(
            select(WorkflowStepInstance)
            .where(col(WorkflowStepInstance.workflow_instance_id) == workflow_instance_id)
            .order_by(col(WorkflowStepInstance.step_order))
        ).all()
    )
    return workflow_instance, steps


def _is_actor_allowed_for_step(
    *,
    session: Session,
    current_user: User,
    workflow_instance: WorkflowInstance,
    workflow_step: WorkflowStepInstance,
) -> bool:
    return can_act_on_user_for_role(
        session=session,
        current_user=current_user,
        target_user_id=workflow_instance.requested_by_user_id,
        required_role_id=workflow_step.required_role_id,
    )


def apply_workflow_action(
    *,
    session: Session,
    current_user: User,
    workflow_instance_id: uuid.UUID,
    action_in: WorkflowActionRequest,
) -> WorkflowInstance:
    require_permission(current_user=current_user, permission_key="workflow.instance.action")
    workflow_instance, steps = read_workflow_instance_details(
        session=session,
        workflow_instance_id=workflow_instance_id,
        current_user=current_user,
    )

    if action_in.action == WorkflowAction.SUBMIT:
        if workflow_instance.status not in {WorkflowStatus.DRAFT, WorkflowStatus.RETURNED}:
            raise HTTPException(status_code=400, detail="Workflow cannot be submitted")
        workflow_instance.status = WorkflowStatus.PENDING
        workflow_instance.submitted_at = datetime.utcnow()
        workflow_instance.current_step_order = 1
        session.add(
            ApprovalActionLog(
                workflow_instance_id=workflow_instance.id,
                action=WorkflowAction.SUBMIT,
                actor_user_id=current_user.id,
                comments=action_in.comments,
            )
        )
        session.add(workflow_instance)
        session.commit()
        session.refresh(workflow_instance)
        return workflow_instance

    if workflow_instance.status != WorkflowStatus.PENDING:
        raise HTTPException(status_code=400, detail="Workflow is not pending")

    current_step = next(
        (step for step in steps if step.step_order == workflow_instance.current_step_order),
        None,
    )
    if not current_step:
        raise HTTPException(status_code=404, detail=ERROR_WORKFLOW_STEP_NOT_FOUND)

    if not _is_actor_allowed_for_step(
        session=session,
        current_user=current_user,
        workflow_instance=workflow_instance,
        workflow_step=current_step,
    ):
        raise HTTPException(status_code=403, detail=ERROR_WORKFLOW_PERMISSION_DENIED)

    current_step.approver_user_id = current_user.id
    current_step.action = action_in.action
    current_step.comments = action_in.comments
    current_step.acted_at = datetime.utcnow()
    current_step.updated_at = datetime.utcnow()
    session.add(current_step)
    session.add(
        ApprovalActionLog(
            workflow_instance_id=workflow_instance.id,
            workflow_step_instance_id=current_step.id,
            action=action_in.action,
            actor_user_id=current_user.id,
            comments=action_in.comments,
        )
    )

    if action_in.action == WorkflowAction.REJECT:
        workflow_instance.status = WorkflowStatus.REJECTED
        workflow_instance.resolved_at = datetime.utcnow()
    elif action_in.action == WorkflowAction.CANCEL:
        workflow_instance.status = WorkflowStatus.CANCELLED
        workflow_instance.resolved_at = datetime.utcnow()
    elif action_in.action == WorkflowAction.RETURN:
        workflow_instance.status = WorkflowStatus.RETURNED
        workflow_instance.current_step_order = max(1, workflow_instance.current_step_order - 1)
    elif action_in.action == WorkflowAction.APPROVE:
        next_step_exists = any(
            step.step_order > workflow_instance.current_step_order for step in steps
        )
        if next_step_exists:
            workflow_instance.current_step_order += 1
        else:
            workflow_instance.status = WorkflowStatus.APPROVED
            workflow_instance.resolved_at = datetime.utcnow()

    workflow_instance.updated_at = datetime.utcnow()
    session.add(workflow_instance)
    session.commit()
    session.refresh(workflow_instance)
    return workflow_instance
