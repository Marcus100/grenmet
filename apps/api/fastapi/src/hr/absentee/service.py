import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

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
from src.hr.workflow.models import WorkflowInstance, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from .models import ABSENCE_REASONS_REQUIRING_NOTES, AbsenteeReport
from .schemas import AbsenteeReportCreate, AbsenteeReportSubmit

logger = logging.getLogger(__name__)


async def create_absentee_report(
    *, session: AsyncSession, current_user: User, payload: AbsenteeReportCreate
) -> AbsenteeReport:
    require_permission(
        current_user=current_user, permission_key="absentee.report.create"
    )
    # Filing for another user requires dept-scoped authority over that user, not
    # just the flat create permission (mirrors the timesheet proxy pattern).
    if payload.user_id != current_user.id and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=payload.user_id,
        permission_key="absentee.report.create",
    ):
        raise HRPermissionDeniedError(ERROR_ABSENTEE_FILE_FOR_USER_NOT_ALLOWED)
    if payload.reason in ABSENCE_REASONS_REQUIRING_NOTES and not (
        payload.notes and payload.notes.strip()
    ):
        raise HRValidationError(ERROR_ABSENTEE_REASON_REQUIRES_NOTES)
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
        statement = statement.where(col(AbsenteeReport.department_id) == department_id)
    else:
        statement = statement.where(col(AbsenteeReport.user_id) == current_user.id)
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    result = await session.execute(
        statement.order_by(col(AbsenteeReport.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), total or 0
