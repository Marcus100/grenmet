from datetime import date, datetime
from decimal import Decimal

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException
from src.hr.attendance import service
from src.hr.attendance.models import AttendanceCorrection, AttendanceRecord
from src.hr.attendance.router import read_week
from src.hr.attendance.schemas import AttendanceCorrectionCreate, AttendanceSave
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)
from tests.utils.user import user_authentication_headers_async


async def setup_shift(db: AsyncSession) -> tuple[User, RosterAssignment]:
    department = await make_department(db)
    employee = await make_user(db)
    role, _ = await make_role_with_permission(db, "timesheet.submit.self")
    await assign_role(db, user=employee, role=role)
    await make_submission_setup(db, employee, department.id, WorkflowType.TIMESHEET)
    if await db.get(ShiftCatalog, "N") is None:
        db.add(
            ShiftCatalog(
                code="N",
                label="Night",
                category=ShiftCategory.WORK,
                start_time="22:00",
                end_time="06:00",
                ends_next_day=True,
            )
        )
    period = RosterPeriod(
        created_by_user_id=employee.id,
        department_id=department.id,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        status=RosterPeriodStatus.PUBLISHED,
    )
    db.add(period)
    await db.flush()
    assignment = RosterAssignment(
        roster_period_id=period.id,
        user_id=employee.id,
        assignment_date=date(2026, 9, 26),
        shift_code="N",
    )
    db.add(assignment)
    await db.commit()
    return employee, assignment


def payload(assignment: RosterAssignment, **changes: object) -> AttendanceSave:
    data = {
        "roster_assignment_id": assignment.id,
        "arrived_at": "2026-09-26T22:00:00-04:00",
        "departed_at": "2026-09-27T06:00:00-04:00",
        "break_minutes": 30,
        **changes,
    }
    return AttendanceSave.model_validate(data)


async def test_shift_records_actuals_and_retry_is_idempotent(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    saved = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    repeated = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    assert repeated.id == saved.id
    assert (
        await db_async.scalar(select(func.count()).select_from(AttendanceRecord)) == 1
    )
    assert saved.arrived_at == datetime(2026, 9, 27, 2)
    assert service.elapsed_hours(saved) == Decimal("8.00")
    assert service.actual_hours(saved) == Decimal("7.50")
    week = await read_week(
        session=db_async, current_user=employee, day=date(2026, 9, 26)
    )
    assert (week.period_start, week.period_end) == (
        date(2026, 9, 20),
        date(2026, 9, 26),
    )
    assert week.shifts[0].shift_date == date(2026, 9, 26)
    assert week.recorded_hours == Decimal("7.50")
    assert week.approved_hours == 0
    next_week = await read_week(
        session=db_async, current_user=employee, day=date(2026, 9, 27)
    )
    assert next_week.shifts == []


async def test_submit_and_supervisor_approval_once(db_async: AsyncSession) -> None:
    employee, assignment = await setup_shift(db_async)
    saved = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    submitted = await service.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        expected_revision=1,
    )
    repeated = await service.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        expected_revision=1,
    )
    assert repeated.workflow_instance_id == submitted.workflow_instance_id
    assert (
        await db_async.scalar(select(func.count()).select_from(WorkflowInstance)) == 1
    )
    supervisor = await make_user(db_async, superuser=True)
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=submitted.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    week = await read_week(
        session=db_async, current_user=employee, day=date(2026, 9, 26)
    )
    assert week.shifts[0].review_status == WorkflowStatus.APPROVED
    assert week.shifts[0].reviewer_name == supervisor.full_name
    assert week.shifts[0].reviewed_at is not None
    assert week.approved_hours == Decimal("7.50")
    with pytest.raises(AppException):
        await service.save_attendance(
            session=db_async,
            current_user=employee,
            payload=payload(assignment, expected_revision=1, break_minutes=15),
        )


async def test_approved_correction_preserves_original_until_review(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    saved = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    await service.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        expected_revision=1,
    )
    supervisor = await make_user(db_async, superuser=True)
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=saved.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    correction_payload = AttendanceCorrectionCreate.model_validate(
        {
            **payload(
                assignment, expected_revision=1, departed_at="2026-09-27T05:30:00-04:00"
            ).model_dump(),
            "reason": "Forgot to record departure at the time",
        }
    )
    correction = await service.propose_correction(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        payload=correction_payload,
    )
    retry = await service.propose_correction(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        payload=correction_payload,
    )
    assert retry.id == correction.id
    assert saved.departed_at == datetime(2026, 9, 27, 10)
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=correction.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    assert saved.departed_at == datetime(2026, 9, 27, 9, 30)
    assert saved.revision == 2
    assert service.actual_hours(saved) == Decimal("7.00")
    assert (
        await db_async.scalar(select(func.count()).select_from(AttendanceCorrection))
        == 1
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"departed_at": "2026-09-26T21:59:00-04:00"},
        {"break_minutes": 480},
        {"arrived_at": "2026-09-24T22:00:00-04:00"},
        {"arrived_at": "2030-09-26T22:00:00-04:00"},
    ],
)
async def test_invalid_times_rejected(
    db_async: AsyncSession, changes: dict[str, object]
) -> None:
    employee, assignment = await setup_shift(db_async)
    with pytest.raises(AppException):
        await service.save_attendance(
            session=db_async,
            current_user=employee,
            payload=payload(assignment, **changes),
        )
    assert (
        await db_async.scalar(select(func.count()).select_from(AttendanceRecord)) == 0
    )


