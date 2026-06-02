import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import can_act_on_user_for_role, require_permission
from src.hr.constants import (
    ERROR_WORKFLOW_CANNOT_BE_SUBMITTED,
    ERROR_WORKFLOW_NOT_PENDING,
    ERROR_WORKFLOW_PERMISSION_DENIED,
)
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
    WorkflowInstanceNotFoundError,
    WorkflowStepNotFoundError,
    WorkflowTemplateNotFoundError,
)
from src.utils.datetime import utc_now

from .models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
    WorkflowType,
)
from .schemas import (
    WorkflowActionRequest,
    WorkflowInstanceCreate,
    WorkflowStepTemplateCreate,
    WorkflowTemplateCreate,
)

logger = logging.getLogger(__name__)

async def create_workflow_template(
    *, session: AsyncSession, current_user: User, template_in: WorkflowTemplateCreate
) -> WorkflowTemplate:
    require_permission(
        current_user=current_user, permission_key="workflow.template.manage"
    )
    db_template = WorkflowTemplate.model_validate(
        template_in,
        update={
            "created_by": current_user.id,
        },
    )
    session.add(db_template)
    await session.commit()
    await session.refresh(db_template)
    return db_template


async def create_workflow_step_template(
    *,
    session: AsyncSession,
    current_user: User,
    workflow_template_id: uuid.UUID,
    step_in: WorkflowStepTemplateCreate,
) -> WorkflowStepTemplate:
    require_permission(
        current_user=current_user, permission_key="workflow.template.manage"
    )
    workflow_template = await session.get(WorkflowTemplate, workflow_template_id)
    if not workflow_template:
        raise WorkflowTemplateNotFoundError()
    db_step = WorkflowStepTemplate.model_validate(
        step_in, update={"workflow_template_id": workflow_template_id}
    )
    session.add(db_step)
    await session.commit()
    await session.refresh(db_step)
    return db_step


async def read_workflow_templates(
    *, session: AsyncSession, current_user: User, department_id: str | None = None
) -> list[WorkflowTemplate]:
    require_permission(
        current_user=current_user, permission_key="workflow.template.view"
    )
    statement = select(WorkflowTemplate)
    if department_id:
        statement = statement.where(
            col(WorkflowTemplate.department_id) == department_id
        )
    result = await session.execute(statement.limit(100))
    return list(result.scalars().all())


async def _create_step_instances_for_workflow(
    *,
    session: AsyncSession,
    workflow_instance_id: uuid.UUID,
    workflow_template_id: uuid.UUID,
) -> None:
    result = await session.execute(
        select(WorkflowStepTemplate)
        .where(col(WorkflowStepTemplate.workflow_template_id) == workflow_template_id)
        .order_by(col(WorkflowStepTemplate.step_order))
    )
    steps = list(result.scalars().all())
    for step in steps:
        step_instance = WorkflowStepInstance(
            workflow_instance_id=workflow_instance_id,
            step_order=step.step_order,
            required_role_id=step.required_role_id,
            required_scope=step.required_scope,
            is_required=step.is_required,
        )
        session.add(step_instance)


async def create_workflow_instance(
    *, session: AsyncSession, current_user: User, instance_in: WorkflowInstanceCreate
) -> WorkflowInstance:
    workflow_template = await session.get(
        WorkflowTemplate, instance_in.workflow_template_id
    )
    if not workflow_template:
        raise WorkflowTemplateNotFoundError()
    db_instance = WorkflowInstance(
        workflow_template_id=workflow_template.id,
        department_id=workflow_template.department_id,
        workflow_type=workflow_template.workflow_type,
        entity_type=instance_in.entity_type,
        entity_id=instance_in.entity_id,
        requested_by_user_id=current_user.id,
    )
    session.add(db_instance)
    await session.commit()
    await session.refresh(db_instance)

    await _create_step_instances_for_workflow(
        session=session,
        workflow_instance_id=db_instance.id,
        workflow_template_id=workflow_template.id,
    )
    await session.commit()
    await session.refresh(db_instance)
    return db_instance


async def read_workflow_instance_details(
    *,
    session: AsyncSession,
    workflow_instance_id: uuid.UUID,
    current_user: User | None = None,
) -> tuple[WorkflowInstance, list[WorkflowStepInstance]]:
    if current_user:
        require_permission(
            current_user=current_user, permission_key="workflow.instance.view"
        )
    workflow_instance = await session.get(WorkflowInstance, workflow_instance_id)
    if not workflow_instance:
        raise WorkflowInstanceNotFoundError()
    result = await session.execute(
        select(WorkflowStepInstance)
        .where(col(WorkflowStepInstance.workflow_instance_id) == workflow_instance_id)
        .order_by(col(WorkflowStepInstance.step_order))
    )
    steps = list(result.scalars().all())
    return workflow_instance, steps


