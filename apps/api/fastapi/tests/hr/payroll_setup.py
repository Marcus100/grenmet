"""Synthetic fixtures for payroll-input tests: no personal data, fixed dates."""

import uuid
from datetime import date, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth import totp
from src.auth.models import RoleAssignmentScope, User
from src.baseline.models import ApprovalPolicy
from src.hr.attendance import service as attendance_service
from src.hr.attendance.models import AttendanceRecord
from src.hr.attendance.schemas import AttendanceSave
from src.hr.models import Department
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
    WorkflowStepTemplate,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_submission_setup,
    make_user,
)

API = "/api/v1/hr/payroll"


async def headers_for(
    db: AsyncSession, user: User, *, mfa: bool = False
) -> dict[str, str]:
    """A bearer token for ``user``; with ``mfa`` an enrolled, verified session.

    MFA needs ``AUTH_TOTP_ENCRYPTION_KEYS`` set (the ``totp_keys`` fixture)."""
    if mfa:
        user.totp_secret = totp.encrypt_secret(totp.generate_secret())
        user.totp_enabled = True
        await db.commit()
    stored, _ = await auth_service.create_session(
        session=db,
        user=user,
        app_name=None,
        enforce_approval=False,
        mfa_verified_at=utc_now() if mfa else None,
    )
    token, _ = auth_service.issue_access_token_for_user(user=user, db_session=stored)
    return {"Authorization": f"Bearer {token}"}


async def payroll_user(
    db: AsyncSession,
    *keys: str,
    department_id: str,
    scope: RoleAssignmentScope = RoleAssignmentScope.ALL,
    organisation_id: str = "gaa",
    scoped_department: str | None = None,
) -> User:
    user = await make_user(db)
    if organisation_id == "gaa":
        await make_employee(db, user=user, department_id=department_id)
    role, _ = await make_role_with_permission(db, *keys)
    await assign_role(
        db,
        user=user,
        role=role,
        scope=scope,
        department_id=scoped_department,
        organisation_id=organisation_id,
    )
    return user


async def approval_setup(db: AsyncSession, approval_department_id: str) -> uuid.UUID:
    """PAYROLL_RUN workflow on the approving department; returns the approver role."""
    role, _ = await make_role_with_permission(
        db, "hr.payroll.approve", "workflow.instance.view"
    )
    template = WorkflowTemplate(
        department_id=approval_department_id,
        workflow_type=WorkflowType.PAYROLL_RUN,
        name="Payroll approval",
    )
    db.add(template)
    await db.flush()
    db.add(
        WorkflowStepTemplate(
            workflow_template_id=template.id,
            step_order=1,
            required_role_id=role.id,
            label="Accounts Payroll",
        )
    )
    key = f"hr:{approval_department_id}:{WorkflowType.PAYROLL_RUN.value}"
    if await db.get(ApprovalPolicy, key) is None:
        db.add(ApprovalPolicy(key=key, allow_self_approval=True))
    await db.commit()
    return role.id


async def employee_in(db: AsyncSession, department: Department) -> User:
    employee = await make_user(db)
    role, _ = await make_role_with_permission(db, "timesheet.submit.self")
    await assign_role(db, user=employee, role=role)
    if not await db.scalar(
        select(WorkflowTemplate.id).where(
            WorkflowTemplate.department_id == department.id,
            WorkflowTemplate.workflow_type == WorkflowType.TIMESHEET,
        )
    ):
        await make_submission_setup(  # type: ignore[no-untyped-call]
            db, employee, department.id, WorkflowType.TIMESHEET
        )
    else:
        from tests.factories import make_ready_staff

        await make_ready_staff(db, employee, department.id)
    return employee


async def _shift(db: AsyncSession, start: str, end: str) -> str:
    code = f"P{start[:2]}{end[:2]}"
    if await db.get(ShiftCatalog, code) is None:
        db.add(
            ShiftCatalog(
                code=code,
                label=f"Payroll test {start}-{end}",
                category=ShiftCategory.WORK,
                start_time=start,
                end_time=end,
                ends_next_day=end <= start,
            )
        )
        await db.flush()
    return code


