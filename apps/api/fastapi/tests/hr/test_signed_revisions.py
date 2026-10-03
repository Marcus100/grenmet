"""Returned submissions keep their original evidence and require fresh review."""

import json

import pytest
from sqlalchemy import select

from src.exceptions import AppException
from src.hr.leave import service as leave_service
from src.hr.leave.schemas import LeaveRequestSubmit
from src.hr.models import RequestStatus
from src.hr.signatures import service as signatures
from src.hr.signatures.models import SignedDocument
from src.hr.submission import signed_document_ids
from src.hr.workflow import service as workflows
from src.hr.workflow.models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from tests.factories import make_user
from tests.hr.test_signatures import leave_payload, setup


async def action(session, actor, workflow_id, verb):
    return await workflows.apply_workflow_action(
        session=session,
        current_user=actor,
        workflow_instance_id=workflow_id,
        action_in=WorkflowActionRequest(action=verb, comments="Reviewed form"),
    )


async def test_return_edit_and_resign_preserves_original_and_approval_cycle(db_async):
    actor, dept, saved = await setup(db_async)
    approver = await make_user(db_async, superuser=True)
    leave = await leave_service.create_leave_request(
        session=db_async,
        current_user=actor,
        payload=leave_payload(dept.id, signature_version=saved.version),
    )
    old_workflow = leave.workflow_instance_id
    original = await db_async.scalar(
        select(SignedDocument).where(SignedDocument.entity_id == leave.id)
    )
    original_id, original_pdf, original_snapshot = (
        original.id,
        original.pdf,
        original.snapshot,
    )
    await action(db_async, approver, old_workflow, WorkflowAction.RETURN)
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.DRAFT
    assert (
        await db_async.get(WorkflowInstance, old_workflow)
    ).status == WorkflowStatus.RETURNED
    with pytest.raises(AppException, match="form"):
        await action(db_async, actor, old_workflow, WorkflowAction.SUBMIT)
    with pytest.raises(AppException, match="history"):
        await leave_service.delete_leave_request(
            session=db_async, current_user=actor, leave_request_id=leave.id
        )
    await leave_service.update_leave_request(
        session=db_async,
        current_user=actor,
        leave_request_id=leave.id,
        payload=leave_payload(dept.id, as_draft=True, reason="Corrected details"),
    )
    await leave_service.submit_leave_request(
        session=db_async,
        current_user=actor,
        leave_request_id=leave.id,
        payload=LeaveRequestSubmit(signature_version=saved.version),
    )
    assert leave.workflow_instance_id != old_workflow
    records = list(
        (
            await db_async.scalars(
                select(SignedDocument)
                .where(SignedDocument.entity_id == leave.id)
                .order_by(SignedDocument.revision)
            )
        ).all()
    )
    assert [row.revision for row in records] == [1, 2]
    assert records[1].supersedes_document_id == original_id
    assert json.loads(records[1].snapshot)["form"]["reason"] == "Corrected details"
    assert records[0].pdf == original_pdf and records[0].snapshot == original_snapshot
    assert (
        await signatures.get_document(db_async, actor, original_id)
    ).pdf == original_pdf
    assert (await signed_document_ids(db_async, [leave.id]))[leave.id] == records[1].id
    assert await db_async.scalar(
        select(ApprovalActionLog.id).where(
            ApprovalActionLog.workflow_instance_id == old_workflow,
            ApprovalActionLog.action == WorkflowAction.RETURN,
        )
    )
    with pytest.raises(AppException, match="already been signed"):
        await signatures.capture(
            session=db_async,
            actor=actor,
            entity=leave,
            entity_type="leave_request",
            signature_version=saved.version,
        )
