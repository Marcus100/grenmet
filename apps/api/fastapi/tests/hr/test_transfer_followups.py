"""Phone punches and attendance review after a department transfer (issue 618)."""

from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User
from src.baseline.service import require_ready
from src.exceptions import AppException
from src.hr.attendance import clock_service, punch_service
from src.hr.attendance import service as attendance_service
from src.hr.attendance.models import ClockPunch
from src.hr.attendance.schemas import AttendanceCorrectionCreate
from src.hr.models import Department, EmploymentRecord, Organisation
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_ready_staff,
    make_role_with_permission,
    make_user,
)
from tests.hr.test_attendance import payload, setup_shift
from tests.hr.test_clock_in import DEPT, OTHER
from tests.hr.test_phone_punch_approval import (
    _pending_ids,
    _punch,
    _staff,
    _transfer,
    _supervisor,
    _world,
)

# --- phone punches attach only to a shift of the scanned site's department ---


async def _two_department_world(
    db: AsyncSession, *, employed_in: str, shifts: dict[str, tuple[int, str]]
) -> tuple[User, dict[str, str]]:
    """Employee employed in ``employed_in`` with a published shift per department
    (department -> (July day, shift code)) and a clock-site token per department."""
    for dept in (DEPT, OTHER):
        if not await db.get(Department, dept):
            db.add(Department(organisation_id="gaa", code=dept, id=dept, name=dept))
    for code, start, end, next_day in (
        ("CKM", "05:30", "14:00", False),
        ("CKN", "22:00", "06:00", True),
    ):
        if not await db.get(ShiftCatalog, code):
            db.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=ShiftCategory.WORK,
                    start_time=start,
                    end_time=end,
                    ends_next_day=next_day,
                )
            )
    await db.commit()
    manager = await make_user(db, superuser=True)
    await make_employee(db, user=manager, department_id=DEPT)
    employee = await _staff(db, employed_in)
    for dept, (day, code) in shifts.items():
        await _transfer(db, employee, dept)  # rosters only take department members
        period = await create_roster_period(
            session=db,
            current_user=manager,
            period_in=RosterPeriodCreate(
                department_id=dept,
                period_start=datetime(2026, 7, 1).date(),
                period_end=datetime(2026, 7, 31).date(),
            ),
        )
        await bulk_upsert_roster_assignments(
            session=db,
            current_user=manager,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=period.id,
                assignments=[
                    RosterAssignmentInput(
                        user_id=employee.id,
                        assignment_date=datetime(2026, 7, day).date(),
                        shift_code=code,
                    )
                ],
            ),
        )
        await publish_roster_period(
            session=db, current_user=manager, period_id=period.id
        )
    await _transfer(db, employee, employed_in)
    tokens: dict[str, str] = {}
    for dept in (DEPT, OTHER):
        _, tokens[dept] = await clock_service.create_site(
            session=db, current_user=manager, department_id=dept, name=f"Gate {dept}"
        )
    return employee, tokens


async def _shift_department(db: AsyncSession, punch: ClockPunch) -> str:
    assignment = await db.get(RosterAssignment, punch.roster_assignment_id)
    assert assignment is not None
    period = await db.get(RosterPeriod, assignment.roster_period_id)
    assert period is not None
    return period.department_id


async def test_transferred_employee_punch_ignores_the_closer_old_department_shift(
    db_async: AsyncSession,
) -> None:
    # Employed in OTHER after a transfer; the old DEPT shift starts exactly now,
    # the OTHER night shift is much further away. OTHER's gate means OTHER's shift.
    employee, tokens = await _two_department_world(
        db_async,
        employed_in=OTHER,
        shifts={DEPT: (6, "CKM"), OTHER: (5, "CKN")},
    )
    punch = await _punch(db_async, employee, tokens[OTHER], 9, 30)
    assert punch.department_id == OTHER
    assert await _shift_department(db_async, punch) == OTHER


async def test_punch_ignores_a_closer_shift_of_the_destination_department(
    db_async: AsyncSession,
) -> None:
    # Before the transfer: employed in DEPT, a destination (OTHER) shift starts now.
    employee, tokens = await _two_department_world(
        db_async,
        employed_in=DEPT,
        shifts={OTHER: (6, "CKM"), DEPT: (5, "CKN")},
    )
    punch = await _punch(db_async, employee, tokens[DEPT], 9, 30)
    assert punch.department_id == DEPT
    assert await _shift_department(db_async, punch) == DEPT


async def test_no_shift_in_the_scanned_departments_roster_is_refused(
    db_async: AsyncSession,
) -> None:
    employee, tokens = await _two_department_world(
        db_async, employed_in=OTHER, shifts={DEPT: (6, "CKM")}
    )
    with pytest.raises(AppException) as raised:
        await _punch(db_async, employee, tokens[OTHER], 9, 30)
    assert raised.value.status_code == 409


# --- the reviewer rule is tied to the punch's organisation ---


