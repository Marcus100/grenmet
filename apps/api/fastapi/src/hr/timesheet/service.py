import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.utils.datetime import utc_now
from src.hr.constants import (
    ERROR_TIMESHEET_ALREADY_SUBMITTED,
    ERROR_TIMESHEET_APPROVE_NOT_ALLOWED,
    ERROR_TIMESHEET_NOT_SUBMITTED,
    ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED,
    ERROR_TIMESHEET_PROXY_SUBMIT_NOT_ALLOWED,
    ERROR_TIMESHEET_READ_NOT_ALLOWED,
    ERROR_TIMESHEET_SELF_SUBMIT_DISABLED,
    ERROR_TIMESHEET_SELF_SUBMIT_ONLY_OWN,
    ERROR_TIMESHEET_SUBMIT_FOR_USER_NOT_ALLOWED,
)
from src.hr.dependencies import get_timesheet_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.roster.models import RosterAssignment
from src.hr.workflow.models import WorkflowTemplate, WorkflowType
from src.hr.workflow.schemas import WorkflowInstanceCreate
from src.hr.workflow.service import create_workflow_instance

from .models import (
    DepartmentPolicy,
    SubmissionMode,
    Timesheet,
    TimesheetEntry,
    TimesheetStatus,
    TimesheetSubmission,
)
from .schemas import ShiftHoursSummary, TimesheetCreate, TimesheetSummaryByShift


async def _get_or_create_policy(
    *, session: AsyncSession, department_id: str
) -> DepartmentPolicy:
    result = await session.execute(
        select(DepartmentPolicy).where(
            col(DepartmentPolicy.department_id) == department_id
        )
    )
    policy = result.scalars().first()
    if policy:
        return policy
    policy = DepartmentPolicy(department_id=department_id)
    session.add(policy)
    await session.commit()
    await session.refresh(policy)
    return policy


async def create_timesheet(
    *, session: AsyncSession, current_user: User, payload: TimesheetCreate
) -> tuple[Timesheet, list[TimesheetEntry]]:
    policy = await _get_or_create_policy(
        session=session, department_id=payload.department_id
    )
    target_user_id = payload.user_id or current_user.id
    is_proxy = target_user_id != current_user.id

    if not is_proxy and not policy.allow_employee_self_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_DISABLED)
    if is_proxy and not policy.allow_supervisor_proxy_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED)
    if not is_proxy:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.self"
        )
    if is_proxy:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.proxy"
        )
    if is_proxy and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=target_user_id,
        permission_key="timesheet.submit.proxy",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SUBMIT_FOR_USER_NOT_ALLOWED)

    timesheet = Timesheet(
        user_id=target_user_id,
        department_id=payload.department_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
    )
    session.add(timesheet)
    await session.commit()
    await session.refresh(timesheet)

    roster_result = await session.execute(
        select(RosterAssignment).where(
            col(RosterAssignment.user_id) == target_user_id,
            col(RosterAssignment.assignment_date) >= payload.period_start,
            col(RosterAssignment.assignment_date) <= payload.period_end,
        )
    )
    roster_assignments = {
        ra.assignment_date: ra for ra in roster_result.scalars().all()
    }

    entries: list[TimesheetEntry] = []
    for entry in payload.entries:
        linked_ra = roster_assignments.get(entry.entry_date)
        db_entry = TimesheetEntry(
            timesheet_id=timesheet.id,
            entry_date=entry.entry_date,
            shift_code=entry.shift_code
            or (linked_ra.shift_code if linked_ra else None),
            roster_assignment_id=linked_ra.id if linked_ra else None,
            roster_hours=entry.roster_hours,
            actual_hours=entry.actual_hours,
            overtime_hours=entry.overtime_hours,
            break_hours=entry.break_hours,
            comments=entry.comments,
        )
        session.add(db_entry)
        entries.append(db_entry)
    await session.commit()
    for created_entry in entries:
        await session.refresh(created_entry)
    return timesheet, entries


async def submit_timesheet(
    *,
    session: AsyncSession,
    current_user: User,
    timesheet_id: uuid.UUID,
    submission_mode: SubmissionMode,
) -> Timesheet:
    timesheet = await get_timesheet_or_404(
        session=session, timesheet_id=timesheet_id
    )
    if timesheet.status != TimesheetStatus.DRAFT:
        raise HRValidationError(ERROR_TIMESHEET_ALREADY_SUBMITTED)

    if submission_mode == SubmissionMode.SELF and current_user.id != timesheet.user_id:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_ONLY_OWN)
    if submission_mode == SubmissionMode.SELF:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.self"
        )
    if submission_mode == SubmissionMode.PROXY:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.proxy"
        )
        if not await can_act_on_user(
            session=session,
            current_user=current_user,
            target_user_id=timesheet.user_id,
            permission_key="timesheet.submit.proxy",
        ):
            raise HRPermissionDeniedError(
                ERROR_TIMESHEET_PROXY_SUBMIT_NOT_ALLOWED
            )

    timesheet.status = TimesheetStatus.SUBMITTED
    timesheet.submitted_by_user_id = current_user.id
    timesheet.submitted_at = utc_now()
    timesheet.updated_at = utc_now()
    session.add(timesheet)
    session.add(
        TimesheetSubmission(
            timesheet_id=timesheet.id,
            submitted_by_user_id=current_user.id,
            submission_mode=submission_mode,
        )
    )
    await session.commit()
    await session.refresh(timesheet)
    return timesheet


