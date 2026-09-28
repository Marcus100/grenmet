import logging
import re
import uuid
from datetime import date, datetime, time, timedelta

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_ABSENTEE_FILE_FOR_USER_NOT_ALLOWED,
    ERROR_ABSENTEE_REASON_REQUIRES_NOTES,
    ERROR_ABSENTEE_REPORT_ACTION_NOT_ALLOWED,
    ERROR_ABSENTEE_REPORT_NOT_DRAFT,
)
from src.hr.dependencies import get_absentee_report_or_404
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.models import RequestStatus
from src.hr.roster.expansion import expand_shift
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.signatures import service as signature_service
from src.hr.workflow.models import WorkflowInstance, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from .models import ABSENCE_REASONS_REQUIRING_NOTES, AbsenceReason, AbsenteeReport
from .schemas import AbsenteeReportCreate, AbsenteeReportSubmit

logger = logging.getLogger(__name__)


async def expected_shift(
    session: AsyncSession, user_id: uuid.UUID, department_id: str, report_date: date
) -> str | None:
    codes = (
        await session.scalars(
            select(RosterAssignment.shift_code)
            .distinct()
            .join(RosterPeriod, RosterAssignment.roster_period_id == RosterPeriod.id)
            .join(ShiftCatalog, RosterAssignment.shift_code == ShiftCatalog.code)
            .where(
                RosterAssignment.user_id == user_id,
                RosterAssignment.assignment_date == report_date,
                RosterPeriod.department_id == department_id,
                RosterPeriod.status.in_(
                    [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                ),
                ShiftCatalog.category == ShiftCategory.WORK,
            )
        )
    ).all()
    return codes[0] if len(codes) == 1 else None


async def prepare_absentee_fields(
    session: AsyncSession, payload: AbsenteeReportCreate | AbsenteeReport
) -> None:
    if bool(payload.absence_start_time) != bool(payload.absence_end_time):
        raise HRValidationError(
            "Enter both absence times or leave both blank for the full shift"
        )
    for clock_time in (payload.absence_start_time, payload.absence_end_time):
        if clock_time and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", clock_time):
            raise HRValidationError("Absence times must use HH:MM in local time")
    if payload.expected_shift_code:
        shift = await session.get(ShiftCatalog, payload.expected_shift_code)
        if shift is None or shift.category != ShiftCategory.WORK:
            raise HRValidationError("Choose a work shift from the shift catalogue")
    else:
        payload.expected_shift_code = await expected_shift(
            session, payload.user_id, payload.department_id, payload.report_date
        )
    if payload.absence_start_time and payload.absence_end_time:
        if payload.absence_start_time == payload.absence_end_time:
            raise HRValidationError(
                "Absence start and end must be different; leave both blank for a full shift"
            )
        shift = (
            await session.get(ShiftCatalog, payload.expected_shift_code)
            if payload.expected_shift_code
            else None
        )
        interval = expand_shift(payload.report_date, shift) if shift else None
        if interval:
            scheduled_start, scheduled_end = interval
            starts = datetime.combine(
                payload.report_date, time.fromisoformat(payload.absence_start_time)
            )
            if shift and shift.ends_next_day and starts < scheduled_start:
                starts += timedelta(days=1)
            ends = datetime.combine(
                starts.date(), time.fromisoformat(payload.absence_end_time)
            )
            if ends <= starts:
                ends += timedelta(days=1)
            if starts < scheduled_start or ends > scheduled_end:
                raise HRValidationError(
                    "Absence times must fall within the expected shift"
                )


async def validate_absentee_report(
    *,
    session: AsyncSession,
    current_user: User,
    user_id: uuid.UUID,
    reason: AbsenceReason,
    notes: str | None,
    department_id: str,
    submitting: bool = True,
) -> None:
    """Apply the same subject access and reason checks on every write path."""
    if user_id != current_user.id and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
        permission_key="absentee.report.create",
    ):
        raise HRPermissionDeniedError(ERROR_ABSENTEE_FILE_FOR_USER_NOT_ALLOWED)
    if (
        submitting
        and reason in ABSENCE_REASONS_REQUIRING_NOTES
        and not (notes and notes.strip())
    ):
        raise HRValidationError(ERROR_ABSENTEE_REASON_REQUIRES_NOTES)
    from src.baseline import service as baseline_service

    employment = await baseline_service.employment_for(session, user_id)
    if not employment or employment.department_id != department_id:
        raise HRPermissionDeniedError("The employee does not belong to this department")


async def preview_absentee_report_pdf(
    *, session: AsyncSession, current_user: User, payload: AbsenteeReportCreate
) -> bytes:
    require_permission(
        current_user=current_user, permission_key="absentee.report.create"
    )
    await validate_absentee_report(
        session=session,
        current_user=current_user,
        user_id=payload.user_id,
        reason=payload.reason,
        notes=payload.notes,
        department_id=payload.department_id,
        submitting=False,
    )
    await prepare_absentee_fields(session, payload)
    values = payload.model_dump(
        exclude={"as_draft", "signature_version", "co_approver_user_ids"}
    )
    snapshot = await signature_service.build_document_snapshot(
        session=session,
        actor=current_user,
        entity_type="absentee_report",
        entity_id="DRAFT",
        department_id=payload.department_id,
        values=values,
        signed_at=None,
    )
    return await run_in_threadpool(signature_service.render_pdf, snapshot, None)


