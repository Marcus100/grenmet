import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_ABSENTEE_FILE_FOR_USER_NOT_ALLOWED,
    ERROR_ABSENTEE_REASON_REQUIRES_NOTES,
)
from src.hr.exceptions import HRPermissionDeniedError, HRValidationError
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

from .models import ABSENCE_REASONS_REQUIRING_NOTES, AbsenteeReport
from .schemas import AbsenteeReportCreate

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
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    logger.info(
        "Absentee report created",
        extra={"report_id": str(report.id), "user_id": str(current_user.id)},
    )
    return report


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
    total = await session.scalar(
        select(func.count()).select_from(statement.subquery())
    )
    result = await session.execute(
        statement.order_by(col(AbsenteeReport.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), total or 0
