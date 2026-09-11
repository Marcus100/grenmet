"""Dates come from submission, never draft creation or later approval."""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.leave import router
from src.hr.leave.models import LeaveRequest
from src.hr.leave.schemas import LeaveRequestSubmit
from src.hr.workflow.models import WorkflowInstance, WorkflowStatus
from src.pagination import PaginationParams
from tests.factories import make_department, make_ready_staff, make_user
from tests.hr.test_workflow import _leave_payload, _setup_leave_template


async def test_submission_date_survives_listing_and_approval(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    dept = await make_department(db_async, "submission_dates")
    await _setup_leave_template(db_async, dept.id)
    await make_ready_staff(db_async, user, dept.id)
    payload = _leave_payload(dept.id).model_copy(update={"as_draft": True})
    draft = await router.create_leave_request(
        session=db_async, current_user=user, payload=payload
    )
    assert draft.submitted_at is None
    row = await db_async.get(LeaveRequest, draft.id)
    assert row is not None
    row.created_at = datetime(2020, 1, 1)
    db_async.add(row)
    await db_async.commit()
    submitted = await router.submit_leave_request(
        session=db_async,
        current_user=user,
        leave_request=row,
        payload=LeaveRequestSubmit(),
    )
    assert submitted.submitted_at is not None
    assert submitted.submitted_at.year != 2020
    workflow = await db_async.get(WorkflowInstance, submitted.workflow_instance_id)
    assert workflow is not None
    assert submitted.submitted_at == workflow.submitted_at
    workflow.status = WorkflowStatus.APPROVED
    workflow.resolved_at = datetime(2030, 1, 1)
    db_async.add(workflow)
    await db_async.commit()
    listed = await router.read_my_leave_requests(db_async, user, PaginationParams())
    assert listed.data[0].submitted_at == submitted.submitted_at
    assert "submitted_at" in listed.model_dump(mode="json")["data"][0]


async def test_legacy_form_does_not_invent_submission_date(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, superuser=True)
    dept = await make_department(db_async, "legacy_submission_dates")
    await make_ready_staff(db_async, user, dept.id)
    from src.hr.models import RequestStatus

    created = LeaveRequest(
        user_id=user.id,
        status=RequestStatus.SUBMITTED,
        **_leave_payload(dept.id).model_dump(
            exclude={"as_draft", "co_approver_user_ids"}
        ),
    )
    db_async.add(created)
    await db_async.commit()
    assert created.status.value == "SUBMITTED"
    assert created.workflow_instance_id is None
    listed = await router.read_my_leave_requests(db_async, user, PaginationParams())
    assert listed.data[0].submitted_at is None
