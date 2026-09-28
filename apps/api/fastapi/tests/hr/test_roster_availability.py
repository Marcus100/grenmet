"""Approved exceptions are shared by the roster, calendar and timesheet API."""

import base64
import io
from datetime import date
from decimal import Decimal

import pytest
from PIL import Image

from src.hr.absentee import service as absentee_service
from src.hr.absentee.models import AbsenceReason, AbsenteeReport
from src.hr.absentee.schemas import AbsenteeReportCreate
from src.hr.leave.models import LeaveRequest, LeaveType
from src.hr.models import RequestStatus
from src.hr.roster import service as roster_service
from src.hr.roster.models import (
    RosterAssignment,
    RosterAvailability,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.signatures import service as signatures
from src.hr.timesheet import service as timesheet_service
from src.hr.timesheet.schemas import TimesheetCreate, TimesheetEntryInput
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import WorkflowAction, WorkflowStatus, WorkflowType
from src.hr.workflow.schemas import WorkflowActionRequest
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)
from tests.utils.user import user_authentication_headers_async


async def rostered_employee(session):
    employee = await make_user(session)
    department = await make_department(session)
    await make_employee(session, user=employee, department_id=department.id)
    role, _ = await make_role_with_permission(
        session, "absentee.report.create", "timesheet.submit.self", "roster.view"
    )
    await assign_role(session, user=employee, role=role)
    await make_submission_setup(
        session, employee, department.id, WorkflowType.ABSENTEE_REPORT
    )
    if await session.get(ShiftCatalog, "N") is None:
        session.add(
            ShiftCatalog(
                code="N",
                label="Night",
                category=ShiftCategory.WORK,
                start_time="22:30",
                end_time="06:00",
                ends_next_day=True,
            )
        )
    period = RosterPeriod(
        department_id=department.id,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        status=RosterPeriodStatus.PUBLISHED,
        created_by_user_id=employee.id,
    )
    session.add(period)
    await session.flush()
    assignment = RosterAssignment(
        roster_period_id=period.id,
        user_id=employee.id,
        assignment_date=date(2026, 9, 26),
        shift_code="N",
    )
    session.add(assignment)
    await session.commit()
    return employee, department, period, assignment


async def test_supervisor_approval_updates_roster_calendar_and_timesheet_reads(
    db_async, async_client
):
    employee, department, period, assignment = await rostered_employee(db_async)
    supervisor = await make_user(db_async, superuser=True)
    image = io.BytesIO()
    Image.new("RGB", (40, 20), "black").save(image, format="PNG")
    saved = await signatures.save_signature(
        db_async,
        employee,
        "data:image/png;base64," + base64.b64encode(image.getvalue()).decode(),
    )
    report = await absentee_service.create_absentee_report(
        session=db_async,
        current_user=employee,
        payload=AbsenteeReportCreate(
            user_id=employee.id,
            department_id=department.id,
            report_date=assignment.assignment_date,
            reason=AbsenceReason.UNCERTIFIED_SICK,
            notes="Called in sick",
            signature_version=saved.version,
        ),
    )
    assert report.expected_shift_code == "N"
    assert (await roster_service.assignment_availability(db_async, [assignment.id]))[
        assignment.id
    ] == RosterAvailability.SCHEDULED
    sheet, _ = await timesheet_service.create_timesheet(
        session=db_async,
        current_user=employee,
        payload=TimesheetCreate(
            department_id=department.id,
            period_start=date(2026, 9, 20),
            period_end=date(2026, 9, 26),
            entries=[TimesheetEntryInput(entry_date=assignment.assignment_date)],
        ),
    )
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=report.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    await db_async.refresh(report)
    assert report.status == RequestStatus.APPROVED
    headers = await user_authentication_headers_async(
        client=async_client, email=employee.email, password="password123"
    )
    grid = await async_client.get(
        f"/api/v1/hr/rosters/periods/{period.id}", headers=headers
    )
    assert grid.status_code == 200, grid.text
    row = grid.json()["assignments"][0]
    assert row["shift_code"] == "N" and row["availability"] == "ABSENT"
    assert "reason" not in row and "notes" not in row
    calendar = await async_client.get(
        "/api/v1/hr/rosters/assignments",
        headers=headers,
        params={"start": "2026-09-26", "end": "2026-09-26"},
    )
    assert calendar.status_code == 200, calendar.text
    event = calendar.json()["data"][0]
    assert event["availability"] == "ABSENT"
    assert event["starts_at_local"] == "2026-09-26T22:30:00"
    assert event["ends_at_local"] == "2026-09-27T06:00:00"
    details = await async_client.get(
        f"/api/v1/hr/timesheets/{sheet.id}", headers=headers
    )
    assert details.status_code == 200, details.text
    assert details.json()["entries"][0]["availability"] == "ABSENT"
    await db_async.refresh(assignment)
    assert assignment.shift_code == "N"


