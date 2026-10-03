from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from src.auth.models import RoleAssignmentScope
from src.exceptions import AppException
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.timesheet import service
from src.hr.timesheet.models import (
    DepartmentPolicy,
    SubmissionMode,
    Timesheet,
    TimesheetEntry,
    TimesheetStatus,
)
from src.hr.timesheet.schemas import TimesheetCreate, TimesheetEntryInput
from src.hr.workflow.models import (
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowTemplate,
    WorkflowType,
)
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.utils.user import authentication_token_from_email_async


def payload(department_id, **kwargs):
    return TimesheetCreate(
        department_id=department_id,
        period_start=date(2026, 9, 20),
        period_end=date(2026, 9, 26),
        **kwargs,
    )


@pytest.mark.parametrize("hours", [-1, 25, "NaN", "Infinity", "1.001"])
def test_invalid_recorded_hours(hours):
    with pytest.raises(ValidationError):
        TimesheetEntryInput(entry_date=date(2026, 9, 26), actual_hours=hours)


def test_invalid_dates_breaks_duplicates_and_net_hours():
    with pytest.raises(ValidationError):
        TimesheetEntryInput(entry_date=date(2026, 9, 26), actual_hours=4, break_hours=5)
    with pytest.raises(ValidationError):
        TimesheetEntryInput(
            entry_date=date(2026, 9, 26), actual_hours=8, break_hours=1, hours_worked=8
        )
    with pytest.raises(ValidationError):
        payload("gms", entries=[{"entry_date": "2026-09-27"}])
    with pytest.raises(ValidationError):
        payload(
            "gms", entries=[{"entry_date": "2026-09-26"}, {"entry_date": "2026-09-26"}]
        )
    with pytest.raises(ValidationError):
        TimesheetCreate(
            department_id="gms",
            period_start=date(2026, 9, 26),
            period_end=date(2026, 9, 20),
        )


async def test_denied_create_has_no_policy_or_partial_timesheet(db_async):
    department = await make_department(db_async, "integrity_dept")
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    with pytest.raises(AppException):
        await service.create_timesheet(
            session=db_async, current_user=user, payload=payload(department.id)
        )
    assert (
        await db_async.scalar(select(func.count()).select_from(DepartmentPolicy)) == 0
    )
    assert await db_async.scalar(select(func.count()).select_from(Timesheet)) == 0
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=user, role=role)
    other = await make_department(db_async, "integrity_other")
    with pytest.raises(AppException):
        await service.create_timesheet(
            session=db_async, current_user=user, payload=payload(other.id)
        )
    assert (
        await db_async.scalar(select(func.count()).select_from(DepartmentPolicy)) == 0
    )


async def test_department_reader_cannot_list_another_department(db_async):
    department = await make_department(db_async, "integrity_read")
    other = await make_department(db_async, "integrity_read_other")
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.read.department")
    await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )
    assert await service.list_department_timesheets(
        session=db_async, current_user=user, department_id=department.id
    ) == ([], 0)
    with pytest.raises(AppException):
        await service.list_department_timesheets(
            session=db_async, current_user=user, department_id=other.id
        )


