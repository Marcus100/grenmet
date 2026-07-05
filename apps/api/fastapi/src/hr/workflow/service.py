import logging
import uuid

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import Role, User, UserRoleAssignment
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
    co_approver_user_ids: list[uuid.UUID] | None = None,
) -> None:
    """Build a workflow's step instances.

    Named co-approvers, when supplied, form a parallel gate at ``step_order`` 1
    (every one is required, order-independent); the template's role-based steps
    are shifted to follow them. With no co-approvers the template steps keep their
    original ordering, starting at 1.
    """
    co_approver_user_ids = co_approver_user_ids or []
    order_offset = 1 if co_approver_user_ids else 0

    for peer_user_id in co_approver_user_ids:
        session.add(
            WorkflowStepInstance(
                workflow_instance_id=workflow_instance_id,
                step_order=1,
                required_user_id=peer_user_id,
                required_role_id=None,
                is_required=True,
            )
        )

    result = await session.execute(
        select(WorkflowStepTemplate)
        .where(col(WorkflowStepTemplate.workflow_template_id) == workflow_template_id)
        .order_by(col(WorkflowStepTemplate.step_order))
    )
    steps = list(result.scalars().all())
    for step in steps:
        step_instance = WorkflowStepInstance(
            workflow_instance_id=workflow_instance_id,
            step_order=step.step_order + order_offset,
            required_role_id=step.required_role_id,
            required_scope=step.required_scope,
            is_required=step.is_required,
        )
        session.add(step_instance)


async def create_workflow_instance(
    *,
    session: AsyncSession,
    current_user: User,
    instance_in: WorkflowInstanceCreate,
    require_actor_permission: bool = True,
    commit: bool = True,
    build_steps: bool = True,
    co_approver_user_ids: list[uuid.UUID] | None = None,
) -> WorkflowInstance:
    # The public POST /instances endpoint must be permission-gated (previously any
    # authenticated user could create an instance against any template/entity).
    # The internal start_workflow_for_entity path opts out: it is triggered by an
    # entity create the actor is already authorized for.
    if require_actor_permission:
        require_permission(
            current_user=current_user, permission_key="workflow.instance.action"
        )
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
    # Flush (not commit) so step creation and any calling entity-create share one
    # transaction; when commit=False the caller owns the terminal commit.
    session.add(db_instance)
    await session.flush()

    if build_steps:
        await _create_step_instances_for_workflow(
            session=session,
            workflow_instance_id=db_instance.id,
            workflow_template_id=workflow_template.id,
            co_approver_user_ids=co_approver_user_ids,
        )
    if commit:
        await session.commit()
        await session.refresh(db_instance)
    else:
        await session.flush()
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
    # A named-user step is satisfied only by that specific person; a role step
    # falls back to the role + scope check against the requester.
    if workflow_step.required_user_id is not None:
        return current_user.id == workflow_step.required_user_id
    if workflow_step.required_role_id is not None:
        return await can_act_on_user_for_role(
            session=session,
            current_user=current_user,
            target_user_id=workflow_instance.requested_by_user_id,
            required_role_id=workflow_step.required_role_id,
        )
    return False


