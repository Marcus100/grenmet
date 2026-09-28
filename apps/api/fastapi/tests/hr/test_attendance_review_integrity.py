"""Scoped roster writes, historical access, terminal reviews and timing locks."""

import asyncio
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope
from src.exceptions import AppException
from src.hr.attendance import service as attendance
from src.hr.models import EmploymentRecord
from src.hr.roster import service as roster
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterCsvValidationRequest,
    RosterGridImportRequest,
    RosterPeriodCreate,
    ShiftCatalogUpdate,
)
from src.hr.timesheet.models import Timesheet, TimesheetEntry, TimesheetStatus
from src.hr.workflow import service as workflow
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.hr.test_attendance import payload, setup_shift


@pytest.mark.parametrize("key", ["timesheet.read.department", "timesheet.approve"])
async def test_self_grant_cannot_read_coworkers_attendance(
    db_async: AsyncSession, key: str
) -> None:
    employee, assignment = await setup_shift(db_async)
    record = await attendance.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    actor = await make_user(db_async)
    await make_employee(db_async, user=actor, department_id=record.department_id)
    role, _ = await make_role_with_permission(db_async, key)
    await assign_role(db_async, user=actor, role=role, scope=RoleAssignmentScope.SELF)
    with pytest.raises(AppException) as exc:
        await attendance.read_review(
            session=db_async,
            current_user=actor,
            attendance_id=record.id,
            correction_id=None,
        )
    assert exc.value.status_code == 403


async def test_roster_write_revision_and_import_scope(db_async: AsyncSession) -> None:
    dept_a, dept_b = await make_department(db_async), await make_department(db_async)
    manager = await make_user(db_async)
    role, _ = await make_role_with_permission(
        db_async, "roster.manage", "roster.view", "roster.import"
    )
    await assign_role(
        db_async,
        user=manager,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept_a.id,
    )
    period = RosterPeriod(
        department_id=dept_b.id,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        created_by_user_id=manager.id,
    )
    db_async.add(period)
    await db_async.commit()
    calls = [
        lambda: roster.create_roster_period(
            session=db_async,
            current_user=manager,
            period_in=RosterPeriodCreate(
                department_id=dept_b.id,
                period_start=date(2026, 10, 1),
                period_end=date(2026, 10, 31),
            ),
        ),
        lambda: roster.bulk_upsert_roster_assignments(
            session=db_async,
            current_user=manager,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id, assignments=[]
            ),
        ),
        lambda: roster.publish_roster_period(
            session=db_async, current_user=manager, period_id=period.id
        ),
        lambda: roster.close_roster_period(
            session=db_async, current_user=manager, period_id=period.id
        ),
        lambda: roster.list_roster_revisions(
            session=db_async, current_user=manager, period_id=period.id
        ),
        lambda: roster.import_roster_csv(
            session=db_async,
            current_user=manager,
            payload=RosterCsvValidationRequest(
                department_id=dept_b.id,
                roster_period_id=period.id,
                csv_text="user_id,assignment_date,shift_code\n",
            ),
        ),
        lambda: roster.import_roster_grid(
            session=db_async,
            current_user=manager,
            payload=RosterGridImportRequest(
                department_id=dept_b.id,
                period_start=period.period_start,
                period_end=period.period_end,
                csv_text="Name,1\n",
            ),
        ),
    ]
    for call in calls:
        with pytest.raises(AppException) as exc:
            await call()
        assert exc.value.status_code == 403
    assert period.status == RosterPeriodStatus.DRAFT
    assert not (await db_async.scalars(select(RosterAssignment))).all()


async def test_roster_rejects_cross_department_employee(db_async: AsyncSession) -> None:
    employee, assignment = await setup_shift(db_async)
    admin, other, dept = (
        await make_user(db_async, superuser=True),
        await make_user(db_async),
        await make_department(db_async),
    )
    await make_employee(db_async, user=other, department_id=dept.id)
    with pytest.raises(AppException, match="Every employee"):
        await roster.bulk_upsert_roster_assignments(
            session=db_async,
            current_user=admin,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=assignment.roster_period_id,
                assignments=[
                    RosterAssignmentInput(
                        user_id=other.id,
                        assignment_date=assignment.assignment_date,
                        shift_code="N",
                    )
                ],
            ),
        )
    assert assignment.user_id == employee.id


