from sqlmodel import Session, col, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

from .models import AbsenteeReport
from .schemas import AbsenteeReportCreate


def create_absentee_report(
    *, session: Session, current_user: User, payload: AbsenteeReportCreate
) -> AbsenteeReport:
    require_permission(current_user=current_user, permission_key="absentee.report.create")
    report = AbsenteeReport(
        user_id=payload.user_id,
        department_id=payload.department_id,
        report_date=payload.report_date,
        expected_shift_code=payload.expected_shift_code,
        absence_start_time=payload.absence_start_time,
        absence_end_time=payload.absence_end_time,
        reason_code=payload.reason_code,
        notes=payload.notes,
        contact_attempted=payload.contact_attempted,
        contact_method=payload.contact_method,
        replacement_arranged=payload.replacement_arranged,
        replacement_user_id=payload.replacement_user_id,
        submitted_by_user_id=current_user.id,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    report.workflow_instance_id = start_workflow_for_entity(
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
        require_permission(
            current_user=current_user, permission_key="absentee.report.read.department"
        )
        statement = statement.where(col(AbsenteeReport.department_id) == department_id)
    else:
        statement = statement.where(col(AbsenteeReport.user_id) == current_user.id)
    return list(session.exec(statement.order_by(col(AbsenteeReport.created_at).desc())).all())
