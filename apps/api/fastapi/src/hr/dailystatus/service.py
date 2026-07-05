import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.dependencies import get_status_report_or_404
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

from .models import StatusReport, StatusReportEntry
from .schemas import StatusReportCreate

logger = logging.getLogger(__name__)


async def create_status_report(
    *, session: AsyncSession, current_user: User, payload: StatusReportCreate
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(current_user=current_user, permission_key="status.report.create")
    report = StatusReport(
        department_id=payload.department_id,
        report_date=payload.report_date,
        shift_code=payload.shift_code,
        shift_period=payload.shift_period,
        submitted_by_user_id=current_user.id,
        all_personnel_reported_on_time=payload.all_personnel_reported_on_time,
        personnel_explanation=payload.personnel_explanation,
        affected_operations=payload.affected_operations,
        affected_operations_explanation=payload.affected_operations_explanation,
        all_equipment_operational=payload.all_equipment_operational,
        equipment_issue_reason=payload.equipment_issue_reason,
        equipment_remedy_action=payload.equipment_remedy_action,
        incident_reports_submitted=payload.incident_reports_submitted,
        incident_explanation=payload.incident_explanation,
        weather_summary=payload.weather_summary,
        equipment_summary=payload.equipment_summary,
        personnel_summary=payload.personnel_summary,
        runway_status=payload.runway_status,
        navaids_status=payload.navaids_status,
        communications_status=payload.communications_status,
        general_remarks=payload.general_remarks,
    )
    # Flush to obtain the report id, add entries, start the workflow, then commit
    # once so the report, its entries, and its workflow instance are atomic.
    session.add(report)
    await session.flush()

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

    report.workflow_instance_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.STATUS_REPORT,
        entity_type="status_report",
        entity_id=report.id,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    # No per-row refresh: entry id/created_at/updated_at are Python-side
    # default_factory values and expire_on_commit=False keeps them after commit.
    logger.info(
        "Status report created",
        extra={"report_id": str(report.id), "user_id": str(current_user.id)},
    )
    return report, entries


async def read_status_report_details(
    *, session: AsyncSession, current_user: User, report_id: uuid.UUID
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(current_user=current_user, permission_key="status.report.read")
    report = await get_status_report_or_404(
        session=session,
        report_id=report_id,
    )
    result = await session.execute(
        select(StatusReportEntry).where(
            col(StatusReportEntry.status_report_id) == report_id
        )
    )
    entries = list(result.scalars().all())
    return report, entries


async def list_status_reports(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[StatusReport], int]:
    require_permission(current_user=current_user, permission_key="status.report.read")
    statement = select(StatusReport)
    if department_id:
        statement = statement.where(col(StatusReport.department_id) == department_id)
    total = await session.scalar(
        select(func.count()).select_from(statement.subquery())
    )
    result = await session.execute(
        statement.order_by(col(StatusReport.created_at).desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0
