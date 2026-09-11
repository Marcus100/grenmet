"""Project workflow submission dates onto already-authorized HR responses."""

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.hr.signatures.models import SignedDocument
from src.hr.workflow.models import WorkflowInstance
from src.models import BaseModel, UtcDateTime


class SubmittedFormPublic(BaseModel):
    signed_document_id: UUID | None = None
    submitted_at: UtcDateTime | None = None


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
            select(WorkflowInstance).where(col(WorkflowInstance.id).in_(ids))
        )
        workflows = {item.id: item for item in result.scalars()}
    signed = await signed_document_ids(session, [row.id for row in rows])
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
        select(SignedDocument.entity_id, SignedDocument.id).where(
            col(SignedDocument.entity_id).in_(entity_ids)
        )
    )
    signed: dict[UUID, UUID] = {}
    for entity_id, document_id in result.all():
        signed[entity_id] = document_id
    return signed
