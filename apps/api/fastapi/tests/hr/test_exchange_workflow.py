"""Real-database exchange consent, approval, conflict and reversal journeys."""

import json
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.exchange import service
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.exchange.schemas import ShiftSwapSubmit
from src.hr.models import RequestStatus
from src.hr.roster.models import RosterRevision
from src.hr.signatures.models import SignedDocument
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from src.hr.workflow.service import apply_workflow_action
from tests.factories import (
    assign_role,
    make_department,
    make_ready_staff,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)
from tests.hr.test_exchange_service import _payload, roster_for_exchange


async def test_saved_draft_edits_then_submits_with_resolved_signed_snapshot(
    db_async: AsyncSession,
):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    payload = _payload(counterpart.id, dept.id).model_copy(
        update={"as_draft": True, "reason": "Original"}
    )
    request = await service.create_shift_swap_request(
        session=db_async, current_user=requester, payload=payload
    )
    assert request.status == RequestStatus.DRAFT
    await service.update_shift_swap_request(
        session=db_async,
        current_user=requester,
        shift_swap_id=request.id,
        payload=payload.model_copy(update={"reason": "Updated reason"}),
    )
    from src.hr.signatures import service as signature_service
    from tests.hr.test_signatures import signature_data

    saved = await signature_service.save_signature(
        db_async, requester, signature_data()
    )
    await service.submit_shift_swap_request(
        session=db_async,
        current_user=requester,
        shift_swap_id=request.id,
        payload=ShiftSwapSubmit(signature_version=saved.version),
    )
    document = await db_async.scalar(
        select(SignedDocument).where(SignedDocument.entity_id == request.id)
    )
    snapshot = json.loads(document.snapshot)
    assert snapshot["form"]["employee_name"] == requester.full_name
    assert snapshot["form"]["counterpart_name"] == counterpart.full_name
    assert snapshot["form"]["department_name"] == dept.name
    assert snapshot["form"]["reason"] == "Updated reason"
    assert snapshot["signed_at"]
    assert document.pdf.startswith(b"%PDF")
    assert (
        await signature_service.get_document(db_async, counterpart, document.id)
        == document
    )
    outsider = await make_user(db_async)
    from src.exceptions import AppException

    with pytest.raises(AppException) as denied:
        await signature_service.get_document(db_async, outsider, document.id)
    assert denied.value.status_code == 403


async def setup_exchange(session):
    requester = await make_user(session)
    counterpart = await make_user(session)
    manager = await make_user(session, superuser=True)
    dept = await make_department(session)
    role, _ = await make_role_with_permission(session, "shift_swap.request.create.self")
    await assign_role(session, user=requester, role=role)
    await make_submission_setup(session, requester, dept.id, WorkflowType.SHIFT_SWAP)
    await make_ready_staff(session, counterpart, dept.id)
    for key in ["workflow.instance.action", "workflow.instance.view"]:
        role, _ = await make_role_with_permission(session, key)
        await assign_role(session, user=counterpart, role=role)
    rows = await roster_for_exchange(session, requester, counterpart, dept.id)
    return requester, counterpart, manager, dept, rows


async def action(session, user, request, value):
    return await apply_workflow_action(
        session=session,
        current_user=user,
        workflow_instance_id=request.workflow_instance_id,
        action_in=WorkflowActionRequest(action=value),
    )