async def test_review_retains_historical_department_scope(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    saved = await attendance.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    dept_b = await make_department(db_async)
    managers = []
    for dept in (saved.department_id, dept_b.id):
        actor = await make_user(db_async)
        role, _ = await make_role_with_permission(
            db_async, "timesheet.read.department", "timesheet.approve"
        )
        await assign_role(
            db_async,
            user=actor,
            role=role,
            scope=RoleAssignmentScope.DEPARTMENT,
            department_id=dept,
        )
        managers.append(actor)
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert employment
    employment.department_id = dept_b.id
    await db_async.commit()
    with pytest.raises(AppException) as exc:
        await attendance.read_review(
            session=db_async,
            current_user=managers[1],
            attendance_id=saved.id,
            correction_id=None,
        )
    assert exc.value.status_code == 403
    for actor in (managers[0], employee):
        record, _ = await attendance.read_review(
            session=db_async,
            current_user=actor,
            attendance_id=saved.id,
            correction_id=None,
        )
        assert record.id == saved.id


@pytest.mark.parametrize(
    "status",
    [WorkflowStatus.RETURNED, WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED],
)
@pytest.mark.parametrize("save_first", [True, False])
async def test_identical_terminal_attendance_opens_fresh_review(
    db_async: AsyncSession, status: WorkflowStatus, save_first: bool
) -> None:
    employee, assignment = await setup_shift(db_async)
    record = await attendance.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    await attendance.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=record.id,
        expected_revision=1,
    )
    old_id = record.workflow_instance_id
    old = await db_async.get(WorkflowInstance, old_id)
    assert old
    old.status = status
    before = list(
        await db_async.scalars(
            select(WorkflowStepInstance.id).where(
                WorkflowStepInstance.workflow_instance_id == old_id
            )
        )
    )
    await db_async.commit()
    if save_first:
        await attendance.save_attendance(
            session=db_async,
            current_user=employee,
            payload=payload(assignment, expected_revision=1),
        )
        assert record.workflow_instance_id is None
        assert record.revision == 2
    await attendance.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=record.id,
        expected_revision=record.revision,
    )
    assert record.revision == 2
    assert record.workflow_instance_id != old_id
    assert (
        await db_async.get(WorkflowInstance, record.workflow_instance_id)
    ).status == WorkflowStatus.PENDING
    assert old.status == status
    assert (
        list(
            await db_async.scalars(
                select(WorkflowStepInstance.id).where(
                    WorkflowStepInstance.workflow_instance_id == old_id
                )
            )
        )
        == before
    )
    latest = record.workflow_instance_id
    await attendance.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=record.id,
        expected_revision=2,
    )
    assert record.workflow_instance_id == latest


@pytest.mark.parametrize("entity_type", ["attendance", "attendance_correction"])
async def test_generic_submit_preserves_terminal_review(
    db_async: AsyncSession, entity_type: str
) -> None:
    employee, assignment = await setup_shift(db_async)
    record = await attendance.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    await attendance.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=record.id,
        expected_revision=1,
    )
    instance = await db_async.get(WorkflowInstance, record.workflow_instance_id)
    assert instance
    instance.status, instance.entity_type = WorkflowStatus.RETURNED, entity_type
    await db_async.commit()
    actor = await make_user(db_async, superuser=True)
    before = list(
        await db_async.scalars(
            select(WorkflowStepInstance.id).where(
                WorkflowStepInstance.workflow_instance_id == instance.id
            )
        )
    )
    with pytest.raises(AppException, match="Submit through the form"):
        await workflow.apply_workflow_action(
            session=db_async,
            current_user=actor,
            workflow_instance_id=instance.id,
            action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
        )
    assert instance.status == WorkflowStatus.RETURNED
    assert (
        list(
            await db_async.scalars(
                select(WorkflowStepInstance.id).where(
                    WorkflowStepInstance.workflow_instance_id == instance.id
                )
            )
        )
        == before
    )


