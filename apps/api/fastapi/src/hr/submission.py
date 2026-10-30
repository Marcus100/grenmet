"""Project workflow submission dates onto already-authorized HR responses."""

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.signatures.models import SignedDocument
from src.hr.workflow.models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
)
from src.models import BaseModel, UtcDateTime


class SubmittedFormPublic(BaseModel):
    signed_document_id: UUID | None = None
    submitted_at: UtcDateTime | None = None
    workflow_status: WorkflowStatus | None = None
    # The approver's reason, shown to the author while the form is returned.
    returned_reason: str | None = None


class WorkflowForm(Protocol):
    id: UUID
    workflow_instance_id: UUID | None


async def submission_list[T: SubmittedFormPublic](
    session: AsyncSession, rows: Sequence[WorkflowForm], schema: type[T]
) -> list[T]:
    ids = {row.workflow_instance_id for row in rows if row.workflow_instance_id}
    workflows = {}
    if ids:
        result = await session.execute(
            select(WorkflowInstance).where(WorkflowInstance.id.in_(ids))
        )
        workflows = {item.id: item for item in result.scalars()}
    signed = await signed_document_ids(session, [row.id for row in rows])
    returned = [
        item.id for item in workflows.values() if item.status == WorkflowStatus.RETURNED
    ]
    reasons = await returned_reasons(session, returned)
    output = []
    for row in rows:
        item = schema.model_validate(row, from_attributes=True)
        item.signed_document_id = signed.get(row.id)
        workflow = (
            workflows.get(row.workflow_instance_id)
            if row.workflow_instance_id
            else None
        )
        if workflow is not None and workflow.entity_id == row.id:
            item.submitted_at = workflow.submitted_at
            item.workflow_status = workflow.status
            item.returned_reason = reasons.get(workflow.id)
        output.append(item)
    return output


async def submission_public[T: SubmittedFormPublic](
    session: AsyncSession, row: WorkflowForm, schema: type[T]
) -> T:
    return (await submission_list(session, [row], schema))[0]


async def signed_document_ids(
    session: AsyncSession, entity_ids: Sequence[UUID]
) -> dict[UUID, UUID]:
    if not entity_ids:
        return {}
    result = await session.execute(
        select(SignedDocument.entity_id, SignedDocument.id)
        .where(SignedDocument.entity_id.in_(entity_ids))
        .order_by(SignedDocument.revision, SignedDocument.signed_at, SignedDocument.id)
    )
    signed: dict[UUID, UUID] = {}
    for entity_id, document_id in result.all():
        signed[entity_id] = document_id
    return signed


async def returned_reasons(
    session: AsyncSession, workflow_ids: Sequence[UUID]
) -> dict[UUID, str]:
    """The latest return reason of each returned workflow instance."""
    if not workflow_ids:
        return {}
    result = await session.execute(
        select(ApprovalActionLog.workflow_instance_id, ApprovalActionLog.comments)
        .where(
            ApprovalActionLog.workflow_instance_id.in_(workflow_ids),
            ApprovalActionLog.action == WorkflowAction.RETURN,
        )
        .order_by(ApprovalActionLog.created_at, ApprovalActionLog.id)
    )
    reasons: dict[UUID, str] = {}
    for instance_id, comments in result.all():
        if comments:
            reasons[instance_id] = comments
    return reasons