async def test_mandatory_agreement_approval_changes_roster_once_and_cancellation_reverses(
    db_async: AsyncSession,
):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    request = await service.create_shift_swap_request(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    assert [row.shift_code for row in rows] == ["D", "O", "O", "N"]
    with pytest.raises(HRPermissionDeniedError):
        await action(db_async, manager, request, WorkflowAction.APPROVE)
    await action(db_async, counterpart, request, WorkflowAction.APPROVE)
    await db_async.refresh(request)
    assert request.counterpart_agreed and request.counterpart_agreed_at
    assert request.status == RequestStatus.SUBMITTED
    await action(db_async, manager, request, WorkflowAction.APPROVE)
    await db_async.refresh(request)
    assert request.status == RequestStatus.APPROVED
    for row in rows:
        await db_async.refresh(row)
    assert [row.shift_code for row in rows] == ["O", "D", "N", "O"]
    assert rows[2].assignment_date == date(2026, 7, 2)
    from src.hr.exchange import roster_effects

    await roster_effects.apply_exchange(db_async, request, manager.id)
    assert await db_async.scalar(select(func.count()).select_from(RosterRevision)) == 1
    await action(db_async, manager, request, WorkflowAction.CANCEL)
    await db_async.refresh(request)
    assert request.status == RequestStatus.CANCELLED
    for row in rows:
        await db_async.refresh(row)
    assert [row.shift_code for row in rows] == ["D", "O", "O", "N"]
    revisions = list(
        (
            await db_async.execute(
                select(RosterRevision).order_by(RosterRevision.revision_number)
            )
        ).scalars()
    )
    assert [row.snapshot["effect"] for row in revisions] == ["APPLIED", "REVERSED"]


@pytest.mark.parametrize(
    "decision", [WorkflowAction.REJECT, WorkflowAction.RETURN, WorkflowAction.CANCEL]
)
async def test_unapproved_requests_never_change_roster(
    db_async: AsyncSession, decision
):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    request = await service.create_shift_swap_request(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    await action(db_async, counterpart, request, decision)
    for row in rows:
        await db_async.refresh(row)
    assert [row.shift_code for row in rows] == ["D", "O", "O", "N"]
    assert await db_async.scalar(select(func.count()).select_from(RosterRevision)) == 0


async def test_changed_roster_blocks_final_approval(db_async: AsyncSession):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    request = await service.create_shift_swap_request(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    await action(db_async, counterpart, request, WorkflowAction.APPROVE)
    rows[0].shift_code = "M"
    await db_async.commit()
    workflow_id = request.workflow_instance_id
    with pytest.raises(HRValidationError, match="roster changed"):
        await action(db_async, manager, request, WorkflowAction.APPROVE)
    await db_async.rollback()
    instance = await db_async.get(WorkflowInstance, workflow_id)
    assert instance.status == WorkflowStatus.PENDING


async def test_draft_scope_self_and_work_conflicts(db_async: AsyncSession):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    payload = _payload(requester.id, dept.id).model_copy(update={"as_draft": True})
    with pytest.raises(HRValidationError, match="another employee"):
        await service.create_shift_swap_request(
            session=db_async, current_user=requester, payload=payload
        )
    outsider = await make_user(db_async)
    with pytest.raises(HRValidationError, match="Co-approvers must"):
        await service.create_shift_swap_request(
            session=db_async,
            current_user=requester,
            payload=_payload(counterpart.id, dept.id).model_copy(
                update={"co_approver_user_ids": [outsider.id]}
            ),
        )
    with pytest.raises(HRValidationError, match="Both employees"):
        await service.create_shift_swap_request(
            session=db_async,
            current_user=requester,
            payload=_payload(outsider.id, dept.id).model_copy(
                update={"as_draft": True}
            ),
        )
    rows[1].shift_code = "E"
    await db_async.commit()
    with pytest.raises(HRValidationError, match="must be off"):
        await service.create_shift_swap_request(
            session=db_async,
            current_user=requester,
            payload=_payload(counterpart.id, dept.id),
        )


async def test_preview_resolves_names_and_creates_no_records(db_async: AsyncSession):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    before = await db_async.scalar(select(func.count()).select_from(ShiftSwapRequest))
    pdf = await service.preview_shift_swap_pdf(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    assert pdf.startswith(b"%PDF")
    assert (
        await db_async.scalar(select(func.count()).select_from(ShiftSwapRequest))
        == before
    )
    assert await db_async.scalar(select(func.count()).select_from(SignedDocument)) == 0


async def test_cancellation_refuses_to_overwrite_later_roster_edits(
    db_async: AsyncSession,
):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    request = await service.create_shift_swap_request(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    await action(db_async, counterpart, request, WorkflowAction.APPROVE)
    await action(db_async, manager, request, WorkflowAction.APPROVE)
    rows[1].shift_code = "M"
    await db_async.commit()
    with pytest.raises(HRValidationError, match="changed again"):
        await action(db_async, manager, request, WorkflowAction.CANCEL)
    await db_async.rollback()
    await db_async.refresh(rows[1])
    assert rows[1].shift_code == "M"


async def test_saturday_night_exchange_keeps_shift_start_date(db_async: AsyncSession):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    from src.hr.roster.expansion import expand_shift
    from src.hr.roster.models import RosterPeriod, ShiftCatalog

    period = await db_async.get(RosterPeriod, rows[0].roster_period_id)
    period.period_start, period.period_end = date(2026, 9, 1), date(2026, 9, 30)
    rows[0].assignment_date = rows[1].assignment_date = date(2026, 9, 26)
    rows[2].assignment_date = rows[3].assignment_date = date(2026, 9, 28)
    rows[0].shift_code, rows[3].shift_code = "N", "M"
    await db_async.commit()
    payload = _payload(counterpart.id, dept.id).model_copy(
        update={
            "source_date": date(2026, 9, 26),
            "source_shift_code": "N",
            "target_date": date(2026, 9, 28),
            "target_shift_code": "M",
        }
    )
    request = await service.create_shift_swap_request(
        session=db_async, current_user=requester, payload=payload
    )
    await action(db_async, counterpart, request, WorkflowAction.APPROVE)
    await action(db_async, manager, request, WorkflowAction.APPROVE)
    await db_async.refresh(rows[1])
    assert rows[1].shift_code == "N" and rows[1].assignment_date == date(2026, 9, 26)
    start, end = expand_shift(
        rows[1].assignment_date, await db_async.get(ShiftCatalog, "N")
    )
    assert start.date() == date(2026, 9, 26) and end.date() == date(2026, 9, 27)


async def test_actual_timesheet_hours_block_exchange(db_async: AsyncSession):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    from src.hr.timesheet.models import Timesheet, TimesheetEntry

    sheet = Timesheet(
        user_id=requester.id,
        department_id=dept.id,
        period_start=date(2026, 6, 28),
        period_end=date(2026, 7, 4),
    )
    db_async.add(sheet)
    await db_async.flush()
    db_async.add(
        TimesheetEntry(
            timesheet_id=sheet.id,
            entry_date=rows[0].assignment_date,
            actual_hours=8,
            roster_assignment_id=rows[0].id,
        )
    )
    await db_async.commit()
    request = await service.create_shift_swap_request(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    await action(db_async, counterpart, request, WorkflowAction.APPROVE)
    with pytest.raises(HRValidationError, match="Recorded or submitted work"):
        await action(db_async, manager, request, WorkflowAction.APPROVE)


async def test_preview_http_requires_real_authenticated_scoped_actor(
    db_async: AsyncSession, async_client
):
    from tests.utils.user import user_authentication_headers_async

    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    payload = _payload(counterpart.id, dept.id).model_dump(mode="json")
    path = "/api/v1/hr/shift-swaps/preview-pdf"
    assert (await async_client.post(path, json=payload)).status_code == 401
    headers = await user_authentication_headers_async(
        client=async_client, email=requester.email, password="password123"
    )
    response = await async_client.post(path, headers=headers, json=payload)
    assert (
        response.status_code == 200
        and response.headers["content-type"] == "application/pdf"
    )
    assert response.headers["cache-control"] == "private, no-store"
    assert response.content.startswith(b"%PDF")


async def test_exchange_rejects_overlap_with_previous_overnight_shift(
    db_async: AsyncSession,
):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    from src.hr.roster.models import RosterAssignment, ShiftCatalog

    day_shift = await db_async.get(ShiftCatalog, "D")
    day_shift.start_time = "05:30"
    db_async.add(
        RosterAssignment(
            roster_period_id=rows[0].roster_period_id,
            user_id=counterpart.id,
            assignment_date=date(2026, 6, 30),
            shift_code="N",
        )
    )
    await db_async.commit()
    with pytest.raises(HRValidationError, match="overlap another scheduled shift"):
        await service.create_shift_swap_request(
            session=db_async,
            current_user=requester,
            payload=_payload(counterpart.id, dept.id),
        )