async def _is_actor_allowed_for_step(
    *,
    session: AsyncSession,
    current_user: User,
    workflow_instance: WorkflowInstance,
    workflow_step: WorkflowStepInstance,
) -> bool:
    return await can_act_on_user_for_role(
        session=session,
        current_user=current_user,
        target_user_id=workflow_instance.requested_by_user_id,
        required_role_id=workflow_step.required_role_id,
    )


async def apply_workflow_action(
    *,
    session: AsyncSession,
    current_user: User,
    workflow_instance_id: uuid.UUID,
    action_in: WorkflowActionRequest,
) -> WorkflowInstance:
    require_permission(
        current_user=current_user, permission_key="workflow.instance.action"
    )
    workflow_instance, steps = await read_workflow_instance_details(
        session=session,
        workflow_instance_id=workflow_instance_id,
        current_user=current_user,
    )

    if action_in.action == WorkflowAction.SUBMIT:
        if workflow_instance.status not in {
            WorkflowStatus.DRAFT,
            WorkflowStatus.RETURNED,
        }:
            raise HRValidationError(ERROR_WORKFLOW_CANNOT_BE_SUBMITTED)
        workflow_instance.status = WorkflowStatus.PENDING
        workflow_instance.submitted_at = utc_now()
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
        await session.commit()
        await session.refresh(workflow_instance)
        return workflow_instance

    if workflow_instance.status != WorkflowStatus.PENDING:
        raise HRValidationError(ERROR_WORKFLOW_NOT_PENDING)

    current_step = next(
        (
            step
            for step in steps
            if step.step_order == workflow_instance.current_step_order
        ),
        None,
    )
    if not current_step:
        raise WorkflowStepNotFoundError()

    if not await _is_actor_allowed_for_step(
        session=session,
        current_user=current_user,
        workflow_instance=workflow_instance,
        workflow_step=current_step,
    ):
        raise HRPermissionDeniedError(ERROR_WORKFLOW_PERMISSION_DENIED)

    current_step.approver_user_id = current_user.id
    current_step.action = action_in.action
    current_step.comments = action_in.comments
    current_step.acted_at = utc_now()
    current_step.updated_at = utc_now()
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
        workflow_instance.resolved_at = utc_now()
    elif action_in.action == WorkflowAction.CANCEL:
        workflow_instance.status = WorkflowStatus.CANCELLED
        workflow_instance.resolved_at = utc_now()
    elif action_in.action == WorkflowAction.RETURN:
        workflow_instance.status = WorkflowStatus.RETURNED
        workflow_instance.current_step_order = max(
            1, workflow_instance.current_step_order - 1
        )
    elif action_in.action == WorkflowAction.APPROVE:
        next_step_exists = any(
            step.step_order > workflow_instance.current_step_order for step in steps
        )
        if next_step_exists:
            workflow_instance.current_step_order += 1
        else:
            workflow_instance.status = WorkflowStatus.APPROVED
            workflow_instance.resolved_at = utc_now()

    workflow_instance.updated_at = utc_now()
    session.add(workflow_instance)
    await session.commit()
    await session.refresh(workflow_instance)
    logger.info(
        "Workflow action taken",
        extra={
            "instance_id": str(workflow_instance.id),
            "action": action_in.action.value,
            "status": workflow_instance.status.value,
            "actor_id": str(current_user.id),
        },
    )
    return workflow_instance


async def start_workflow_for_entity(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    workflow_type: WorkflowType,
    entity_type: str,
    entity_id: uuid.UUID,
) -> uuid.UUID | None:
    """Look up an active workflow template and kick off SUBMIT if found."""
    result = await session.execute(
        select(WorkflowTemplate).where(
            col(WorkflowTemplate.department_id) == department_id,
            col(WorkflowTemplate.workflow_type) == workflow_type,
            col(WorkflowTemplate.is_active) == True,  # noqa: E712
        )
    )
    template = result.scalars().first()
    if not template:
        return None
    instance = await create_workflow_instance(
        session=session,
        current_user=current_user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type=entity_type,
            entity_id=entity_id,
        ),
    )
    instance = await apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
    )
    return instance.id if instance else None
