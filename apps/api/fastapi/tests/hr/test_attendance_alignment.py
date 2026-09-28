"""Actual attendance remains consistent with roster, status and exchange reads."""

from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from src.hr.absentee.models import AbsenceReason, AbsenteeReport
from src.hr.attendance import service as attendance_service
from src.hr.attendance.models import AttendanceRecord
from src.hr.attendance.router import read_week
from src.hr.attendance.schemas import AttendanceSave
from src.hr.dailystatus import service as status_service
from src.hr.dailystatus.models import PersonnelStatus
from src.hr.exceptions import HRValidationError
from src.hr.exchange import service as exchange_service
from src.hr.models import RequestStatus
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterAvailability, ShiftCatalog, ShiftCategory
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    ShiftCatalogUpdate,
)
from src.hr.workflow.models import WorkflowAction
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.hr.test_exchange_service import _payload
from tests.hr.test_exchange_workflow import action, setup_exchange
from tests.hr.test_roster_availability import rostered_employee


async def test_recorded_attendance_preserves_assignment_and_catalogue_history(db_async):
    employee, _, period, assignment = await rostered_employee(db_async)
    manager = await make_user(db_async, superuser=True)
    record = await attendance_service.save_attendance(
        session=db_async,
        current_user=employee,
        payload=AttendanceSave(
            roster_assignment_id=assignment.id,
            arrived_at="2026-09-26T22:30:00-04:00",
        ),
    )
    payload = RosterAssignmentBulkCreate(
        roster_period_id=period.id,
        assignments=[
            RosterAssignmentInput(
                user_id=employee.id,
                assignment_date=assignment.assignment_date,
                shift_code="N",
                remarks="Historical note",
            )
        ],
    )
    rows = await roster_service.bulk_upsert_roster_assignments(
        session=db_async, current_user=manager, payload=payload
    )
    assert rows[0].id == record.roster_assignment_id == assignment.id
    db_async.add(ShiftCatalog(code="O", label="Off", category=ShiftCategory.OFF))
    await db_async.commit()
    changed = payload.model_copy(
        update={
            "assignments": [
                payload.assignments[0].model_copy(update={"shift_code": "O"})
            ]
        }
    )
    with pytest.raises(HRValidationError, match="attendance"):
        await roster_service.bulk_upsert_roster_assignments(
            session=db_async, current_user=manager, payload=changed
        )
    for change in (
        {"start_time": "23:00"},
        {"end_time": "07:00"},
        {"ends_next_day": False},
        {"category": ShiftCategory.OFF},
    ):
        with pytest.raises(HRValidationError, match="attendance"):
            await roster_service.update_shift(
                session=db_async,
                current_user=manager,
                code="N",
                shift_in=ShiftCatalogUpdate(**change),
            )
    await roster_service.update_shift(
        session=db_async,
        current_user=manager,
        code="N",
        shift_in=ShiftCatalogUpdate(label="Night", is_active=False),
    )
    await db_async.refresh(assignment)
    await db_async.refresh(record)
    assert assignment.shift_code == "N"
    assert record.arrived_at == datetime(2026, 9, 27, 2, 30)


async def test_d_coverage_shares_actual_evidence_and_counts_hours_once(db_async):
    employee, department, _, assignment = await rostered_employee(db_async)
    manager = await make_user(db_async, superuser=True)
    db_async.add(
        ShiftCatalog(
            code="D",
            label="Day",
            category=ShiftCategory.WORK,
            start_time="08:00",
            end_time="16:00",
        )
    )
    await db_async.flush()
    assignment.shift_code = "D"
    await db_async.commit()
    record = await attendance_service.save_attendance(
        session=db_async,
        current_user=employee,
        payload=AttendanceSave(
            roster_assignment_id=assignment.id,
            arrived_at="2026-09-26T08:00:00-04:00",
            departed_at="2026-09-26T16:00:00-04:00",
            break_minutes=30,
            notes="Private attendance note",
        ),
    )
    for shift in ("M", "E"):
        staffing = await status_service.staffing_for_shift(
            session=db_async,
            actor=manager,
            department_id=department.id,
            report_date=date(2026, 9, 26),
            shift_code=shift,
        )
        row = staffing.entries[0]
        assert row.roster_assignment_id == assignment.id
        assert row.attendance_id == record.id
        assert row.arrived_at == datetime(2026, 9, 26, 12)
        assert row.departed_at == datetime(2026, 9, 26, 20)
        assert row.personnel_status == PersonnelStatus.UNCONFIRMED
        assert "Private attendance note" not in staffing.model_dump_json()
    week = await read_week(
        session=db_async, current_user=employee, day=date(2026, 9, 26)
    )
    assert len(week.shifts) == 1
    assert week.recorded_hours == Decimal("7.50")
    assert week.approved_hours == 0
    assert (
        await db_async.scalar(select(func.count()).select_from(AttendanceRecord)) == 1
    )


async def test_week_projects_approved_absence_without_inventing_hours(db_async):
    employee, department, _, assignment = await rostered_employee(db_async)
    report = AbsenteeReport(
        user_id=employee.id,
        department_id=department.id,
        report_date=assignment.assignment_date,
        expected_shift_code="N",
        submitted_by_user_id=employee.id,
        reason=AbsenceReason.UNCERTIFIED_SICK,
        notes="Private medical evidence",
        status=RequestStatus.APPROVED,
    )
    db_async.add(report)
    await db_async.commit()
    week = await read_week(
        session=db_async, current_user=employee, day=date(2026, 9, 26)
    )
    assert week.shifts[0].availability == RosterAvailability.ABSENT
    assert week.shifts[0].arrived_at is None
    assert week.recorded_hours == week.approved_hours == 0
    assert "Private medical evidence" not in week.model_dump_json()
    report.status = RequestStatus.CANCELLED
    await db_async.commit()
    week = await read_week(
        session=db_async, current_user=employee, day=date(2026, 9, 26)
    )
    assert week.shifts[0].availability == RosterAvailability.SCHEDULED


@pytest.mark.parametrize("after_approval", [False, True])
async def test_attendance_blocks_exchange_approval_and_reversal(
    db_async, after_approval
):
    requester, counterpart, manager, dept, rows = await setup_exchange(db_async)
    request = await exchange_service.create_shift_swap_request(
        session=db_async,
        current_user=requester,
        payload=_payload(counterpart.id, dept.id),
    )
    await action(db_async, counterpart, request, WorkflowAction.APPROVE)
    if after_approval:
        await action(db_async, manager, request, WorkflowAction.APPROVE)
        for row in rows:
            await db_async.refresh(row)
    row = rows[1] if after_approval else rows[0]
    owner = counterpart if after_approval else requester
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=owner, role=role)
    await attendance_service.save_attendance(
        session=db_async,
        current_user=owner,
        payload=AttendanceSave(
            roster_assignment_id=row.id,
            arrived_at="2026-07-01T08:00:00-04:00",
        ),
    )
    before = [item.shift_code for item in rows]
    with pytest.raises(HRValidationError, match="attendance"):
        await action(
            db_async,
            manager,
            request,
            WorkflowAction.CANCEL if after_approval else WorkflowAction.APPROVE,
        )
    for item in rows:
        await db_async.refresh(item)
    assert [item.shift_code for item in rows] == before
