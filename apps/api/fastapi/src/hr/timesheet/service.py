import uuid
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from sqlmodel import Session, col, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
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


def _get_or_create_policy(*, session: Session, department_id: str) -> DepartmentPolicy:
    policy = session.exec(
        select(DepartmentPolicy).where(col(DepartmentPolicy.department_id) == department_id)
    ).first()
    if policy:
        return policy
    policy = DepartmentPolicy(department_id=department_id)
    session.add(policy)
    session.commit()
    session.refresh(policy)
    return policy


def create_timesheet(
    *, session: Session, current_user: User, payload: TimesheetCreate
) -> tuple[Timesheet, list[TimesheetEntry]]:
    policy = _get_or_create_policy(session=session, department_id=payload.department_id)
    target_user_id = payload.user_id or current_user.id
    is_proxy = target_user_id != current_user.id

    if not is_proxy and not policy.allow_employee_self_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_DISABLED)
    if is_proxy and not policy.allow_supervisor_proxy_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED)
    if not is_proxy:
        require_permission(current_user=current_user, permission_key="timesheet.submit.self")
    if is_proxy:
        require_permission(current_user=current_user, permission_key="timesheet.submit.proxy")
    if is_proxy and not can_act_on_user(
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
    session.commit()
    session.refresh(timesheet)

    roster_assignments = {
        ra.assignment_date: ra
        for ra in session.exec(
            select(RosterAssignment).where(
                col(RosterAssignment.user_id) == target_user_id,
                col(RosterAssignment.assignment_date) >= payload.period_start,
                col(RosterAssignment.assignment_date) <= payload.period_end,
            )
        ).all()
    }

    entries: list[TimesheetEntry] = []
    for entry in payload.entries:
        linked_ra = roster_assignments.get(entry.entry_date)
        db_entry = TimesheetEntry(
            timesheet_id=timesheet.id,
            entry_date=entry.entry_date,
            shift_code=entry.shift_code or (linked_ra.shift_code if linked_ra else None),
            roster_assignment_id=linked_ra.id if linked_ra else None,
            roster_hours=entry.roster_hours,
            actual_hours=entry.actual_hours,
            overtime_hours=entry.overtime_hours,
            break_hours=entry.break_hours,
            comments=entry.comments,
        )
        session.add(db_entry)
        entries.append(db_entry)
    session.commit()
    for created_entry in entries:
        session.refresh(created_entry)
    return timesheet, entries


def submit_timesheet(
    *,
    session: Session,
    current_user: User,
    timesheet_id: uuid.UUID,
    submission_mode: SubmissionMode,
) -> Timesheet:
    timesheet = get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    if timesheet.status != TimesheetStatus.DRAFT:
        raise HRValidationError(ERROR_TIMESHEET_ALREADY_SUBMITTED)

    if submission_mode == SubmissionMode.SELF and current_user.id != timesheet.user_id:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_ONLY_OWN)
    if submission_mode == SubmissionMode.SELF:
        require_permission(current_user=current_user, permission_key="timesheet.submit.self")
    if submission_mode == SubmissionMode.PROXY:
        require_permission(current_user=current_user, permission_key="timesheet.submit.proxy")
        if not can_act_on_user(
            session=session,
            current_user=current_user,
            target_user_id=timesheet.user_id,
            permission_key="timesheet.submit.proxy",
        ):
            raise HRPermissionDeniedError(ERROR_TIMESHEET_PROXY_SUBMIT_NOT_ALLOWED)

    timesheet.status = TimesheetStatus.SUBMITTED
    timesheet.submitted_by_user_id = current_user.id
    timesheet.submitted_at = datetime.utcnow()
    timesheet.updated_at = datetime.utcnow()
    session.add(timesheet)
    session.add(
        TimesheetSubmission(
            timesheet_id=timesheet.id,
            submitted_by_user_id=current_user.id,
            submission_mode=submission_mode,
        )
    )
    session.commit()
    session.refresh(timesheet)
    return timesheet


def approve_timesheet(
    *, session: Session, current_user: User, timesheet_id: uuid.UUID
) -> Timesheet:
    require_permission(current_user=current_user, permission_key="timesheet.approve")
    timesheet = get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    if timesheet.status != TimesheetStatus.SUBMITTED:
        raise HRValidationError(ERROR_TIMESHEET_NOT_SUBMITTED)
    if not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        permission_key="timesheet.approve",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_APPROVE_NOT_ALLOWED)

    timesheet.status = TimesheetStatus.APPROVED
    timesheet.approved_by_user_id = current_user.id
    timesheet.approved_at = datetime.utcnow()
    timesheet.updated_at = datetime.utcnow()
    session.add(timesheet)
    session.commit()
    session.refresh(timesheet)
    return timesheet


def list_my_timesheets(*, session: Session, current_user: User) -> list[Timesheet]:
    return list(
        session.exec(
            select(Timesheet)
            .where(col(Timesheet.user_id) == current_user.id)
            .order_by(col(Timesheet.created_at).desc())
        ).all()
    )


def list_department_timesheets(
    *, session: Session, current_user: User, department_id: str
) -> list[Timesheet]:
    require_permission(current_user=current_user, permission_key="timesheet.read.department")
    return list(
        session.exec(
            select(Timesheet)
            .where(col(Timesheet.department_id) == department_id)
            .order_by(col(Timesheet.created_at).desc())
        ).all()
    )


def read_timesheet_details(
    *, session: Session, current_user: User, timesheet_id: uuid.UUID
) -> tuple[Timesheet, list[TimesheetEntry]]:
    timesheet = get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    if current_user.id != timesheet.user_id and not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        permission_key="timesheet.read.department",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_READ_NOT_ALLOWED)
    entries = list(
        session.exec(
            select(TimesheetEntry).where(col(TimesheetEntry.timesheet_id) == timesheet_id)
        ).all()
    )
    return timesheet, entries


def get_timesheet_summary(
    *, session: Session, current_user: User, timesheet_id: uuid.UUID
) -> TimesheetSummaryByShift:
    timesheet = get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    if current_user.id != timesheet.user_id and not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        permission_key="timesheet.read.department",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_READ_NOT_ALLOWED)

    entries = list(
        session.exec(
            select(TimesheetEntry).where(col(TimesheetEntry.timesheet_id) == timesheet_id)
        ).all()
    )

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


def ensure_timesheet_workflow(
    *, session: Session, current_user: User, timesheet: Timesheet
) -> None:
    template = session.exec(
        select(WorkflowTemplate).where(
            col(WorkflowTemplate.department_id) == timesheet.department_id,
            col(WorkflowTemplate.workflow_type)
            == WorkflowType.TIMESHEET,
        )
    ).first()
    if not template:
        return
    create_workflow_instance(
        session=session,
        current_user=current_user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type="timesheet",
            entity_id=timesheet.id,
        ),
    )
