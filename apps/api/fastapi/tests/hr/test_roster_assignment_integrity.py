"""Roster saves must retain links held by timesheets and attendance."""

from datetime import date
from decimal import Decimal

import pytest

from src.hr.exceptions import HRValidationError
from src.hr.roster.models import RosterAssignment, RosterPeriod, RosterPeriodStatus
from src.hr.roster.schemas import RosterAssignmentBulkCreate, RosterAssignmentInput
from src.hr.roster.service import bulk_upsert_roster_assignments
from src.hr.timesheet.schemas import TimesheetCreate, TimesheetEntryInput
from src.hr.timesheet.service import create_timesheet
from tests.factories import make_user
from tests.hr.test_roster_availability import rostered_employee


async def test_repeated_roster_save_preserves_timesheet_assignment_link(db_async):
    employee, department, period, assignment = await rostered_employee(db_async)
    manager = await make_user(db_async, superuser=True)
    _, entries = await create_timesheet(
        session=db_async,
        current_user=employee,
        payload=TimesheetCreate(
            department_id=department.id,
            period_start=date(2026, 9, 20),
            period_end=date(2026, 9, 26),
            entries=[
                TimesheetEntryInput(
                    entry_date=assignment.assignment_date,
                    actual_hours=Decimal("0"),
                    break_hours=Decimal("0"),
                )
            ],
        ),
    )
    assignment_id = assignment.id
    assert entries[0].roster_assignment_id == assignment_id
    payload = RosterAssignmentBulkCreate(
        roster_period_id=period.id,
        assignments=[
            RosterAssignmentInput(
                user_id=employee.id,
                assignment_date=assignment.assignment_date,
                shift_code="N",
                remarks="Supervisor note",
            )
        ],
    )
    for _ in range(2):
        rows = await bulk_upsert_roster_assignments(
            session=db_async, current_user=manager, payload=payload
        )
        assert rows[0].id == assignment_id
        assert rows[0].remarks == "Supervisor note"
        await db_async.refresh(entries[0])
        assert entries[0].roster_assignment_id == assignment_id


async def test_overlapping_period_cannot_replace_an_existing_assignment(db_async):
    employee, department, period, assignment = await rostered_employee(db_async)
    manager = await make_user(db_async, superuser=True)
    other = RosterPeriod(
        department_id=department.id,
        period_start=period.period_start,
        period_end=period.period_end,
        created_by_user_id=manager.id,
    )
    db_async.add(other)
    await db_async.commit()
    with pytest.raises(HRValidationError, match="another roster period"):
        await bulk_upsert_roster_assignments(
            session=db_async,
            current_user=manager,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=other.id,
                assignments=[
                    RosterAssignmentInput(
                        user_id=employee.id,
                        assignment_date=assignment.assignment_date,
                        shift_code="N",
                    )
                ],
            ),
        )
    persisted = await db_async.get(RosterAssignment, assignment.id)
    assert persisted.roster_period_id == period.id


@pytest.mark.parametrize(
    "case", ["duplicate", "outside_period", "unknown_shift", "closed"]
)
async def test_invalid_assignment_batches_are_rejected_before_writing(db_async, case):
    employee, _, period, assignment = await rostered_employee(db_async)
    manager = await make_user(db_async, superuser=True)
    item = RosterAssignmentInput(
        user_id=employee.id,
        assignment_date=date(2026, 10, 1)
        if case == "outside_period"
        else assignment.assignment_date,
        shift_code="UNKNOWN" if case == "unknown_shift" else "N",
    )
    if case == "closed":
        period.status = RosterPeriodStatus.CLOSED
        await db_async.commit()
    with pytest.raises(HRValidationError):
        await bulk_upsert_roster_assignments(
            session=db_async,
            current_user=manager,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id,
                assignments=[item, item] if case == "duplicate" else [item],
            ),
        )
    assert assignment.shift_code == "N"