async def worked_shift(
    db: AsyncSession,
    employee: User,
    department: Department,
    *,
    day: date,
    arrive: str,
    depart: str,
    approve: bool = True,
    submit: bool = True,
    break_minutes: int = 0,
) -> AttendanceRecord:
    """Roster, record, submit and (by default) approve one shift.

    ``arrive``/``depart`` are local ISO datetimes with the -04:00 offset."""
    start = datetime.fromisoformat(arrive).strftime("%H:%M")
    end = datetime.fromisoformat(depart).strftime("%H:%M")
    code = await _shift(db, start, end)
    month_start = day.replace(day=1)
    period = await db.scalar(
        select(RosterPeriod).where(
            RosterPeriod.department_id == department.id,
            RosterPeriod.period_start == month_start,
        )
    )
    if period is None:
        from src.hr.payroll.service import month_end

        period = RosterPeriod(
            created_by_user_id=employee.id,
            department_id=department.id,
            period_start=month_start,
            period_end=month_end(month_start),
            status=RosterPeriodStatus.PUBLISHED,
        )
        db.add(period)
        await db.flush()
    assignment = RosterAssignment(
        roster_period_id=period.id,
        user_id=employee.id,
        assignment_date=day,
        shift_code=code,
    )
    db.add(assignment)
    await db.commit()
    record = await attendance_service.save_attendance(
        session=db,
        current_user=employee,
        payload=AttendanceSave.model_validate(
            {
                "roster_assignment_id": assignment.id,
                "arrived_at": arrive,
                "departed_at": depart,
                "break_minutes": break_minutes,
            }
        ),
    )
    if not submit:
        return record
    record = await attendance_service.submit_attendance(
        session=db,
        current_user=employee,
        attendance_id=record.id,
        expected_revision=record.revision,
    )
    if approve:
        assert record.workflow_instance_id is not None
        supervisor = await make_user(db, superuser=True)
        await workflow_service.apply_workflow_action(
            session=db,
            current_user=supervisor,
            workflow_instance_id=record.workflow_instance_id,
            action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
        )
    await db.refresh(record)
    return record


async def calendar_and_period(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    approval_department_id: str,
    start: date,
) -> tuple[str, str]:
    calendars = await client.get(
        f"{API}/calendars?organisation_id=gaa", headers=headers
    )
    assert calendars.status_code == 200, calendars.text
    if calendars.json()["data"]:
        calendar_id = calendars.json()["data"][0]["id"]
    else:
        created = await client.post(
            f"{API}/calendars",
            headers=headers,
            json={
                "organisation_id": "gaa",
                "name": "Monthly (provisional)",
                "approval_department_id": approval_department_id,
                "frequency": "MONTHLY",
            },
        )
        assert created.status_code == 201, created.text
        calendar_id = created.json()["id"]
    period = await client.post(
        f"{API}/periods",
        headers=headers,
        json={"calendar_id": calendar_id, "start_date": start.isoformat()},
    )
    assert period.status_code == 201, period.text
    return calendar_id, period.json()["id"]


async def lines(
    client: httpx.AsyncClient, headers: dict[str, str], period_id: str
) -> list[dict[str, object]]:
    response = await client.get(f"{API}/periods/{period_id}/lines", headers=headers)
    assert response.status_code == 200, response.text
    data: list[dict[str, object]] = response.json()["data"]
    return data


def quantities(rows: list[dict[str, object]]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for row in rows:
        code = str(row["pay_item_code"])
        totals[code] = totals.get(code, 0) + float(str(row["quantity"]))
    return totals


async def departments(db: AsyncSession) -> tuple[Department, Department, Department]:
    return (
        await make_department(db, f"ops_{uuid.uuid4().hex[:6]}"),
        await make_department(db, f"oth_{uuid.uuid4().hex[:6]}"),
        await make_department(db, f"acc_{uuid.uuid4().hex[:6]}"),
    )
