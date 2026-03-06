import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.dependencies import get_status_report_or_404
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

from .models import StatusReport, StatusReportEntry
from .schemas import StatusReportCreate


async def create_status_report(
    *, session: AsyncSession, current_user: User, payload: StatusReportCreate
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(
        current_user=current_user, permission_key="status.report.create"
    )
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
    await session.commit()
    await session.refresh(report)

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
        await session.commit()
        for e in entries:
            await session.refresh(e)

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
    return report, entries


async def read_status_report_details(
    *, session: AsyncSession, current_user: User, report_id: uuid.UUID
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(
        current_user=current_user, permission_key="status.report.read"
    )
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
    *, session: AsyncSession, current_user: User, department_id: str | None = None
) -> list[StatusReport]:
    require_permission(
        current_user=current_user, permission_key="status.report.read"
    )
    statement = select(StatusReport)
    if department_id:
        statement = statement.where(
            col(StatusReport.department_id) == department_id
        )
    result = await session.execute(
        statement.order_by(col(StatusReport.created_at).desc())
    )
    return list(result.scalars().all())
