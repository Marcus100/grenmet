import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Response, status
from fastapi.concurrency import run_in_threadpool

from src.dependencies import CurrentUser, SessionDep
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterAvailability
from src.hr.workflow.models import WorkflowStatus

from . import pdf, service
from .models import AttendanceRecord
from .schemas import (
    AttendanceCorrectionCreate,
    AttendanceCorrectionPublic,
    AttendanceReviewPublic,
    AttendanceSave,
    AttendanceShiftPublic,
    AttendanceSubmit,
    AttendanceWeekPublic,
)

router = APIRouter(prefix="/hr/attendance", tags=["hr-attendance"])
ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"description": "Invalid attendance or roster context"},
    403: {"description": "Employee or department access denied"},
    404: {"description": "Record not found"},
    409: {
        "description": "Stale revision, locked review, or approval workflow not configured"
    },
}


@router.get(
    "/week/pdf",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Download weekly shift timesheet PDF",
    description="Python-rendered weekly attendance collection using the same authenticated scope as the weekly read. Shows actual times and supervisor review; approved total excludes unapproved records. No payroll inference or signed-document creation.",
    operation_id="hrGetAttendanceWeekPdf",
    responses={
        **ERRORS,
        200: {
            "description": "Weekly timesheet PDF",
            "content": {
                "application/pdf": {"schema": {"type": "string", "format": "binary"}}
            },
        },
    },
)
async def read_week_pdf(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    day: date,
    department_id: str | None = None,
) -> Response:
    week = await read_week(
        session=session, current_user=current_user, day=day, department_id=department_id
    )
    document = await run_in_threadpool(pdf.render_week_pdf, week)
    return Response(
        document,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'inline; filename="timesheet-{week.period_start}.pdf"',
        },
    )


@router.get(
    "/review",
    response_model=AttendanceReviewPublic,
    status_code=status.HTTP_200_OK,
    summary="Read attendance and correction history for review",
    description="Owner, scoped timesheet reader/approver or named approver can inspect actual times and retained correction proposals. Supply attendance_id or correction_id.",
    operation_id="hrGetAttendanceReview",
    responses=ERRORS,
)
async def read_review(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    attendance_id: uuid.UUID | None = None,
    correction_id: uuid.UUID | None = None,
) -> AttendanceReviewPublic:
    record, corrections = await service.read_review(
        session=session,
        current_user=current_user,
        attendance_id=attendance_id,
        correction_id=correction_id,
    )
    return AttendanceReviewPublic(
        current=await public_record(session, record),
        corrections=[
            AttendanceCorrectionPublic.model_validate(
                correction, from_attributes=True
            ).model_copy(update={"review_status": review_status})
            for correction, review_status in corrections
        ],
    )


@router.get(
    "/week",
    response_model=AttendanceWeekPublic,
    status_code=status.HTTP_200_OK,
    summary="Read shift attendance for a GAA week",
    description="Returns published roster work shifts and actual attendance, Sunday through Saturday. A night shift belongs to its local scheduled start date. Department reads require scoped timesheet.read.department.",
    operation_id="hrGetAttendanceWeek",
    responses=ERRORS,
)
async def read_week(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    day: date,
    department_id: str | None = None,
) -> AttendanceWeekPublic:
    start, end, rows = await service.week_rows(
        session=session, current_user=current_user, day=day, department_id=department_id
    )
    reviewers = await service.review_metadata(
        session,
        [
            workflow.id
            for _, _, _, _, _, workflow in rows
            if workflow and workflow.status == WorkflowStatus.APPROVED
        ],
    )
    shifts: list[AttendanceShiftPublic] = []
    availability = await roster_service.assignment_availability(
        session, [assignment.id for assignment, _, _, _, _, _ in rows]
    )
    recorded = Decimal("0.00")
    approved = Decimal("0.00")
    for assignment, period, shift, employee, record, workflow in rows:
        scheduled_start, scheduled_end = service.scheduled_bounds(assignment, shift)
        hours = service.actual_hours(record) if record else None
        if hours is not None:
            recorded += hours
            if workflow and workflow.status == WorkflowStatus.APPROVED:
                approved += hours
        shifts.append(
            AttendanceShiftPublic(
                roster_assignment_id=assignment.id,
                user_id=assignment.user_id,
                employee_name=employee.full_name or employee.email,
                department_id=period.department_id,
                shift_date=assignment.assignment_date,
                shift_code=assignment.shift_code,
                availability=availability.get(
                    assignment.id, RosterAvailability.SCHEDULED
                ),
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
                attendance_id=record.id if record else None,
                arrived_at=record.arrived_at if record else None,
                departed_at=record.departed_at if record else None,
                break_minutes=record.break_minutes if record else 0,
                actual_hours=hours,
                elapsed_hours=service.elapsed_hours(record) if record else None,
                revision=record.revision if record else 0,
                notes=record.notes if record else None,
                workflow_instance_id=record.workflow_instance_id if record else None,
                review_status=workflow.status if workflow else None,
                reviewer_name=reviewers[workflow.id][0]
                if workflow and workflow.id in reviewers
                else None,
                reviewed_at=reviewers[workflow.id][1]
                if workflow and workflow.id in reviewers
                else None,
            )
        )
    return AttendanceWeekPublic(
        period_start=start,
        period_end=end,
        shifts=shifts,
        approved_hours=approved,
        recorded_hours=recorded,
    )