async def apply_workflow_action(
    *,
    session: AsyncSession,
    current_user: User,
    workflow_instance_id: uuid.UUID,
    action_in: WorkflowActionRequest,
    require_actor_permission: bool = True,
    commit: bool = True,
) -> WorkflowInstance:
    # require_actor_permission=False is the internal self-submit path: a requester
    # submitting their own freshly-created instance must not need the approver-only
    # workflow.instance.action (or .view) permission.
    if require_actor_permission:
        require_permission(
            current_user=current_user, permission_key="workflow.instance.action"
        )
    workflow_instance, steps = await read_workflow_instance_details(
        session=session,
        workflow_instance_id=workflow_instance_id,
        current_user=current_user if require_actor_permission else None,
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
        if commit:
            await session.commit()
            await session.refresh(workflow_instance)
        else:
            await session.flush()
        return workflow_instance

    if workflow_instance.status != WorkflowStatus.PENDING:
        raise HRValidationError(ERROR_WORKFLOW_NOT_PENDING)

    current_order = workflow_instance.current_step_order
    order_steps = [
        step
        for step in steps
        if step.step_order == current_order and step.is_required
    ]
    if not order_steps:
        raise WorkflowStepNotFoundError()

    # A step_order may hold several required steps (parallel co-approval). The
    # actor acts on the first still-pending step at this order they are allowed
    # for; each required step must be satisfied before the order completes.
    target_step: WorkflowStepInstance | None = None
    for step in order_steps:
        if step.action is not None:
            continue
        if await _is_actor_allowed_for_step(
            session=session,
            current_user=current_user,
            workflow_instance=workflow_instance,
            workflow_step=step,
        ):
            target_step = step
            break
    if target_step is None:
        raise HRPermissionDeniedError(ERROR_WORKFLOW_PERMISSION_DENIED)

    target_step.approver_user_id = current_user.id
    target_step.action = action_in.action
    target_step.comments = action_in.comments
    target_step.acted_at = utc_now()
    target_step.updated_at = utc_now()
    session.add(target_step)
    session.add(
        ApprovalActionLog(
            workflow_instance_id=workflow_instance.id,
            workflow_step_instance_id=target_step.id,
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
        prev_orders = [s.step_order for s in steps if s.step_order < current_order]
        workflow_instance.current_step_order = max(prev_orders, default=1)
    elif action_in.action == WorkflowAction.APPROVE:
        # The order advances only once EVERY required step at it is approved.
        order_complete = all(
            step.action == WorkflowAction.APPROVE for step in order_steps
        )
        if order_complete:
            next_orders = [
                step.step_order for step in steps if step.step_order > current_order
            ]
            if next_orders:
                workflow_instance.current_step_order = min(next_orders)
            else:
                workflow_instance.status = WorkflowStatus.APPROVED
                workflow_instance.resolved_at = utc_now()

    workflow_instance.updated_at = utc_now()
    session.add(workflow_instance)
    if commit:
        await session.commit()
        await session.refresh(workflow_instance)
    else:
        await session.flush()
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


WORKFLOW_TYPE_LABELS: dict[WorkflowType, str] = {
    WorkflowType.LEAVE_REQUEST: "Leave request",
    WorkflowType.SHIFT_SWAP: "Shift exchange",
    WorkflowType.ABSENTEE_REPORT: "Absentee report",
    WorkflowType.STATUS_REPORT: "Daily status report",
    WorkflowType.TIMESHEET: "Timesheet",
    WorkflowType.PARKING_PERMIT: "Parking permit",
}


async def _hr_admin_emails(*, session: AsyncSession) -> list[str]:
    """Email addresses of everyone holding the hr-admin role."""
    role_result = await session.execute(select(Role).where(Role.name == "hr-admin"))
    role = role_result.scalars().first()
    if not role:
        return []
    user_result = await session.execute(
        select(User)
        .join(UserRoleAssignment, col(UserRoleAssignment.user_id) == col(User.id))
        .where(col(UserRoleAssignment.role_id) == role.id)
    )
    return [user.email for user in user_result.scalars().unique().all() if user.email]


async def build_approval_notification(
    *, session: AsyncSession, instance: WorkflowInstance
) -> tuple[list[str], str, str] | None:
    """Recipients + subject + HTML for the "approved" email to HR admins.

    Returns None when there is nobody to notify (no hr-admin users).
    """
    recipients = await _hr_admin_emails(session=session)
    if not recipients:
        return None
    requester = await session.get(User, instance.requested_by_user_id)
    requester_name = requester.full_name if requester else "A staff member"
    type_label = WORKFLOW_TYPE_LABELS.get(
        instance.workflow_type, instance.workflow_type.value
    )
    subject = f"Approved: {type_label} — {requester_name}"
    html = (
        f"<p>A <strong>{type_label.lower()}</strong> has completed the approval "
        f"chain and is now approved.</p>"
        f"<ul>"
        f"<li><strong>Requested by:</strong> {requester_name}</li>"
        f"<li><strong>Department:</strong> {instance.department_id}</li>"
        f"<li><strong>Reference:</strong> {instance.entity_type} {instance.entity_id}</li>"
        f"</ul>"
        f"<p>No action is required — this is a record notification for HR.</p>"
    )
    return recipients, subject, html


async def list_actionable_instances(
    *,
    session: AsyncSession,
    current_user: User,
) -> list[tuple[WorkflowInstance, WorkflowStepInstance, User | None]]:
    """Pending instances the current user can act on right now.

    A row qualifies when the instance is PENDING and its current-order step is
    still unacted and either names the user (co-approver) or requires a role the
    user holds. Candidate rows are then confirmed with the same step-level
    authorization the action endpoint enforces (so role scope is respected).
    """
    require_permission(
        current_user=current_user, permission_key="workflow.instance.view"
    )
    my_role_ids = {role.id for role in current_user.roles}
    match_conditions = [col(WorkflowStepInstance.required_user_id) == current_user.id]
    if my_role_ids:
        match_conditions.append(col(WorkflowStepInstance.required_role_id).in_(my_role_ids))

    result = await session.execute(
        select(WorkflowInstance, WorkflowStepInstance)
        .join(
            WorkflowStepInstance,
            col(WorkflowStepInstance.workflow_instance_id) == col(WorkflowInstance.id),
        )
        .where(
            col(WorkflowInstance.status) == WorkflowStatus.PENDING,
            col(WorkflowStepInstance.step_order)
            == col(WorkflowInstance.current_step_order),
            col(WorkflowStepInstance.action).is_(None),
            col(WorkflowStepInstance.is_required) == True,  # noqa: E712
            or_(*match_conditions),
        )
        .order_by(col(WorkflowInstance.submitted_at))
    )

    actionable: list[tuple[WorkflowInstance, WorkflowStepInstance]] = []
    requester_ids: set[uuid.UUID] = set()
    for instance, step in result.all():
        if await _is_actor_allowed_for_step(
            session=session,
            current_user=current_user,
            workflow_instance=instance,
            workflow_step=step,
        ):
            actionable.append((instance, step))
            requester_ids.add(instance.requested_by_user_id)

    requesters: dict[uuid.UUID, User] = {}
    if requester_ids:
        requester_result = await session.execute(
            select(User).where(col(User.id).in_(requester_ids))
        )
        requesters = {user.id: user for user in requester_result.scalars().all()}

    return [
        (instance, step, requesters.get(instance.requested_by_user_id))
        for instance, step in actionable
    ]


async def start_workflow_for_entity(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    workflow_type: WorkflowType,
    entity_type: str,
    entity_id: uuid.UUID,
    co_approver_user_ids: list[uuid.UUID] | None = None,
    submit: bool = True,
) -> uuid.UUID | None:
    """Look up an active workflow template and create an instance for an entity.

    Requires a configured template for the department + workflow type (returns
    None otherwise). With ``submit=True`` the named co-approvers are attached as
    a parallel first step and the instance is submitted (DRAFT → PENDING). With
    ``submit=False`` the instance is created at DRAFT with no steps yet — steps
    (and co-approvers) are built later by :func:`submit_draft_workflow`.
    """
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
    # commit=False: the calling entity-create owns the terminal commit, so the
    # entity row and its workflow instance/steps land in one atomic transaction.
    instance = await create_workflow_instance(
        session=session,
        current_user=current_user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type=entity_type,
            entity_id=entity_id,
        ),
        require_actor_permission=False,
        commit=False,
        build_steps=submit,
        co_approver_user_ids=co_approver_user_ids if submit else None,
    )
    if not submit:
        return instance.id
    instance = await apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
        require_actor_permission=False,
        commit=False,
    )
    return instance.id if instance else None


async def submit_draft_workflow(
    *,
    session: AsyncSession,
    current_user: User,
    workflow_instance_id: uuid.UUID,
    co_approver_user_ids: list[uuid.UUID] | None = None,
    commit: bool = True,
) -> WorkflowInstance:
    """Build the approval chain for a DRAFT instance and submit it.

    Steps are built at submit time (not draft-create) so the co-approvers chosen
    at submission are the ones that take effect.
    """
    instance = await session.get(WorkflowInstance, workflow_instance_id)
    if not instance:
        raise WorkflowInstanceNotFoundError()
    if instance.status != WorkflowStatus.DRAFT:
        raise HRValidationError(ERROR_WORKFLOW_CANNOT_BE_SUBMITTED)
    await _create_step_instances_for_workflow(
        session=session,
        workflow_instance_id=instance.id,
        workflow_template_id=instance.workflow_template_id,
        co_approver_user_ids=co_approver_user_ids,
    )
    await session.flush()
    return await apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
        require_actor_permission=False,
        commit=commit,
    )