async def test_cross_organisation_employment_record_leaks_nothing(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)
    if not await db_async.get(Organisation, "other_org"):
        db_async.add(Organisation(id="other_org", code="other_org", name="Other"))
        await db_async.flush()
    foreign = Department(
        organisation_id="other_org", code="FRN2", id="dept_foreign2", name="Foreign 2"
    )
    db_async.add(foreign)
    await db_async.commit()
    review, _ = await make_role_with_permission(db_async, "timesheet.approve")
    named = await make_user(db_async)
    await make_employee(db_async, user=named, department_id=foreign.id)
    await assign_role(
        db_async,
        user=named,
        role=review,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=foreign.id,
        organisation_id="other_org",
    )
    outside_all = await make_user(db_async)
    await assign_role(
        db_async,
        user=outside_all,
        role=review,
        scope=RoleAssignmentScope.ALL,
        organisation_id="other_org",
    )
    # Corrupt state the transfer guard should prevent: the employment record sits
    # in another organisation and names an outsider as supervisor.
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert record is not None
    record.organisation_id = "other_org"
    record.department_id = foreign.id
    record.supervisor_id = named.id
    await db_async.commit()
    for outsider in (named, outside_all):
        assert await _pending_ids(db_async, outsider) == []
        with pytest.raises(AppException) as raised:
            await punch_service.approve_punch(
                session=db_async, current_user=outsider, punch_id=arrive.id
            )
        assert raised.value.status_code == 403
    # The punch's own department manager is unaffected.
    own = await _supervisor(db_async, department=DEPT)
    assert await _pending_ids(db_async, own) == [arrive.id]


# --- attendance review after a transfer ---


async def _transferred_with_saved_shift(
    db: AsyncSession,
) -> tuple[User, RosterAssignment, str, str]:
    employee, assignment = await setup_shift(db)
    employment = await db.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert employment is not None
    old_department = employment.department_id
    new = await make_department(db)
    await make_ready_staff(db, employee, new.id)
    await db.refresh(employment)
    employment.department_id = new.id
    await db.commit()
    return employee, assignment, old_department, new.id


async def test_employee_saves_an_old_department_shift_after_a_transfer(
    db_async: AsyncSession,
) -> None:
    employee, assignment, old, _ = await _transferred_with_saved_shift(db_async)
    saved = await attendance_service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    assert saved.department_id == old


async def test_employee_submits_and_corrects_an_old_department_record(
    db_async: AsyncSession,
) -> None:
    employee, assignment, old, _ = await _transferred_with_saved_shift(db_async)
    saved = await attendance_service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    submitted = await attendance_service.submit_attendance(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        expected_revision=saved.revision,
    )
    instance = await db_async.get(WorkflowInstance, submitted.workflow_instance_id)
    assert instance is not None
    # Routed to the old department's approvers, not the new department's.
    assert instance.department_id == old
    assert instance.status == WorkflowStatus.PENDING
    steps = (
        await db_async.scalars(
            select(WorkflowStepInstance).where(
                WorkflowStepInstance.workflow_instance_id == instance.id
            )
        )
    ).all()
    assert steps
    approver = await make_user(db_async, superuser=True)
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=approver,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    correction = await attendance_service.propose_correction(
        session=db_async,
        current_user=employee,
        attendance_id=saved.id,
        payload=AttendanceCorrectionCreate.model_validate(
            {
                "roster_assignment_id": assignment.id,
                "expected_revision": submitted.revision,
                "arrived_at": "2026-09-26T22:05:00-04:00",
                "departed_at": "2026-09-27T06:00:00-04:00",
                "break_minutes": 30,
                "reason": "Scanner was late",
            }
        ),
    )
    corrected = await db_async.get(WorkflowInstance, correction.workflow_instance_id)
    assert corrected is not None
    assert corrected.department_id == old


async def test_transfer_relaxation_is_limited_to_the_employee_in_one_organisation(
    db_async: AsyncSession,
) -> None:
    employee, _, old, _ = await _transferred_with_saved_shift(db_async)
    # Leave and every other form keep the strict current-department rule.
    with pytest.raises(AppException) as raised:
        await require_ready(db_async, employee.id, old)
    assert raised.value.status_code == 409
    # Even the attendance relaxation refuses a department of another organisation.
    if not await db_async.get(Organisation, "other_org"):
        db_async.add(Organisation(id="other_org", code="other_org", name="Other"))
        await db_async.commit()
    foreign = await make_department(
        db_async, "dept_foreign_rr", organisation_id="other_org"
    )
    with pytest.raises(AppException) as raised:
        await require_ready(
            db_async, employee.id, foreign.id, own_prior_department=True
        )
    assert raised.value.status_code == 409
    # The same department is accepted for the employee's own attendance review.
    await require_ready(db_async, employee.id, old, own_prior_department=True)


async def test_proxy_for_another_department_cannot_submit_an_old_record(
    db_async: AsyncSession,
) -> None:
    employee, assignment, _, new = await _transferred_with_saved_shift(db_async)
    saved = await attendance_service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    proxy = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.proxy")
    await make_employee(db_async, user=proxy, department_id=new)
    await assign_role(
        db_async,
        user=proxy,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=new,
    )
    with pytest.raises(AppException) as raised:
        await attendance_service.submit_attendance(
            session=db_async,
            current_user=proxy,
            attendance_id=saved.id,
            expected_revision=saved.revision,
        )
    assert raised.value.status_code == 400


async def test_submission_still_needs_the_old_departments_workflow(
    db_async: AsyncSession,
) -> None:
    employee, assignment, old, _ = await _transferred_with_saved_shift(db_async)
    saved = await attendance_service.save_attendance(
        session=db_async, current_user=employee, payload=payload(assignment)
    )
    template = await db_async.scalar(
        select(WorkflowTemplate).where(
            WorkflowTemplate.department_id == old,
            WorkflowTemplate.workflow_type == WorkflowType.TIMESHEET,
        )
    )
    assert template is not None
    template.is_active = False
    await db_async.commit()
    with pytest.raises(AppException) as raised:
        await attendance_service.submit_attendance(
            session=db_async,
            current_user=employee,
            attendance_id=saved.id,
            expected_revision=saved.revision,
        )
    assert raised.value.status_code == 409