async def test_published_roster_linking_and_atomic_failure(db_async):
    department = await make_department(db_async, "integrity_roster")
    user = await make_user(db_async, superuser=True)
    await make_employee(db_async, user=user, department_id=department.id)
    db_async.add_all(
        [
            ShiftCatalog(code="M", label="Morning", category=ShiftCategory.WORK),
            ShiftCatalog(code="N", label="Night", category=ShiftCategory.WORK),
        ]
    )
    period = RosterPeriod(
        department_id=department.id,
        period_start=date(2026, 9, 20),
        period_end=date(2026, 9, 26),
        created_by_user_id=user.id,
    )
    db_async.add(period)
    await db_async.flush()
    assignment = RosterAssignment(
        user_id=user.id,
        roster_period_id=period.id,
        assignment_date=date(2026, 9, 26),
        shift_code="N",
    )
    db_async.add(assignment)
    await db_async.commit()
    _, draft_entries = await service.create_timesheet(
        session=db_async,
        current_user=user,
        payload=payload(
            department.id,
            entries=[{"entry_date": "2026-09-26", "actual_hours": 8, "break_hours": 1}],
        ),
    )
    assert draft_entries[0].roster_assignment_id is None
    period.status = RosterPeriodStatus.PUBLISHED
    other_department = await make_department(db_async, "integrity_roster_other")
    period.department_id = other_department.id
    await db_async.commit()
    _, foreign_entries = await service.create_timesheet(
        session=db_async,
        current_user=user,
        payload=payload(
            department.id,
            entries=[{"entry_date": "2026-09-26", "actual_hours": 8, "break_hours": 1}],
        ),
    )
    assert foreign_entries[0].roster_assignment_id is None
    period.department_id = department.id
    await db_async.commit()
    _, entries = await service.create_timesheet(
        session=db_async,
        current_user=user,
        payload=payload(
            department.id,
            entries=[{"entry_date": "2026-09-26", "actual_hours": 8, "break_hours": 1}],
        ),
    )
    assert entries[0].roster_assignment_id == assignment.id
    assert entries[0].shift_code == "N" and entries[0].hours_worked == Decimal("7")
    draft_id, entry_id = entries[0].timesheet_id, entries[0].id
    count = await db_async.scalar(select(func.count()).select_from(Timesheet))
    with pytest.raises(AppException):
        await service.create_timesheet(
            session=db_async,
            current_user=user,
            payload=payload(
                department.id, entries=[{"entry_date": "2026-09-26", "shift_code": "M"}]
            ),
        )
    await db_async.rollback()
    assert await db_async.scalar(select(func.count()).select_from(Timesheet)) == count
    # Previously persisted invalid drafts cannot bypass current submission validation.
    await db_async.refresh(user)
    draft = await db_async.get(Timesheet, draft_id)
    row = await db_async.get(TimesheetEntry, entry_id)
    row.actual_hours = -1
    await db_async.commit()
    with pytest.raises(AppException, match="Correct invalid"):
        await service.submit_timesheet(
            session=db_async,
            current_user=user,
            timesheet_id=draft.id,
            submission_mode=SubmissionMode.SELF,
        )


@pytest.mark.parametrize(
    "mismatch", ["department", "employee", "date", "shift", "draft"]
)
async def test_stored_draft_roster_links_are_revalidated(db_async, mismatch):
    department = await make_department(db_async, "integrity_stored")
    user = await make_user(db_async, superuser=True)
    await make_employee(db_async, user=user, department_id=department.id)
    db_async.add_all(
        [
            ShiftCatalog(code="M", label="Morning", category=ShiftCategory.WORK),
            ShiftCatalog(code="N", label="Night", category=ShiftCategory.WORK),
        ]
    )
    period = RosterPeriod(
        department_id=department.id,
        period_start=date(2026, 9, 20),
        period_end=date(2026, 9, 26),
        status=RosterPeriodStatus.PUBLISHED,
        created_by_user_id=user.id,
    )
    db_async.add(period)
    await db_async.flush()
    assignment = RosterAssignment(
        user_id=user.id,
        roster_period_id=period.id,
        assignment_date=date(2026, 9, 26),
        shift_code="N",
    )
    db_async.add(assignment)
    await db_async.commit()
    draft, entries = await service.create_timesheet(
        session=db_async,
        current_user=user,
        payload=payload(department.id, entries=[{"entry_date": "2026-09-26"}]),
    )
    if mismatch == "department":
        other = await make_department(db_async, "integrity_stored_other")
        period.department_id = other.id
    elif mismatch == "employee":
        other_user = await make_user(db_async)
        assignment.user_id = other_user.id
    elif mismatch == "date":
        assignment.assignment_date = date(2026, 9, 25)
    elif mismatch == "shift":
        entries[0].shift_code = "M"
    else:
        period.status = RosterPeriodStatus.DRAFT
    await db_async.commit()
    with pytest.raises(AppException, match="Correct the roster"):
        await service.submit_timesheet(
            session=db_async,
            current_user=user,
            timesheet_id=draft.id,
            submission_mode=SubmissionMode.SELF,
        )
    assert draft.status == TimesheetStatus.DRAFT


async def test_authenticated_create_rejects_wrong_department_and_invalid_hours(
    db_async, async_client
):
    department = await make_department(db_async, "integrity_http")
    other = await make_department(db_async, "integrity_http_other")
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=user, role=role)
    headers = await authentication_token_from_email_async(
        client=async_client, email=user.email, db=db_async
    )
    request = payload(other.id).model_dump(mode="json")
    denied = await async_client.post(
        "/api/v1/hr/timesheets", headers=headers, json=request
    )
    assert denied.status_code == 403
    assert await db_async.scalar(select(func.count()).select_from(Timesheet)) == 0
    request["department_id"] = department.id
    request["entries"] = [{"entry_date": "2026-09-26", "actual_hours": -1}]
    invalid = await async_client.post(
        "/api/v1/hr/timesheets", headers=headers, json=request
    )
    assert invalid.status_code == 422
    assert await db_async.scalar(select(func.count()).select_from(Timesheet)) == 0


