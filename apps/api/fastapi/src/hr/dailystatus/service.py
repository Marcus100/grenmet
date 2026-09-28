import logging
import uuid
from datetime import date

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.constants import (
    ERROR_STATUS_REPORT_ACTION_NOT_ALLOWED,
    ERROR_STATUS_REPORT_NOT_DRAFT,
)
from src.hr.dependencies import get_status_report_or_404
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.models import EmploymentRecord, RequestStatus
from src.hr.organisations import department_for, permitted_departments
from src.hr.roster import service as roster_service
from src.hr.roster.models import (
    RosterAssignment,
    RosterAvailability,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
)
from src.hr.signatures import service as signature_service
from src.hr.workflow.models import WorkflowInstance, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from .models import PersonnelStatus, StatusReport, StatusReportEntry
from .schemas import (
    StatusReportCreate,
    StatusReportSubmit,
    StatusStaffingEntry,
    StatusStaffingPublic,
)

logger = logging.getLogger(__name__)


async def create_status_report(
    *, session: AsyncSession, current_user: User, payload: StatusReportCreate
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(current_user=current_user, permission_key="status.report.create")
    await validate_payload(
        session, current_user, payload, submitting=not payload.as_draft
    )
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
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
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
        co_approver_user_ids=payload.co_approver_user_ids,
        submit=not payload.as_draft,
    )
    session.add(report)
    if not payload.as_draft:
        await signature_service.capture(
            session=session,
            actor=current_user,
            entity=report,
            entity_type="status_report",
            signature_version=payload.signature_version,
        )
    await session.commit()
    await session.refresh(report)
    # No per-row refresh: entry id/created_at/updated_at are Python-side
    # default_factory values and expire_on_commit=False keeps them after commit.
    logger.info(
        "Status report created",
        extra={"report_id": str(report.id), "user_id": str(current_user.id)},
    )
    return report, entries


async def submit_status_report(
    *,
    session: AsyncSession,
    current_user: User,
    status_report_id: uuid.UUID,
    payload: StatusReportSubmit,
) -> StatusReport:
    """Submit a previously-saved DRAFT status report into the approval chain."""
    require_permission(current_user=current_user, permission_key="status.report.create")
    report = await get_status_report_or_404(session=session, report_id=status_report_id)
    if report.submitted_by_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_STATUS_REPORT_ACTION_NOT_ALLOWED)
    if report.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_STATUS_REPORT_NOT_DRAFT)

    stored_entries = list(
        (
            await session.scalars(
                select(StatusReportEntry).where(
                    StatusReportEntry.status_report_id == report.id
                )
            )
        ).all()
    )
    await validate_payload(
        session, current_user, report, submitting=True, stored_entries=stored_entries
    )

    if report.workflow_instance_id:
        await submit_draft_workflow(
            session=session,
            current_user=current_user,
            workflow_instance_id=report.workflow_instance_id,
            co_approver_user_ids=payload.co_approver_user_ids,
            commit=False,
        )
    else:
        # Drafted before a template existed for the department — start fresh.
        workflow_id = await start_workflow_for_entity(
            session=session,
            current_user=current_user,
            department_id=report.department_id,
            workflow_type=WorkflowType.STATUS_REPORT,
            entity_type="status_report",
            entity_id=report.id,
            co_approver_user_ids=payload.co_approver_user_ids,
            submit=True,
        )
        if workflow_id:
            report.workflow_instance_id = workflow_id

    report.status = RequestStatus.SUBMITTED
    report.updated_at = utc_now()
    session.add(report)
    await signature_service.capture(
        session=session,
        actor=current_user,
        entity=report,
        entity_type="status_report",
        signature_version=payload.signature_version,
    )
    await session.commit()
    await session.refresh(report)
    logger.info(
        "Status report submitted from draft",
        extra={"report_id": str(report.id), "user_id": str(current_user.id)},
    )
    return report


