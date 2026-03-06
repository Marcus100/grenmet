import uuid

from sqlmodel import Session, col, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.dependencies import get_status_report_or_404
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

from .models import StatusReport, StatusReportEntry
from .schemas import StatusReportCreate


def create_status_report(
    *, session: Session, current_user: User, payload: StatusReportCreate
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(current_user=current_user, permission_key="status.report.create")
    report = StatusReport(
        department_id=payload.department_id,
        report_date=payload.report_date,
        shift_code=payload.shift_code,
        submitted_by_user_id=current_user.id,
        weather_summary=payload.weather_summary,
        equipment_summary=payload.equipment_summary,
        personnel_summary=payload.personnel_summary,
        runway_status=payload.runway_status,
        navaids_status=payload.navaids_status,
        communications_status=payload.communications_status,
        general_remarks=payload.general_remarks,
    )
    session.add(report)
    session.commit()
    session.refresh(report)

    entries: list[StatusReportEntry] = []
    for entry_in in payload.entries:
        entry = StatusReportEntry(
            status_report_id=report.id,
            user_id=entry_in.user_id,
            personnel_status=entry_in.personnel_status,
            arrival_time=entry_in.arrival_time,
            departure_time=entry_in.departure_time,
            notes=entry_in.notes,
        )
        session.add(entry)
        entries.append(entry)
    if entries:
        session.commit()
        for e in entries:
            session.refresh(e)

    report.workflow_instance_id = start_workflow_for_entity(
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
    return report, entries


def read_status_report_details(
    *, session: Session, current_user: User, report_id: uuid.UUID
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(current_user=current_user, permission_key="status.report.read")
    report = get_status_report_or_404(
        session=session,
        report_id=report_id,
    )
    entries = list(
        session.exec(
            select(StatusReportEntry).where(
                col(StatusReportEntry.status_report_id) == report_id
            )
        ).all()
    )
    return report, entries


def list_status_reports(
    *, session: Session, current_user: User, department_id: str | None = None
) -> list[StatusReport]:
    require_permission(current_user=current_user, permission_key="status.report.read")
    statement = select(StatusReport)
    if department_id:
        statement = statement.where(col(StatusReport.department_id) == department_id)
    return list(session.exec(statement.order_by(col(StatusReport.created_at).desc())).all())