async def test_transfer_preserves_filing_department_read_summary_and_approval(db_async):
    original = await make_department(db_async, "integrity_transfer_a")
    destination = await make_department(db_async, "integrity_transfer_b")
    employee = await make_user(db_async)
    submit_role, _ = await make_role_with_permission(db_async, "timesheet.submit.self")
    await assign_role(db_async, user=employee, role=submit_role)
    employment = await make_employee(db_async, user=employee, department_id=original.id)
    managers = []
    role, _ = await make_role_with_permission(
        db_async, "timesheet.read.department", "timesheet.approve"
    )
    for department in (original, destination):
        manager = await make_user(db_async)
        await assign_role(
            db_async,
            user=manager,
            role=role,
            scope=RoleAssignmentScope.DEPARTMENT,
            department_id=department.id,
        )
        managers.append(manager)
    timesheet, _ = await service.create_timesheet(
        session=db_async, current_user=employee, payload=payload(original.id)
    )
    timesheet.status = TimesheetStatus.SUBMITTED
    employment.department_id = destination.id
    await db_async.commit()
    for reader in (employee, managers[0]):
        details, _ = await service.read_timesheet_details(
            session=db_async, current_user=reader, timesheet_id=timesheet.id
        )
        assert details.id == timesheet.id
        summary = await service.get_timesheet_summary(
            session=db_async, current_user=reader, timesheet_id=timesheet.id
        )
        assert summary.timesheet_id == timesheet.id
    for operation in (
        service.read_timesheet_details,
        service.get_timesheet_summary,
        service.approve_timesheet,
    ):
        with pytest.raises(AppException) as rejected:
            await operation(
                session=db_async, current_user=managers[1], timesheet_id=timesheet.id
            )
        assert rejected.value.status_code == 403
    assert timesheet.status == TimesheetStatus.SUBMITTED
    approved = await service.approve_timesheet(
        session=db_async, current_user=managers[0], timesheet_id=timesheet.id
    )
    assert approved.status == TimesheetStatus.APPROVED


async def test_named_reviewer_retains_access_outside_current_department(db_async):
    department = await make_department(db_async, "integrity_named")
    employee = await make_user(db_async, superuser=True)
    await make_employee(db_async, user=employee, department_id=department.id)
    reviewer = await make_user(db_async)
    role, _ = await make_role_with_permission(
        db_async,
        "timesheet.approve",
        "workflow.instance.action",
        "workflow.instance.view",
    )
    await assign_role(db_async, user=reviewer, role=role)
    timesheet, _ = await service.create_timesheet(
        session=db_async, current_user=employee, payload=payload(department.id)
    )
    template = WorkflowTemplate(
        name="Named timesheet review",
        department_id=department.id,
        workflow_type=WorkflowType.TIMESHEET,
        created_by=employee.id,
    )
    db_async.add(template)
    await db_async.flush()
    instance = WorkflowInstance(
        workflow_template_id=template.id,
        department_id=department.id,
        workflow_type=WorkflowType.TIMESHEET,
        entity_type="timesheet",
        entity_id=timesheet.id,
        requested_by_user_id=employee.id,
        status=WorkflowStatus.PENDING,
        current_step_order=1,
    )
    db_async.add(instance)
    await db_async.flush()
    db_async.add(
        WorkflowStepInstance(
            workflow_instance_id=instance.id,
            step_order=1,
            required_user_id=reviewer.id,
        )
    )
    timesheet.status = TimesheetStatus.SUBMITTED
    await db_async.commit()
    details, _ = await service.read_timesheet_details(
        session=db_async, current_user=reviewer, timesheet_id=timesheet.id
    )
    assert details.id == timesheet.id
    summary = await service.get_timesheet_summary(
        session=db_async, current_user=reviewer, timesheet_id=timesheet.id
    )
    assert summary.timesheet_id == timesheet.id
    approved = await service.approve_timesheet(
        session=db_async, current_user=reviewer, timesheet_id=timesheet.id
    )
    assert approved.status == TimesheetStatus.APPROVED