@pytest.mark.parametrize(
    "status,expected",
    [
        (RequestStatus.SUBMITTED, "SCHEDULED"),
        (RequestStatus.DRAFT, "SCHEDULED"),
        (RequestStatus.REJECTED, "SCHEDULED"),
        (RequestStatus.APPROVED, "ABSENT"),
    ],
)
async def test_only_approved_absence_changes_availability(db_async, status, expected):
    employee, department, _, assignment = await rostered_employee(db_async)
    db_async.add(
        AbsenteeReport(
            user_id=employee.id,
            department_id=department.id,
            report_date=assignment.assignment_date,
            reason=AbsenceReason.TIME_OFF,
            submitted_by_user_id=employee.id,
            status=status,
        )
    )
    await db_async.commit()
    availability = await roster_service.assignment_availability(
        db_async, [assignment.id]
    )
    assert availability[assignment.id].value == expected


async def test_partial_absence_is_not_a_full_shift_and_mismatched_shift_is_ignored(
    db_async,
):
    employee, department, _, assignment = await rostered_employee(db_async)
    report = AbsenteeReport(
        user_id=employee.id,
        department_id=department.id,
        report_date=assignment.assignment_date,
        reason=AbsenceReason.ILLNESS_ON_JOB,
        notes="Went home",
        submitted_by_user_id=employee.id,
        status=RequestStatus.APPROVED,
        expected_shift_code="N",
        absence_start_time="02:00",
        absence_end_time="06:00",
    )
    db_async.add(report)
    await db_async.commit()
    assert (await roster_service.assignment_availability(db_async, [assignment.id]))[
        assignment.id
    ] == RosterAvailability.PARTIAL_ABSENCE
    report.expected_shift_code = "M"
    await db_async.commit()
    assert (await roster_service.assignment_availability(db_async, [assignment.id]))[
        assignment.id
    ] == RosterAvailability.SCHEDULED


async def test_approved_leave_is_visible_without_mutating_the_scheduled_shift(db_async):
    employee, department, _, assignment = await rostered_employee(db_async)
    leave = LeaveRequest(
        user_id=employee.id,
        department_id=department.id,
        leave_type=LeaveType.VACATION,
        start_date=date(2026, 9, 25),
        end_date=date(2026, 9, 26),
        days_requested=Decimal("2"),
        status=RequestStatus.APPROVED,
    )
    db_async.add(leave)
    await db_async.commit()
    assert (await roster_service.assignment_availability(db_async, [assignment.id]))[
        assignment.id
    ] == RosterAvailability.LEAVE
    assert assignment.shift_code == "N"


async def test_cancelled_approval_is_not_an_active_exception(db_async):
    employee, department, _, assignment = await rostered_employee(db_async)
    payload = AbsenteeReportCreate(
        user_id=employee.id,
        department_id=department.id,
        report_date=assignment.assignment_date,
        reason=AbsenceReason.TIME_OFF,
        as_draft=True,
    )
    report = await absentee_service.create_absentee_report(
        session=db_async, current_user=employee, payload=payload
    )
    from src.hr.workflow.models import WorkflowInstance

    instance = await db_async.get(WorkflowInstance, report.workflow_instance_id)
    instance.status = WorkflowStatus.CANCELLED
    report.status = RequestStatus.APPROVED
    await db_async.commit()
    assert (await roster_service.assignment_availability(db_async, [assignment.id]))[
        assignment.id
    ] == RosterAvailability.SCHEDULED