@pytest.mark.parametrize(
    "status,hours,linked",
    [
        (TimesheetStatus.DRAFT, Decimal("8"), False),
        (TimesheetStatus.SUBMITTED, Decimal("0"), True),
        (TimesheetStatus.APPROVED, Decimal("0"), False),
    ],
)
async def test_legacy_timesheet_protects_roster_catalogue_and_import(
    db_async: AsyncSession, status: TimesheetStatus, hours: Decimal, linked: bool
) -> None:
    employee, assignment = await setup_shift(db_async)
    period = await db_async.get(RosterPeriod, assignment.roster_period_id)
    assert period
    admin = await make_user(db_async, superuser=True)
    sheet = Timesheet(
        user_id=employee.id,
        department_id=period.department_id,
        period_start=period.period_start,
        period_end=period.period_end,
        status=status,
    )
    db_async.add(sheet)
    await db_async.flush()
    db_async.add(
        TimesheetEntry(
            timesheet_id=sheet.id,
            entry_date=assignment.assignment_date,
            shift_code="N",
            roster_assignment_id=assignment.id if linked else None,
            actual_hours=hours,
        )
    )
    if not await db_async.get(ShiftCatalog, "R"):
        db_async.add(ShiftCatalog(code="R", label="Rest", category=ShiftCategory.OFF))
    await db_async.commit()
    with pytest.raises(AppException, match="Recorded"):
        await roster.bulk_upsert_roster_assignments(
            session=db_async,
            current_user=admin,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id,
                assignments=[
                    RosterAssignmentInput(
                        user_id=employee.id,
                        assignment_date=assignment.assignment_date,
                        shift_code="R",
                    )
                ],
            ),
        )
    with pytest.raises(AppException, match="Recorded attendance"):
        await roster.update_shift(
            session=db_async,
            current_user=admin,
            code="N",
            shift_in=ShiftCatalogUpdate(start_time="23:00"),
        )
    with pytest.raises(AppException, match="Recorded"):
        await roster.import_roster_csv(
            session=db_async,
            current_user=admin,
            payload=RosterCsvValidationRequest(
                department_id=period.department_id,
                roster_period_id=period.id,
                csv_text=f"user_id,assignment_date,shift_code\n{employee.id},{assignment.assignment_date},R\n",
            ),
        )
    with pytest.raises(AppException, match="Recorded"):
        await roster.import_roster_grid(
            session=db_async,
            current_user=admin,
            payload=RosterGridImportRequest(
                department_id=period.department_id,
                period_start=period.period_start,
                period_end=period.period_end,
                csv_text=f"name,{assignment.assignment_date.day}\n{employee.username},R\n",
            ),
        )
    assert assignment.shift_code == "N"


async def test_csv_import_preserves_assignment_id(db_async: AsyncSession) -> None:
    employee, assignment = await setup_shift(db_async)
    period = await db_async.get(RosterPeriod, assignment.roster_period_id)
    assert period
    admin = await make_user(db_async, superuser=True)
    await attendance.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    original = assignment.id
    body = RosterCsvValidationRequest(
        department_id=period.department_id,
        roster_period_id=period.id,
        csv_text=f"user_id,assignment_date,shift_code\n{employee.id},{assignment.assignment_date},N\n",
    )
    for _ in range(2):
        await roster.import_roster_csv(
            session=db_async, current_user=admin, payload=body
        )
    rows = list(
        await db_async.scalars(
            select(RosterAssignment).where(RosterAssignment.user_id == employee.id)
        )
    )
    assert [row.id for row in rows] == [original]


async def test_waiting_punch_rereads_committed_catalogue(
    db_async: AsyncSession,
) -> None:
    employee, assignment = await setup_shift(db_async)
    cached = await db_async.get(ShiftCatalog, "N")
    assert cached and cached.category == ShiftCategory.WORK
    async with AsyncSession(bind=db_async.bind, expire_on_commit=False) as editing:
        shift = await editing.scalar(
            select(ShiftCatalog).where(ShiftCatalog.code == "N").with_for_update()
        )
        task = asyncio.create_task(
            attendance.save_attendance(
                session=db_async, current_user=employee, payload=payload(assignment)
            )
        )
        try:
            await asyncio.sleep(0.1)
            assert not task.done()
            assert shift
            shift.category = ShiftCategory.OFF
            await editing.commit()
            with pytest.raises(AppException, match="published work shift"):
                await asyncio.wait_for(task, 10)
            assert cached.category == ShiftCategory.OFF
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)


async def test_new_assignment_waits_for_catalogue_edit(db_async: AsyncSession) -> None:
    employee, assignment = await setup_shift(db_async)
    admin = await make_user(db_async, superuser=True)
    async with AsyncSession(bind=db_async.bind, expire_on_commit=False) as editing:
        shift = await editing.scalar(
            select(ShiftCatalog).where(ShiftCatalog.code == "N").with_for_update()
        )
        task = asyncio.create_task(
            roster.bulk_upsert_roster_assignments(
                session=db_async,
                current_user=admin,
                payload=RosterAssignmentBulkCreate(
                    roster_period_id=assignment.roster_period_id,
                    assignments=[
                        RosterAssignmentInput(
                            user_id=employee.id,
                            assignment_date=date(2026, 9, 25),
                            shift_code="N",
                        )
                    ],
                ),
            )
        )
        try:
            await asyncio.sleep(0.1)
            assert not task.done()
            assert shift
            shift.category = ShiftCategory.OFF
            await editing.commit()
            rows = await asyncio.wait_for(task, 10)
            created = next(
                row for row in rows if row.assignment_date == date(2026, 9, 25)
            )
            with pytest.raises(AppException, match="published work shift"):
                await attendance.save_attendance(
                    session=db_async,
                    current_user=employee,
                    payload=payload(
                        created,
                        arrived_at="2026-09-25T22:00:00-04:00",
                        departed_at="2026-09-26T06:00:00-04:00",
                    ),
                )
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