async def update_status_report(
    *,
    session: AsyncSession,
    current_user: User,
    report_id: uuid.UUID,
    payload: StatusReportCreate,
) -> StatusReport:
    """Edit a still-DRAFT status report in place (no new record is created)."""
    require_permission(current_user=current_user, permission_key="status.report.create")
    report = await get_status_report_or_404(session=session, report_id=report_id)
    if report.submitted_by_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_STATUS_REPORT_ACTION_NOT_ALLOWED)
    if report.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_STATUS_REPORT_NOT_DRAFT)

    if report.department_id != payload.department_id:
        raise HRValidationError("A saved report cannot change department")
    await validate_payload(session, current_user, payload, submitting=False)
    report.department_id = payload.department_id
    report.report_date = payload.report_date
    report.shift_code = payload.shift_code
    report.shift_period = payload.shift_period
    report.all_personnel_reported_on_time = payload.all_personnel_reported_on_time
    report.personnel_explanation = payload.personnel_explanation
    report.affected_operations = payload.affected_operations
    report.affected_operations_explanation = payload.affected_operations_explanation
    report.all_equipment_operational = payload.all_equipment_operational
    report.equipment_issue_reason = payload.equipment_issue_reason
    report.equipment_remedy_action = payload.equipment_remedy_action
    report.incident_reports_submitted = payload.incident_reports_submitted
    report.incident_explanation = payload.incident_explanation
    report.weather_summary = payload.weather_summary
    report.equipment_summary = payload.equipment_summary
    report.personnel_summary = payload.personnel_summary
    report.runway_status = payload.runway_status
    report.navaids_status = payload.navaids_status
    report.communications_status = payload.communications_status
    report.general_remarks = payload.general_remarks
    report.updated_at = utc_now()
    session.add(report)

    # Replace child entries: drop the existing rows and recreate from payload.
    existing = await session.execute(
        select(StatusReportEntry).where(StatusReportEntry.status_report_id == report.id)
    )
    for entry in existing.scalars().all():
        await session.delete(entry)
    for entry_in in payload.entries:
        session.add(
            StatusReportEntry(
                status_report_id=report.id,
                user_id=entry_in.user_id,
                personnel_status=entry_in.personnel_status,
                arrival_time=entry_in.arrival_time,
                departure_time=entry_in.departure_time,
                notes=entry_in.notes,
            )
        )

    await session.commit()
    await session.refresh(report)
    return report


async def delete_status_report(
    *, session: AsyncSession, current_user: User, report_id: uuid.UUID
) -> None:
    """Delete an own DRAFT status report (and its unstarted workflow)."""
    require_permission(current_user=current_user, permission_key="status.report.create")
    report = await get_status_report_or_404(session=session, report_id=report_id)
    if report.submitted_by_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_STATUS_REPORT_ACTION_NOT_ALLOWED)
    if report.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_STATUS_REPORT_NOT_DRAFT)

    # Remove child entries first (they FK the report), then the report, then the
    # DRAFT workflow instance (a draft has no step rows to clean up).
    existing = await session.execute(
        select(StatusReportEntry).where(StatusReportEntry.status_report_id == report.id)
    )
    for entry in existing.scalars().all():
        await session.delete(entry)
    workflow_instance_id = report.workflow_instance_id
    await session.delete(report)
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance:
            await session.delete(instance)
    await session.commit()