async def create_absentee_report(
    *, session: AsyncSession, current_user: User, payload: AbsenteeReportCreate
) -> AbsenteeReport:
    require_permission(
        current_user=current_user, permission_key="absentee.report.create"
    )
    await validate_absentee_report(
        session=session,
        current_user=current_user,
        user_id=payload.user_id,
        reason=payload.reason,
        notes=payload.notes,
        department_id=payload.department_id,
        submitting=not payload.as_draft,
    )
    await prepare_absentee_fields(session, payload)
    report = AbsenteeReport(
        user_id=payload.user_id,
        department_id=payload.department_id,
        report_date=payload.report_date,
        expected_shift_code=payload.expected_shift_code,
        absence_start_time=payload.absence_start_time,
        absence_end_time=payload.absence_end_time,
        reason=payload.reason,
        notes=payload.notes,
        contact_attempted=payload.contact_attempted,
        contact_method=payload.contact_method,
        replacement_arranged=payload.replacement_arranged,
        replacement_user_id=payload.replacement_user_id,
        submitted_by_user_id=current_user.id,
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
    )
    # Flush to obtain the id, then start the workflow and commit once so the
    # report and its workflow instance are persisted atomically.
    session.add(report)
    await session.flush()
    report.workflow_instance_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.ABSENTEE_REPORT,
        entity_type="absentee_report",
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
            entity_type="absentee_report",
            signature_version=payload.signature_version,
        )
    await session.commit()
    await session.refresh(report)
    logger.info(
        "Absentee report created",
        extra={"report_id": str(report.id), "user_id": str(current_user.id)},
    )
    return report


async def submit_absentee_report(
    *,
    session: AsyncSession,
    current_user: User,
    absentee_report_id: uuid.UUID,
    payload: AbsenteeReportSubmit,
) -> AbsenteeReport:
    """Submit a previously-saved DRAFT absentee report into the approval chain."""
    require_permission(
        current_user=current_user, permission_key="absentee.report.create"
    )
    report = await get_absentee_report_or_404(
        session=session, report_id=absentee_report_id
    )
    if report.submitted_by_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_ABSENTEE_REPORT_ACTION_NOT_ALLOWED)
    if report.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_ABSENTEE_REPORT_NOT_DRAFT)

    await validate_absentee_report(
        session=session,
        current_user=current_user,
        user_id=report.user_id,
        reason=report.reason,
        notes=report.notes,
        department_id=report.department_id,
    )
    await prepare_absentee_fields(session, report)

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
            workflow_type=WorkflowType.ABSENTEE_REPORT,
            entity_type="absentee_report",
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
        entity_type="absentee_report",
        signature_version=payload.signature_version,
    )
    await session.commit()
    await session.refresh(report)
    logger.info(
        "Absentee report submitted from draft",
        extra={"report_id": str(report.id), "user_id": str(current_user.id)},
    )
    return report


async def update_absentee_report(
    *,
    session: AsyncSession,
    current_user: User,
    absentee_report_id: uuid.UUID,
    payload: AbsenteeReportCreate,
) -> AbsenteeReport:
    """Edit a still-DRAFT absentee report in place (no new record is created)."""
    require_permission(
        current_user=current_user, permission_key="absentee.report.create"
    )
    report = await get_absentee_report_or_404(
        session=session, report_id=absentee_report_id
    )
    if report.submitted_by_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_ABSENTEE_REPORT_ACTION_NOT_ALLOWED)
    if report.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_ABSENTEE_REPORT_NOT_DRAFT)

    await validate_absentee_report(
        session=session,
        current_user=current_user,
        user_id=payload.user_id,
        reason=payload.reason,
        notes=payload.notes,
        department_id=payload.department_id,
        submitting=not payload.as_draft,
    )

    if payload.department_id != report.department_id:
        raise HRValidationError("A draft cannot change its workflow department")
    await prepare_absentee_fields(session, payload)

    report.user_id = payload.user_id
    report.department_id = payload.department_id
    report.report_date = payload.report_date
    report.expected_shift_code = payload.expected_shift_code
    report.absence_start_time = payload.absence_start_time
    report.absence_end_time = payload.absence_end_time
    report.reason = payload.reason
    report.notes = payload.notes
    report.contact_attempted = payload.contact_attempted
    report.contact_method = payload.contact_method
    report.replacement_arranged = payload.replacement_arranged
    report.replacement_user_id = payload.replacement_user_id
    report.updated_at = utc_now()
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def delete_absentee_report(
    *, session: AsyncSession, current_user: User, absentee_report_id: uuid.UUID
) -> None:
    """Delete an own DRAFT absentee report (and its unstarted workflow)."""
    require_permission(
        current_user=current_user, permission_key="absentee.report.create"
    )
    report = await get_absentee_report_or_404(
        session=session, report_id=absentee_report_id
    )
    if report.submitted_by_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_ABSENTEE_REPORT_ACTION_NOT_ALLOWED)
    if report.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_ABSENTEE_REPORT_NOT_DRAFT)

    workflow_instance_id = report.workflow_instance_id
    # Delete the report first (it holds the FK to the instance), then the
    # DRAFT instance itself (a draft has no step rows to clean up).
    await session.delete(report)
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance:
            await session.delete(instance)
    await session.commit()


async def list_absentee_reports(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[AbsenteeReport], int]:
    statement = select(AbsenteeReport)
    if department_id:
        require_permission(
            current_user=current_user,
            permission_key="absentee.report.read.department",
        )
        from src.hr import organisations

        department = await organisations.department_for(session, department_id)
        await organisations.require_organisation_permission(
            session,
            current_user,
            department.organisation_id,
            "absentee.report.read.department",
            department_id,
        )
        statement = statement.where(AbsenteeReport.department_id == department_id)
    else:
        statement = statement.where(
            or_(
                AbsenteeReport.user_id == current_user.id,
                AbsenteeReport.submitted_by_user_id == current_user.id,
            )
        )
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    result = await session.execute(
        statement.order_by(AbsenteeReport.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0
