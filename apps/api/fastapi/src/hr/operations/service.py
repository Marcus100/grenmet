import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.auth.models import User
from src.hr.authz import can_act_on_user
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowStatus,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest, WorkflowInstanceCreate
from src.hr.workflow.service import (
    apply_workflow_action,
    create_workflow_instance,
    read_workflow_instance_details,
)

from .models import (
    AbsenteeReport,
    LeaveBalanceEvent,
    LeaveRequest,
    RequestStatus,
    ShiftSwapRequest,
    StatusReport,
)
from .schemas import (
    AbsenteeReportCreate,
    LeaveRequestAction,
    LeaveRequestCreate,
    ShiftSwapAction,
    ShiftSwapRequestCreate,
    StatusReportCreate,
)


def _start_workflow_for_entity(
    *,
    session: Session,
    current_user: User,
    department_id: str,
    workflow_type: WorkflowType,
    entity_type: str,
    entity_id: uuid.UUID,
) -> uuid.UUID | None:
    template = session.exec(
        select(WorkflowTemplate).where(
            col(WorkflowTemplate.department_id) == department_id,
            col(WorkflowTemplate.workflow_type) == workflow_type,
            col(WorkflowTemplate.is_active) == True,  # noqa: E712
        )
    ).first()
    if not template:
        return None
    workflow_instance = create_workflow_instance(
        session=session,
        current_user=current_user,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type=entity_type,
            entity_id=entity_id,
        ),
    )
    workflow_instance = apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=workflow_instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.SUBMIT),
    )
    return workflow_instance.id if workflow_instance else None


def create_leave_request(
    *, session: Session, current_user: User, payload: LeaveRequestCreate
) -> LeaveRequest:
    leave_request = LeaveRequest(
        user_id=current_user.id,
        department_id=payload.department_id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=payload.days_requested,
        reason=payload.reason,
    )
    session.add(leave_request)
    session.commit()
    session.refresh(leave_request)

    workflow_id = _start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="leave_request",
        entity_id=leave_request.id,
    )
    if workflow_id:
        leave_request.workflow_instance_id = workflow_id
        session.add(leave_request)
        session.commit()
        session.refresh(leave_request)
    return leave_request


def action_leave_request(
    *,
    session: Session,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestAction,
) -> LeaveRequest:
    leave_request = session.get(LeaveRequest, leave_request_id)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=leave_request.user_id,
        required_role_name="SUPERVISOR",
    ):
        raise HTTPException(status_code=403, detail="Not allowed to action this leave request")
    leave_request.status = payload.status
    leave_request.updated_at = datetime.utcnow()
    session.add(leave_request)
    if payload.status == RequestStatus.APPROVED:
        last_event = session.exec(
            select(LeaveBalanceEvent)
            .where(
                col(LeaveBalanceEvent.user_id) == leave_request.user_id,
                col(LeaveBalanceEvent.leave_type) == leave_request.leave_type,
            )
            .order_by(col(LeaveBalanceEvent.created_at).desc())
        ).first()
        current_balance = last_event.balance_after_days if last_event else Decimal("0.0")
        new_balance = current_balance - leave_request.days_requested
        session.add(
            LeaveBalanceEvent(
                user_id=leave_request.user_id,
                leave_type=leave_request.leave_type,
                delta_days=-leave_request.days_requested,
                balance_after_days=new_balance,
                reason="Leave request approved",
                related_leave_request_id=leave_request.id,
                created_by_user_id=current_user.id,
            )
        )
    session.commit()
    session.refresh(leave_request)
    return leave_request


def list_leave_requests(*, session: Session, current_user: User) -> list[LeaveRequest]:
    return list(
        session.exec(
            select(LeaveRequest)
            .where(col(LeaveRequest.user_id) == current_user.id)
            .order_by(col(LeaveRequest.created_at).desc())
        ).all()
    )


def create_shift_swap_request(
    *, session: Session, current_user: User, payload: ShiftSwapRequestCreate
) -> ShiftSwapRequest:
    request = ShiftSwapRequest(
        requesting_user_id=current_user.id,
        counterpart_user_id=payload.counterpart_user_id,
        department_id=payload.department_id,
        source_date=payload.source_date,
        source_shift_code=payload.source_shift_code,
        target_date=payload.target_date,
        target_shift_code=payload.target_shift_code,
        reason=payload.reason,
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    request.workflow_instance_id = _start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.SHIFT_SWAP,
        entity_type="shift_swap",
        entity_id=request.id,
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


def action_shift_swap_request(
    *,
    session: Session,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapAction,
) -> ShiftSwapRequest:
    request = session.get(ShiftSwapRequest, shift_swap_id)
    if not request:
        raise HTTPException(status_code=404, detail="Shift swap request not found")
    if not can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=request.requesting_user_id,
        required_role_name="SUPERVISOR",
    ):
        raise HTTPException(status_code=403, detail="Not allowed to action this shift swap")
    request.status = payload.status
    request.updated_at = datetime.utcnow()
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


def create_absentee_report(
    *, session: Session, current_user: User, payload: AbsenteeReportCreate
) -> AbsenteeReport:
    report = AbsenteeReport(
        user_id=payload.user_id,
        department_id=payload.department_id,
        report_date=payload.report_date,
        reason_code=payload.reason_code,
        notes=payload.notes,
        submitted_by_user_id=current_user.id,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    report.workflow_instance_id = _start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.ABSENTEE_REPORT,
        entity_type="absentee_report",
        entity_id=report.id,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def list_absentee_reports(
    *, session: Session, current_user: User, department_id: str | None = None
) -> list[AbsenteeReport]:
    statement = select(AbsenteeReport)
    if department_id:
        statement = statement.where(col(AbsenteeReport.department_id) == department_id)
    else:
        statement = statement.where(col(AbsenteeReport.user_id) == current_user.id)
    return list(session.exec(statement.order_by(col(AbsenteeReport.created_at).desc())).all())


def create_status_report(
    *, session: Session, current_user: User, payload: StatusReportCreate
) -> StatusReport:
    report = StatusReport(
        department_id=payload.department_id,
        report_date=payload.report_date,
        shift_code=payload.shift_code,
        submitted_by_user_id=current_user.id,
        weather_summary=payload.weather_summary,
        equipment_summary=payload.equipment_summary,
        personnel_summary=payload.personnel_summary,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    report.workflow_instance_id = _start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.STATUS_REPORT,
        entity_type="status_report",
        entity_id=report.id,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def list_status_reports(
    *, session: Session, department_id: str | None = None
) -> list[StatusReport]:
    statement = select(StatusReport)
    if department_id:
        statement = statement.where(col(StatusReport.department_id) == department_id)
    return list(session.exec(statement.order_by(col(StatusReport.created_at).desc())).all())


def sync_request_status_from_workflow(
    *,
    session: Session,
    workflow_instance_id: uuid.UUID,
) -> WorkflowStatus:
    workflow, _ = read_workflow_instance_details(
        session=session, workflow_instance_id=workflow_instance_id
    )
    return workflow.status