async def read_status_report_details(
    *, session: AsyncSession, current_user: User, report_id: uuid.UUID
) -> tuple[StatusReport, list[StatusReportEntry]]:
    require_permission(current_user=current_user, permission_key="status.report.read")
    report = await get_status_report_or_404(
        session=session,
        report_id=report_id,
    )
    await require_report_scope(
        session, current_user, report.department_id, "status.report.read"
    )
    result = await session.execute(
        select(StatusReportEntry).where(StatusReportEntry.status_report_id == report_id)
    )
    entries = list(result.scalars().all())
    name_rows = (
        await session.execute(
            select(
                User.id, func.trim(func.concat(User.first_name, " ", User.last_name))
            ).where(User.id.in_([entry.user_id for entry in entries]))
        )
    ).all()
    names: dict[uuid.UUID, str] = {user_id: str(name) for user_id, name in name_rows}
    for entry in entries:
        entry.employee_name = names.get(entry.user_id)
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
    if not current_user.is_superuser:
        from src.hr.organisations import organisation_choices

        allowed: set[str] = set()
        for org in await organisation_choices(session, current_user):
            allowed.update(
                await permitted_departments(
                    session, current_user, org.id, "status.report.read"
                )
            )
        statement = statement.where(StatusReport.department_id.in_(allowed))
    if department_id:
        await require_report_scope(
            session, current_user, department_id, "status.report.read"
        )
    if department_id:
        statement = statement.where(StatusReport.department_id == department_id)
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    result = await session.execute(
        statement.order_by(StatusReport.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def require_report_scope(
    session: AsyncSession, actor: User, department_id: str, key: str
) -> None:
    require_permission(current_user=actor, permission_key=key)
    department = await department_for(session, department_id)
    allowed = await permitted_departments(
        session, actor, department.organisation_id, key
    )
    if department_id not in allowed:
        raise HRPermissionDeniedError("Status report department access denied")


async def validate_payload(
    session: AsyncSession,
    actor: User,
    payload: StatusReportCreate | StatusReport,
    *,
    submitting: bool,
    stored_entries: list[StatusReportEntry] | None = None,
) -> None:
    await require_report_scope(
        session, actor, payload.department_id, "status.report.create"
    )
    # AM/PM/D are retained for old clients and drafts; the working editor uses M/E/N.
    if payload.shift_code not in {"M", "E", "N", "AM", "PM", "D"}:
        raise HRValidationError("Choose a morning, evening or night report shift")
    entries = (
        payload.entries
        if isinstance(payload, StatusReportCreate)
        else (stored_entries or [])
    )
    ids = [entry.user_id for entry in entries]
    if len(ids) != len(set(ids)):
        raise HRValidationError("An employee can appear only once in a shift report")
    staff_ids = set(
        (
            await session.scalars(
                select(EmploymentRecord.user_id).where(
                    EmploymentRecord.department_id == payload.department_id,
                    EmploymentRecord.user_id.in_(ids),
                )
            )
        ).all()
    )
    if set(ids) != staff_ids:
        raise HRValidationError(
            "Personnel entries must belong to the report department"
        )
    if submitting:
        if payload.shift_code in {"M", "E", "N"} and any(
            value is None
            for value in (
                payload.all_personnel_reported_on_time,
                payload.affected_operations,
                payload.all_equipment_operational,
                payload.incident_reports_submitted,
            )
        ):
            raise HRValidationError(
                "Confirm the personnel, operations, equipment and incident answers"
            )
        if any(
            entry.personnel_status == PersonnelStatus.UNCONFIRMED for entry in entries
        ):
            raise HRValidationError(
                "Confirm each employee's shift status before submitting"
            )
        required = [
            (
                payload.all_personnel_reported_on_time is False,
                payload.personnel_explanation,
                "Explain personnel who did not report on time",
            ),
            (
                payload.affected_operations is True,
                payload.affected_operations_explanation,
                "Explain the affected operations",
            ),
            (
                payload.all_equipment_operational is False,
                payload.equipment_issue_reason,
                "Explain the equipment issue",
            ),
            (
                payload.all_equipment_operational is False,
                payload.equipment_remedy_action,
                "Record the equipment remedy or action pending",
            ),
            (
                payload.incident_reports_submitted is False,
                payload.incident_explanation,
                "Explain why incident reports are outstanding",
            ),
        ]
        for needed, value, message in required:
            if needed and not (value or "").strip():
                raise HRValidationError(message)


async def staffing_for_shift(
    *,
    session: AsyncSession,
    actor: User,
    department_id: str,
    report_date: date,
    shift_code: str,
) -> StatusStaffingPublic:
    await require_report_scope(session, actor, department_id, "status.report.create")
    if shift_code not in {"M", "E", "N"}:
        raise HRValidationError("Staffing requires M, E or N")
    codes = [shift_code, "D"] if shift_code in {"M", "E"} else [shift_code]
    rows = (
        await session.execute(
            select(
                RosterAssignment,
                func.trim(func.concat(User.first_name, " ", User.last_name)),
                ShiftCatalog,
            )
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(User, User.id == RosterAssignment.user_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(
                RosterPeriod.department_id == department_id,
                RosterPeriod.status.in_(
                    [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                ),
                RosterAssignment.assignment_date == report_date,
                RosterAssignment.shift_code.in_(codes),
            )
            .order_by(
                func.trim(func.concat(User.first_name, " ", User.last_name)), User.id
            )
        )
    ).all()
    availability = await roster_service.assignment_availability(
        session, [assignment.id for assignment, _, _ in rows]
    )
    entries = []
    for assignment, name, catalog in rows:
        available = availability.get(assignment.id, RosterAvailability.SCHEDULED)
        personnel = PersonnelStatus.UNCONFIRMED
        if available == RosterAvailability.ABSENT:
            personnel = PersonnelStatus.ABSENT
        elif available == RosterAvailability.LEAVE:
            personnel = PersonnelStatus.ON_LEAVE
        entries.append(
            StatusStaffingEntry(
                roster_assignment_id=assignment.id,
                user_id=assignment.user_id,
                employee_name=name,
                scheduled_shift_code=assignment.shift_code,
                scheduled_start_time=catalog.start_time,
                scheduled_end_time=catalog.end_time,
                ends_next_day=catalog.ends_next_day,
                availability=available,
                personnel_status=personnel,
            )
        )
    return StatusStaffingPublic(
        department_id=department_id,
        report_date=report_date,
        shift_code=shift_code,
        entries=entries,
    )


async def preview_status_report_pdf(
    *, session: AsyncSession, actor: User, payload: StatusReportCreate
) -> bytes:
    await validate_payload(session, actor, payload, submitting=False)
    values = payload.model_dump(
        exclude={"signature_version", "co_approver_user_ids", "as_draft"}
    )
    name_rows = (
        await session.execute(
            select(
                User.id, func.trim(func.concat(User.first_name, " ", User.last_name))
            ).where(User.id.in_([entry.user_id for entry in payload.entries]))
        )
    ).all()
    names: dict[uuid.UUID, str] = {user_id: str(name) for user_id, name in name_rows}
    values["entries"] = [
        {**entry.model_dump(), "employee_name": names[entry.user_id]}
        for entry in payload.entries
    ]
    snapshot = await signature_service.build_document_snapshot(
        session=session,
        actor=actor,
        entity_type="status_report",
        entity_id="DRAFT",
        department_id=payload.department_id,
        values=values,
        signed_at=None,
    )
    from .pdf import render_status_pdf

    return await run_in_threadpool(render_status_pdf, snapshot, None)
