import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.auth.models import User
from src.hr.authz import can_act_on_user
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
from .schemas import TimesheetCreate


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
        raise HTTPException(status_code=403, detail="Self submission is disabled")
    if is_proxy and not policy.allow_supervisor_proxy_submit:
        raise HTTPException(status_code=403, detail="Proxy submission is disabled")
    if is_proxy and not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=target_user_id,
        required_role_name="SUPERVISOR",
    ):
        raise HTTPException(status_code=403, detail="Not allowed to submit for this user")

    timesheet = Timesheet(
        user_id=target_user_id,
        department_id=payload.department_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
    )
    session.add(timesheet)
    session.commit()
    session.refresh(timesheet)

    entries: list[TimesheetEntry] = []
    for entry in payload.entries:
        db_entry = TimesheetEntry(
            timesheet_id=timesheet.id,
            entry_date=entry.entry_date,
            roster_hours=entry.roster_hours,
            actual_hours=entry.actual_hours,
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
    timesheet = session.get(Timesheet, timesheet_id)
    if not timesheet:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    if timesheet.status != TimesheetStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Timesheet already submitted")

    if submission_mode == SubmissionMode.SELF and current_user.id != timesheet.user_id:
        raise HTTPException(status_code=403, detail="Self submission only for own timesheet")
    if submission_mode == SubmissionMode.PROXY and not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        required_role_name="SUPERVISOR",
    ):
        raise HTTPException(status_code=403, detail="Proxy submit not allowed")

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
    timesheet = session.get(Timesheet, timesheet_id)
    if not timesheet:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    if timesheet.status != TimesheetStatus.SUBMITTED:
        raise HTTPException(status_code=400, detail="Timesheet is not submitted")
    if not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=timesheet.user_id,
        required_role_name="SUPERVISOR",
    ):
        raise HTTPException(status_code=403, detail="Not allowed to approve this timesheet")

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
    if not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=current_user.id,
        required_role_name="SUPERVISOR",
    ):
        raise HTTPException(status_code=403, detail="Not allowed to read department timesheets")
    return list(
        session.exec(
            select(Timesheet)
            .where(col(Timesheet.department_id) == department_id)
            .order_by(col(Timesheet.created_at).desc())
        ).all()
    )


def read_timesheet_details(
    *, session: Session, timesheet_id: uuid.UUID
) -> tuple[Timesheet, list[TimesheetEntry]]:
    timesheet = session.get(Timesheet, timesheet_id)
    if not timesheet:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    entries = list(
        session.exec(
            select(TimesheetEntry).where(col(TimesheetEntry.timesheet_id) == timesheet_id)
        ).all()
    )
    return timesheet, entries


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
