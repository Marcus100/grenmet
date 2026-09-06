"""Read dashboard facts from persisted HR records, scoped to the signed-in user."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import String, cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import has_permission
from src.baseline.service import employment_for
from src.hr.absentee.models import AbsenteeReport
from src.hr.dailystatus.models import StatusReport
from src.hr.dashboard.schemas import (
    DashboardApproval,
    DashboardPerson,
    DashboardRequest,
    HrDashboardPublic,
)
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest
from src.hr.models import Department, EmploymentRecord, EmploymentStatus
from src.hr.parking.models import ParkingPermit
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.timesheet.models import Timesheet
from src.hr.workflow import service as workflow_service


async def read_dashboard(
    *, session: AsyncSession, current_user: User
) -> HrDashboardPublic:
    today = datetime.now(ZoneInfo("America/Grenada")).date()
    employment = await employment_for(session, current_user.id)
    department_id = (
        employment.department_id
        if employment and employment.status == EmploymentStatus.ACTIVE
        else None
    )
    # Only a superuser may see organisation-wide figures without employment.
    can_view_department = has_permission(
        current_user=current_user, permission_key="roster.view"
    )
    org_wide = current_user.is_superuser and department_id is None
    department = await session.get(Department, department_id) if department_id else None
    scope = (
        department.name
        if department and can_view_department
        else "All departments"
        if org_wide
        else "Your records"
    )
    requests: list[DashboardRequest] = []
    open_requests = 0
    for model, owner, label in (
        (LeaveRequest, LeaveRequest.user_id, "Leave request"),
        (ShiftSwapRequest, ShiftSwapRequest.requesting_user_id, "Shift exchange"),
        (AbsenteeReport, AbsenteeReport.user_id, "Absentee report"),
        (StatusReport, StatusReport.submitted_by_user_id, "Daily status report"),
        (ParkingPermit, ParkingPermit.user_id, "Parking permit"),
        (Timesheet, Timesheet.user_id, "Timesheet"),
    ):
        base = select(model).where(owner == current_user.id)
        open_requests += (
            await session.scalar(
                select(func.count()).select_from(
                    base.where(
                        cast(col(model.status), String).in_(
                            ["DRAFT", "SUBMITTED", "PENDING", "RETURNED"]
                        )
                    ).subquery()
                )
            )
            or 0
        )
        rows = (
            (
                await session.execute(
                    base.order_by(col(model.updated_at).desc()).limit(6)
                )
            )
            .scalars()
            .all()
        )
        requests.extend(
            DashboardRequest(
                id=str(row.id),
                title=label,
                status=row.status.value,
                updated_at=row.updated_at.isoformat(),
            )
            for row in rows
            if isinstance(
                row,
                (
                    LeaveRequest,
                    ShiftSwapRequest,
                    AbsenteeReport,
                    StatusReport,
                    ParkingPermit,
                    Timesheet,
                ),
            )
        )
    requests.sort(key=lambda row: row.updated_at, reverse=True)
    balance = (
        (
            await session.execute(
                select(LeaveBalanceEvent)
                .where(
                    LeaveBalanceEvent.user_id == current_user.id,
                    LeaveBalanceEvent.leave_type == "VACATION",
                )
                .order_by(col(LeaveBalanceEvent.created_at).desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    shifts = list(
        (
            await session.execute(
                select(ShiftCatalog).where(col(ShiftCatalog.is_active).is_(True))
            )
        )
        .scalars()
        .all()
    )
    members = (
        select(EmploymentRecord)
        .join(User, col(User.id) == col(EmploymentRecord.user_id))
        .where(
            EmploymentRecord.status == EmploymentStatus.ACTIVE,
            col(User.is_active).is_(True),
        )
    )
    if not org_wide:
        members = (
            members.where(EmploymentRecord.department_id == department_id)
            if department_id and can_view_department
            else members.where(EmploymentRecord.user_id == current_user.id)
        )
    active_staff = (
        await session.scalar(select(func.count()).select_from(members.subquery())) or 0
    )
    departments = (
        await session.scalar(select(func.count()).select_from(Department))
        if org_wide
        else int(department is not None)
    )
    roster = (
        select(RosterAssignment, ShiftCatalog, User, Department)
        .join(ShiftCatalog, col(ShiftCatalog.code) == col(RosterAssignment.shift_code))
        .join(User, col(User.id) == col(RosterAssignment.user_id))
        .join(
            RosterPeriod, col(RosterPeriod.id) == col(RosterAssignment.roster_period_id)
        )
        .join(Department, col(Department.id) == col(RosterPeriod.department_id))
        .where(
            col(RosterPeriod.status).in_(
                [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
            ),
            col(User.is_active).is_(True),
        )
    )
    if not org_wide:
        roster = (
            roster.where(RosterPeriod.department_id == department_id)
            if department_id and can_view_department
            else roster.where(RosterAssignment.user_id == current_user.id)
        )
    on_duty, away = [], []
    for assignment, shift, user, dept in (
        await session.execute(
            roster.where(RosterAssignment.assignment_date == today).order_by(
                col(User.first_name)
            )
        )
    ).all():
        person = DashboardPerson(
            id=str(assignment.id),
            name=" ".join(filter(None, [user.first_name, user.last_name]))
            or user.username,
            department=dept.name,
            shift=f"{shift.label} · {shift.start_time}–{shift.end_time}"
            if shift.start_time and shift.end_time
            else shift.label,
        )
        if shift.category == ShiftCategory.WORK:
            on_duty.append(person)
        elif shift.category in (
            ShiftCategory.LEAVE,
            ShiftCategory.OFF,
            ShiftCategory.HOLIDAY,
        ):
            # The published roster is a schedule, never a claim of live attendance.
            away.append(person)
    next_row = (
        await session.execute(
            roster.where(
                RosterAssignment.user_id == current_user.id,
                RosterAssignment.assignment_date > today,
                ShiftCatalog.category == ShiftCategory.WORK,
            )
            .order_by(col(RosterAssignment.assignment_date))
            .limit(1)
        )
    ).first()
    next_shift = (
        f"{next_row[0].assignment_date.isoformat()} · {next_row[1].label}"
        if next_row
        else None
    )
    can_approve = has_permission(
        current_user=current_user, permission_key="workflow.instance.view"
    ) and has_permission(
        current_user=current_user, permission_key="workflow.instance.action"
    )
    approvals = []
    if can_approve:
        inbox = await workflow_service.list_actionable_instances(
            session=session, current_user=current_user
        )
        approvals = [
            DashboardApproval(
                id=str(instance.id),
                name=(
                    " ".join(filter(None, [requester.first_name, requester.last_name]))
                    or requester.username
                )
                if requester
                else "Staff member",
                kind=instance.workflow_type.value.replace("_", " ").title(),
                submitted_at=instance.submitted_at.isoformat()
                if instance.submitted_at
                else None,
            )
            for instance, _step, requester in inbox
        ]
    return HrDashboardPublic(
        date=today,
        scope=scope,
        can_approve=can_approve,
        vacation_balance=balance.balance_after_days if balance else None,
        next_shift=next_shift,
        open_requests=open_requests,
        active_staff=active_staff,
        departments=departments or 0,
        shift_types=len(shifts),
        requests=requests[:6],
        on_duty=on_duty,
        away=away,
        approvals=approvals,
    )