async def approve_timesheet(
    *, session: AsyncSession, current_user: User, timesheet_id: uuid.UUID
) -> Timesheet:
    require_permission(
        current_user=current_user, permission_key="timesheet.approve"
    )
    timesheet = await get_timesheet_or_404(
        session=session, timesheet_id=timesheet_id
    )
    if timesheet.status != TimesheetStatus.SUBMITTED:
        raise HRValidationError(ERROR_TIMESHEET_NOT_SUBMITTED)
    if not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        permission_key="timesheet.approve",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_APPROVE_NOT_ALLOWED)

    timesheet.status = TimesheetStatus.APPROVED
    timesheet.approved_by_user_id = current_user.id
    timesheet.approved_at = utc_now()
    timesheet.updated_at = utc_now()
    session.add(timesheet)
    await session.commit()
    await session.refresh(timesheet)
    return timesheet


async def list_my_timesheets(
    *, session: AsyncSession, current_user: User
) -> list[Timesheet]:
    result = await session.execute(
        select(Timesheet)
        .where(col(Timesheet.user_id) == current_user.id)
        .order_by(col(Timesheet.created_at).desc())
    )
    return list(result.scalars().all())


async def list_department_timesheets(
    *, session: AsyncSession, current_user: User, department_id: str
) -> list[Timesheet]:
    require_permission(
        current_user=current_user, permission_key="timesheet.read.department"
    )
    result = await session.execute(
        select(Timesheet)
        .where(col(Timesheet.department_id) == department_id)
        .order_by(col(Timesheet.created_at).desc())
    )
    return list(result.scalars().all())


async def read_timesheet_details(
    *, session: AsyncSession, current_user: User, timesheet_id: uuid.UUID
) -> tuple[Timesheet, list[TimesheetEntry]]:
    timesheet = await get_timesheet_or_404(
        session=session, timesheet_id=timesheet_id
    )
    if current_user.id != timesheet.user_id and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        permission_key="timesheet.read.department",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_READ_NOT_ALLOWED)
    result = await session.execute(
        select(TimesheetEntry).where(
            col(TimesheetEntry.timesheet_id) == timesheet_id
        )
    )
    entries = list(result.scalars().all())
    return timesheet, entries


async def get_timesheet_summary(
    *, session: AsyncSession, current_user: User, timesheet_id: uuid.UUID
) -> TimesheetSummaryByShift:
    timesheet = await get_timesheet_or_404(
        session=session, timesheet_id=timesheet_id
    )
    if current_user.id != timesheet.user_id and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        permission_key="timesheet.read.department",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_READ_NOT_ALLOWED)

    result = await session.execute(
        select(TimesheetEntry).where(
            col(TimesheetEntry.timesheet_id) == timesheet_id
        )
    )
    entries = list(result.scalars().all())

    by_shift: dict[str, list[TimesheetEntry]] = defaultdict(list)
    for entry in entries:
        key = entry.shift_code or "UNLINKED"
        by_shift[key].append(entry)

    shifts: list[ShiftHoursSummary] = []
    grand_roster = Decimal("0.0")
    grand_actual = Decimal("0.0")
    grand_overtime = Decimal("0.0")
    for code, group in sorted(by_shift.items()):
        total_roster = sum((e.roster_hours for e in group), Decimal("0.0"))
        total_actual = sum((e.actual_hours for e in group), Decimal("0.0"))
        total_overtime = sum((e.overtime_hours for e in group), Decimal("0.0"))
        total_break = sum((e.break_hours for e in group), Decimal("0.0"))
        shifts.append(
            ShiftHoursSummary(
                shift_code=code,
                total_roster_hours=total_roster,
                total_actual_hours=total_actual,
                total_overtime_hours=total_overtime,
                total_break_hours=total_break,
                entry_count=len(group),
            )
        )
        grand_roster += total_roster
        grand_actual += total_actual
        grand_overtime += total_overtime

    return TimesheetSummaryByShift(
        timesheet_id=timesheet_id,
        shifts=shifts,
        grand_total_roster=grand_roster,
        grand_total_actual=grand_actual,
        grand_total_overtime=grand_overtime,
    )


async def ensure_timesheet_workflow(
    *, session: AsyncSession, current_user: User, timesheet: Timesheet
) -> None:
    result = await session.execute(
        select(WorkflowTemplate).where(
            col(WorkflowTemplate.department_id) == timesheet.department_id,
            col(WorkflowTemplate.workflow_type) == WorkflowType.TIMESHEET,
        )
    )
    template = result.scalars().first()
    if not template:
        return
    await create_workflow_instance(
        session=session,
        current_user=current_user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type="timesheet",
            entity_id=timesheet.id,
        ),
    )
