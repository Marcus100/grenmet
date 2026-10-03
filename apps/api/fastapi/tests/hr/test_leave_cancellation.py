"""Returned submissions keep their original evidence and require fresh review."""

from decimal import Decimal

from sqlalchemy import select

from src.hr.leave import ledger
from src.hr.leave import service as leave_service
from src.hr.leave.models import LeaveBalanceEvent, LeaveEntryKind
from src.hr.leave.schemas import LeaveRequestAction
from src.hr.models import RequestStatus
from src.hr.workflow import service as workflows
from src.hr.workflow.models import (
    WorkflowAction,
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


async def test_approved_workflow_cancellation_reverses_exact_debit_once(db_async):
    actor, dept, _ = await setup(db_async)
    approver = await make_user(db_async, superuser=True)
    leave = await leave_service.create_leave_request(
        session=db_async, current_user=actor, payload=leave_payload(dept.id)
    )
    before = await ledger.balance(db_async, actor.id, "VACATION")
    await action(db_async, approver, leave.workflow_instance_id, WorkflowAction.APPROVE)
    assert await ledger.balance(db_async, actor.id, "VACATION") == before - Decimal("2")
    await action(db_async, approver, leave.workflow_instance_id, WorkflowAction.CANCEL)
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.CANCELLED
    assert await ledger.balance(db_async, actor.id, "VACATION") == before
    # Even changed mutable form values cannot alter the original reversal amount.
    leave.days_requested = Decimal("9")
    again = await ledger.reverse_approval(db_async, request=leave, actor_id=approver.id)
    assert again.delta_days == Decimal("2")
    rows = list(
        (
            await db_async.scalars(
                select(LeaveBalanceEvent)
                .where(LeaveBalanceEvent.related_leave_request_id == leave.id)
                .order_by(LeaveBalanceEvent.sequence)
            )
        ).all()
    )
    assert [row.entry_kind for row in rows] == [
        LeaveEntryKind.APPROVAL_DEBIT,
        LeaveEntryKind.CANCELLATION_REVERSAL,
    ]
    assert sum(row.delta_days for row in rows) == 0
    assert await ledger.balance(db_async, actor.id, "VACATION") == before


async def test_legacy_approved_leave_cancellation_and_replay(db_async):
    from tests.hr.test_leave_ledger import _leave_request

    actor, dept, _ = await setup(db_async)
    approver = await make_user(db_async, superuser=True)
    leave = await _leave_request(db_async, actor, dept.id)
    before = await ledger.balance(db_async, actor.id, "VACATION")
    for status in [
        RequestStatus.APPROVED,
        RequestStatus.CANCELLED,
        RequestStatus.CANCELLED,
    ]:
        await leave_service.action_leave_request(
            session=db_async,
            current_user=approver,
            leave_request_id=leave.id,
            payload=LeaveRequestAction(status=status),
        )
    assert await ledger.balance(db_async, actor.id, "VACATION") == before
    assert leave.status == RequestStatus.CANCELLED


async def test_pending_cancellation_does_not_create_a_balance(db_async):
    actor, dept, _ = await setup(db_async)
    approver = await make_user(db_async, superuser=True)
    leave = await leave_service.create_leave_request(
        session=db_async, current_user=actor, payload=leave_payload(dept.id)
    )
    before = await ledger.balance(db_async, actor.id, "VACATION")
    await action(db_async, approver, leave.workflow_instance_id, WorkflowAction.CANCEL)
    await db_async.refresh(leave)
    assert leave.status == RequestStatus.CANCELLED
    assert await ledger.balance(db_async, actor.id, "VACATION") == before
    assert not await db_async.scalar(
        select(LeaveBalanceEvent.id).where(
            LeaveBalanceEvent.related_leave_request_id == leave.id
        )
    )