def test_timezone_required() -> None:
    with pytest.raises(ValidationError, match="timezone offset"):
        AttendanceSave(
            roster_assignment_id="11111111-1111-4111-8111-111111111111",
            arrived_at=datetime(2026, 9, 26, 22),
        )


async def test_other_employee_cannot_punch_or_read_department(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    outsider = await make_user(db_async)
    with pytest.raises(AppException):
        await service.save_attendance(
            session=db_async, current_user=outsider, payload=payload(assignment)
        )
    own = await read_week(
        session=db_async, current_user=outsider, day=date(2026, 9, 26)
    )
    assert own.shifts == []
    employment = (
        await service.week_rows(
            session=db_async, current_user=employee, day=date(2026, 9, 26)
        )
    )[2][0][1]
    with pytest.raises(AppException):
        await read_week(
            session=db_async,
            current_user=outsider,
            day=date(2026, 9, 26),
            department_id=employment.department_id,
        )


async def test_authenticated_api_persistence_review_and_pdf(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    employee, assignment = await setup_shift(db_async)
    body = payload(assignment).model_dump(mode="json")
    assert (
        await async_client.put("/api/v1/hr/attendance", json=body)
    ).status_code == 401
    headers = await user_authentication_headers_async(
        client=async_client, email=employee.email, password="password123"
    )
    saved = await async_client.put("/api/v1/hr/attendance", json=body, headers=headers)
    assert saved.status_code == 200, saved.text
    attendance_id = saved.json()["attendance_id"]
    reviewed = await async_client.get(
        "/api/v1/hr/attendance/review",
        params={"attendance_id": attendance_id},
        headers=headers,
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["current"]["arrived_at"] == "2026-09-27T02:00:00Z"
    assert reviewed.json()["current"]["actual_hours"] == "7.50"
    pdf = await async_client.get(
        "/api/v1/hr/attendance/week/pdf", params={"day": "2026-09-26"}, headers=headers
    )
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["cache-control"] == "private, no-store"
    assert pdf.content.startswith(b"%PDF")
    outsider = await make_user(db_async)
    outsider_headers = await user_authentication_headers_async(
        client=async_client, email=outsider.email, password="password123"
    )
    forbidden = await async_client.get(
        "/api/v1/hr/attendance/review",
        params={"attendance_id": attendance_id},
        headers=outsider_headers,
    )
    assert forbidden.status_code == 403


async def test_rejected_correction_never_changes_approved_hours(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    saved = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    await service.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        expected_revision=1,
    )
    supervisor = await make_user(db_async, superuser=True)
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=saved.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    correction = await service.propose_correction(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        payload=AttendanceCorrectionCreate.model_validate(
            {
                **payload(
                    assignment, expected_revision=1, break_minutes=15
                ).model_dump(),
                "reason": "Break time was entered incorrectly",
            }
        ),
    )
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=correction.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.REJECT),
    )
    assert saved.revision == 1
    assert saved.break_minutes == 30
    assert (
        await read_week(session=db_async, current_user=employee, day=date(2026, 9, 26))
    ).approved_hours == Decimal("7.50")


async def test_draft_punch_change_requires_reason_and_revision(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    record = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    with pytest.raises(AppException, match="Explain changes"):
        await service.save_attendance(
            session=db_async,
            current_user=employee,
            payload=payload(
                assignment, expected_revision=1, arrived_at="2026-09-26T22:05:00-04:00"
            ),
        )
    changed = await service.save_attendance(
        session=db_async,
        current_user=employee,
        payload=payload(
            assignment,
            expected_revision=1,
            arrived_at="2026-09-26T22:05:00-04:00",
            notes="Corrected arrival after checking the handover log",
        ),
    )
    assert changed.id == record.id
    assert changed.revision == 2
    assert changed.arrived_at == datetime(2026, 9, 27, 2, 5)


async def test_stale_revision_and_self_approval_blocked(db_async: AsyncSession) -> None:
    employee, assignment = await setup_shift(db_async)
    role, _ = await make_role_with_permission(db_async, "workflow.instance.action")
    await assign_role(db_async, user=employee, role=role)
    saved = await service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    with pytest.raises(AppException, match="reload"):
        await service.save_attendance(
            session=db_async,
            current_user=employee,
            payload=payload(assignment, break_minutes=15),
        )
    await service.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        expected_revision=1,
    )
    with pytest.raises(AppException):
        await workflow_service.apply_workflow_action(
            session=db_async,
            current_user=employee,
            workflow_instance_id=saved.workflow_instance_id,
            action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
        )
