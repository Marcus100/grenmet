"""Edit future workflow stages atomically; running instances retain their snapshots."""

import logging
import uuid

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import Role, User
from src.baseline.models import ApprovalPolicy, BaselineAudit
from src.baseline.service import require_admin
from src.exceptions import AppException

from .models import WorkflowStepTemplate, WorkflowTemplate
from .schemas import (
    WorkflowConfigurationInput,
    WorkflowConfigurationPublic,
    WorkflowStepTemplatePublic,
    WorkflowTemplatePublic,
)


async def read(session: AsyncSession, actor: User) -> list[WorkflowConfigurationPublic]:
    require_admin(actor)
    templates = (
        (
            await session.execute(
                select(WorkflowTemplate)
                .where(col(WorkflowTemplate.is_active).is_(True))
                .order_by(
                    WorkflowTemplate.department_id, WorkflowTemplate.workflow_type
                )
            )
        )
        .scalars()
        .all()
    )  # noqa: E712
    output = []
    for template in templates:
        steps = (
            (
                await session.execute(
                    select(WorkflowStepTemplate)
                    .where(
                        col(WorkflowStepTemplate.workflow_template_id) == template.id
                    )
                    .order_by(col(WorkflowStepTemplate.step_order))
                )
            )
            .scalars()
            .all()
        )
        policy = await session.get(
            ApprovalPolicy,
            f"hr:{template.department_id}:{template.workflow_type.value}",
        )
        output.append(
            WorkflowConfigurationPublic(
                template=WorkflowTemplatePublic.model_validate(
                    template, from_attributes=True
                ),
                allow_self_approval=policy.allow_self_approval if policy else False,
                require_distinct_approvers=policy.require_distinct_approvers
                if policy
                else True,
                steps=[
                    WorkflowStepTemplatePublic.model_validate(s, from_attributes=True)
                    for s in steps
                ],
            )
        )
    return output


async def save(
    session: AsyncSession,
    actor: User,
    template_id: uuid.UUID,
    body: WorkflowConfigurationInput,
) -> WorkflowConfigurationPublic:
    require_admin(actor)
    await session.execute(text("SELECT pg_advisory_xact_lock(73190506)"))
    template = await session.get(WorkflowTemplate, template_id)
    if not template or not template.is_active:
        raise AppException("Active workflow template not found", 404)
    for step in body.steps:
        if (
            step.required_role_id
            and await session.get(Role, step.required_role_id) is None
        ):
            raise AppException("Selected role does not exist", 422)
        if step.required_user_id:
            user = await session.get(User, step.required_user_id)
            if not user or not user.is_active:
                raise AppException("Selected person must be an active user", 422)
    before = next(
        item for item in await read(session, actor) if item.template.id == template_id
    )
    await session.execute(
        delete(WorkflowStepTemplate).where(
            col(WorkflowStepTemplate.workflow_template_id) == template_id
        )
    )
    for step in body.steps:
        session.add(
            WorkflowStepTemplate.model_validate(
                step.model_dump(),
                update={"workflow_template_id": template_id, "scope_enforced": True},
            )
        )
    template.name = body.name
    key = f"hr:{template.department_id}:{template.workflow_type.value}"
    policy = await session.get(ApprovalPolicy, key)
    if policy is None:
        policy = ApprovalPolicy(key=key)
        session.add(policy)
    policy.allow_self_approval = body.allow_self_approval
    policy.require_distinct_approvers = body.require_distinct_approvers
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            action="workflow.configure",
            details={
                "template_id": str(template_id),
                "before": before.model_dump(mode="json"),
                "after": body.model_dump(mode="json"),
            },
        )
    )
    await session.commit()
    logging.getLogger(__name__).info(
        "workflow.configure", extra={"actor_id": str(actor.id)}
    )
    return next(
        item for item in await read(session, actor) if item.template.id == template_id
    )