@router.put(
    "",
    response_model=AttendanceShiftPublic,
    status_code=status.HTTP_200_OK,
    summary="Save employee arrival and departure",
    description="Records actual attendance against a published work shift. Uses existing self/proxy timesheet permissions. Identical retries are idempotent; changed records require their latest revision.",
    operation_id="hrSaveAttendance",
    responses=ERRORS,
)
async def save(
    *, session: SessionDep, current_user: CurrentUser, payload: AttendanceSave
) -> AttendanceShiftPublic:
    record = await service.save_attendance(
        session=session, current_user=current_user, payload=payload
    )
    return await public_record(session, record)


@router.post(
    "/{attendance_id}/submit",
    response_model=AttendanceShiftPublic,
    status_code=status.HTTP_200_OK,
    summary="Submit completed attendance for supervisor review",
    description="Starts the department TIMESHEET approval workflow for this completed shift. The employee cannot approve their own attendance; retries reuse the same workflow.",
    operation_id="hrSubmitAttendance",
    responses=ERRORS,
)
async def submit(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    attendance_id: uuid.UUID,
    payload: AttendanceSubmit,
) -> AttendanceShiftPublic:
    record = await service.submit_attendance(
        session=session,
        current_user=current_user,
        attendance_id=attendance_id,
        expected_revision=payload.expected_revision,
    )
    return await public_record(session, record)


async def public_record(
    session: SessionDep, record: AttendanceRecord
) -> AttendanceShiftPublic:
    from sqlalchemy import select

    from src.auth.models import User
    from src.hr.roster.models import RosterAssignment, RosterPeriod, ShiftCatalog
    from src.hr.workflow.models import WorkflowInstance

    assignment, period, shift, employee = (
        await session.execute(
            select(RosterAssignment, RosterPeriod, ShiftCatalog, User)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .join(User, User.id == RosterAssignment.user_id)
            .where(RosterAssignment.id == record.roster_assignment_id)
        )
    ).one()
    scheduled_start, scheduled_end = service.scheduled_bounds(assignment, shift)
    workflow = (
        await session.get(WorkflowInstance, record.workflow_instance_id)
        if record.workflow_instance_id
        else None
    )
    reviewers = await service.review_metadata(
        session,
        [workflow.id]
        if workflow and workflow.status == WorkflowStatus.APPROVED
        else [],
    )
    availability = await roster_service.assignment_availability(
        session, [assignment.id]
    )
    return AttendanceShiftPublic(
        roster_assignment_id=assignment.id,
        user_id=record.user_id,
        employee_name=employee.full_name or employee.email,
        department_id=record.department_id,
        shift_date=assignment.assignment_date,
        shift_code=assignment.shift_code,
        availability=availability.get(assignment.id, RosterAvailability.SCHEDULED),
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        attendance_id=record.id,
        arrived_at=record.arrived_at,
        departed_at=record.departed_at,
        break_minutes=record.break_minutes,
        actual_hours=service.actual_hours(record),
        elapsed_hours=service.elapsed_hours(record),
        revision=record.revision,
        notes=record.notes,
        workflow_instance_id=record.workflow_instance_id,
        review_status=workflow.status if workflow else None,
        reviewer_name=reviewers[workflow.id][0]
        if workflow and workflow.id in reviewers
        else None,
        reviewed_at=workflow.resolved_at
        if workflow and workflow.status == WorkflowStatus.APPROVED
        else None,
    )


@router.post(
    "/{attendance_id}/corrections",
    response_model=AttendanceCorrectionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Propose an attendance correction",
    description="Preserves original arrival/departure while a reasoned correction awaits the department TIMESHEET supervisor workflow. Approval atomically replaces actual time and advances the revision; rejected proposals do not change hours.",
    operation_id="hrProposeAttendanceCorrection",
    responses=ERRORS,
)
async def correct(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    attendance_id: uuid.UUID,
    payload: AttendanceCorrectionCreate,
) -> AttendanceCorrectionPublic:
    correction = await service.propose_correction(
        session=session,
        current_user=current_user,
        attendance_id=attendance_id,
        payload=payload,
    )
    return AttendanceCorrectionPublic.model_validate(correction, from_attributes=True)
