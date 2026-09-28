"""Capture actual punches and submit each shift through the timesheet workflow."""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.exceptions import AppException
from src.hr.models import Department, EmploymentRecord
from src.hr.organisations import require_organisation_permission
from src.hr.roster.expansion import expand_shift
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowType,
)
from src.utils.datetime import utc_now

from .models import AttendanceCorrection, AttendanceRecord
from .schemas import AttendanceCorrectionCreate, AttendanceSave

logger = logging.getLogger(__name__)
GRENADA = ZoneInfo("America/Grenada")


def utc_naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


def week_bounds(day: date) -> tuple[date, date]:
    start = day - timedelta(days=(day.weekday() + 1) % 7)
    return start, start + timedelta(days=6)


def scheduled_bounds(
    assignment: RosterAssignment, shift: ShiftCatalog
) -> tuple[datetime, datetime]:
    try:
        interval = expand_shift(assignment.assignment_date, shift)
    except ValueError as exc:
        raise AppException("Work shift start and end times are invalid", 409) from exc
    if interval is None:
        raise AppException("Work shift start and end times are not configured", 409)
    start, end = interval
    return utc_naive(start.replace(tzinfo=GRENADA)), utc_naive(
        end.replace(tzinfo=GRENADA)
    )


def actual_hours(record: AttendanceRecord) -> Decimal | None:
    if record.departed_at is None:
        return None
    minutes = Decimal(
        str((record.departed_at - record.arrived_at).total_seconds())
    ) / Decimal(60)
    return ((minutes - record.break_minutes) / Decimal(60)).quantize(Decimal("0.01"))


def elapsed_hours(record: AttendanceRecord) -> Decimal | None:
    if record.departed_at is None:
        return None
    return (
        Decimal(str((record.departed_at - record.arrived_at).total_seconds()))
        / Decimal(3600)
    ).quantize(Decimal("0.01"))


async def _require_subject(
    session: AsyncSession, actor: User, target: uuid.UUID, department_id: str
) -> None:
    key = "timesheet.submit.self" if actor.id == target else "timesheet.submit.proxy"
    require_permission(current_user=actor, permission_key=key)
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == target)
    )
    if employment is None or employment.department_id != department_id:
        raise AppException("Employee does not belong to this roster department", 400)
    if actor.id != target and not await can_act_on_user(
        session=session, current_user=actor, target_user_id=target, permission_key=key
    ):
        raise AppException("Not allowed to record this employee's attendance", 403)


async def save_attendance(
    *, session: AsyncSession, current_user: User, payload: AttendanceSave
) -> AttendanceRecord:
    # Lock the schedule row too: concurrent first punches must serialize before
    # checking the unique attendance row, so retries cannot create duplicates.
    code = await session.scalar(
        select(RosterAssignment.shift_code).where(
            RosterAssignment.id == payload.roster_assignment_id
        )
    )
    if code is None:
        raise AppException("Roster assignment not found", 404)
    # Catalogue first, assignment second is shared with roster writes. This
    # serializes timing edits even when the first assignment is being created.
    shift = await session.scalar(
        select(ShiftCatalog)
        .where(ShiftCatalog.code == code)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if shift is None:
        raise AppException("Shift not found", 404)
    row = (
        await session.execute(
            select(RosterAssignment, RosterPeriod)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .where(RosterAssignment.id == payload.roster_assignment_id)
            .with_for_update(of=RosterAssignment)
            .execution_options(populate_existing=True)
        )
    ).first()
    if row is None:
        raise AppException("Roster assignment not found", 404)
    assignment, period = row
    if assignment.shift_code != code:
        raise AppException("Roster changed; reload before recording attendance", 409)
    await _require_subject(
        session, current_user, assignment.user_id, period.department_id
    )
    if (
        period.status != RosterPeriodStatus.PUBLISHED
        or shift.category != ShiftCategory.WORK
    ):
        raise AppException("Attendance requires a published work shift", 400)
    record = await session.scalar(
        select(AttendanceRecord)
        .where(AttendanceRecord.roster_assignment_id == assignment.id)
        .with_for_update()
    )
    arrived, departed = validate_times(assignment, shift, payload)
    if record:
        same_values = (
            record.arrived_at == arrived
            and record.departed_at == departed
            and record.break_minutes == payload.break_minutes
            and record.notes == payload.notes
        )
        workflow = (
            await session.get(WorkflowInstance, record.workflow_instance_id)
            if record.workflow_instance_id
            else None
        )
        terminal_review = workflow and workflow.status in {
            WorkflowStatus.REJECTED,
            WorkflowStatus.RETURNED,
            WorkflowStatus.CANCELLED,
        }
        if same_values and not terminal_review:
            return record  # Retries of active reviews remain idempotent.
        if record.revision != payload.expected_revision:
            raise AppException("Attendance changed; reload before saving", 409)
        if (
            record.arrived_at != arrived
            or (record.departed_at is not None and record.departed_at != departed)
        ) and not (payload.notes and payload.notes.strip()):
            raise AppException(
                "Explain changes to previously recorded arrival or departure in shift remarks",
                400,
            )
        if workflow and workflow.status not in {
            WorkflowStatus.REJECTED,
            WorkflowStatus.RETURNED,
            WorkflowStatus.CANCELLED,
        }:
            raise AppException("Submitted or approved attendance cannot be edited", 409)
        # A correction creates a fresh authoritative review, retaining the old
        # workflow and audit values rather than reusing a prior approval.
        record.workflow_instance_id = None
        record.revision += 1
    else:
        if payload.expected_revision != 0:
            raise AppException("Attendance no longer matches this revision", 409)
        record = AttendanceRecord(
            roster_assignment_id=assignment.id,
            user_id=assignment.user_id,
            department_id=period.department_id,
        )
    record.arrived_at, record.departed_at = arrived, departed
    record.break_minutes, record.notes = payload.break_minutes, payload.notes
    record.updated_at = utc_now()
    session.add(record)
    await session.commit()
    await session.refresh(record)
    logger.info(
        "Attendance recorded",
        extra={"attendance_id": str(record.id), "revision": record.revision},
    )
    return record


async def submit_attendance(
    *,
    session: AsyncSession,
    current_user: User,
    attendance_id: uuid.UUID,
    expected_revision: int,
) -> AttendanceRecord:
    record = await session.scalar(
        select(AttendanceRecord)
        .where(AttendanceRecord.id == attendance_id)
        .with_for_update()
    )
    if record is None:
        raise AppException("Attendance not found", 404)
    await _require_subject(session, current_user, record.user_id, record.department_id)
    if record.revision != expected_revision:
        raise AppException("Attendance changed; reload before submitting", 409)
    if record.workflow_instance_id:
        workflow = await session.get(WorkflowInstance, record.workflow_instance_id)
        if workflow is None or workflow.status not in {
            WorkflowStatus.REJECTED,
            WorkflowStatus.RETURNED,
            WorkflowStatus.CANCELLED,
        }:
            return record  # Idempotent while this revision is under review/approved.
        record.revision += 1
        # Keep the old instance and its steps as historical evidence.
        record.workflow_instance_id = None
    if record.departed_at is None:
        raise AppException(
            "Record departure before submitting for supervisor review", 400
        )
    owner = await session.get(User, record.user_id)
    if owner is None:
        raise AppException("Employee not found", 404)
    record.workflow_instance_id = await workflow_service.start_workflow_for_entity(
        session=session,
        current_user=owner,
        department_id=record.department_id,
        workflow_type=WorkflowType.TIMESHEET,
        entity_type="attendance",
        entity_id=record.id,
    )
    instance = await session.get(WorkflowInstance, record.workflow_instance_id)
    if instance:
        instance.allow_self_approval = False
        instance.require_distinct_approvers = True
    record.updated_at = utc_now()
    await session.commit()
    return record


async def week_rows(
    *,
    session: AsyncSession,
    current_user: User,
    day: date,
    department_id: str | None = None,
) -> tuple[
    date,
    date,
    list[
        tuple[
            RosterAssignment,
            RosterPeriod,
            ShiftCatalog,
            User,
            AttendanceRecord | None,
            WorkflowInstance | None,
        ]
    ],
]:
    start, end = week_bounds(day)
    query = (
        select(
            RosterAssignment,
            RosterPeriod,
            ShiftCatalog,
            User,
            AttendanceRecord,
            WorkflowInstance,
        )
        .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
        .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
        .join(User, User.id == RosterAssignment.user_id)
        .outerjoin(
            AttendanceRecord,
            AttendanceRecord.roster_assignment_id == RosterAssignment.id,
        )
        .outerjoin(
            WorkflowInstance,
            WorkflowInstance.id == AttendanceRecord.workflow_instance_id,
        )
        .where(
            RosterAssignment.assignment_date.between(start, end),
            RosterPeriod.status.in_(
                [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
            ),
            ShiftCatalog.category == ShiftCategory.WORK,
        )
    )
    if department_id:
        department = await session.get(Department, department_id)
        if department is None:
            raise AppException("Department not found", 404)
        await require_organisation_permission(
            session,
            current_user,
            department.organisation_id,
            "timesheet.read.department",
            department_id,
        )
        query = query.where(RosterPeriod.department_id == department_id)
    else:
        query = query.where(RosterAssignment.user_id == current_user.id)
    rows = (
        await session.execute(
            query.order_by(
                RosterAssignment.assignment_date,
                User.last_name,
                User.first_name,
                RosterAssignment.shift_code,
            )
        )
    ).all()
    return start, end, [tuple(row) for row in rows]


def validate_times(
    assignment: RosterAssignment, shift: ShiftCatalog, payload: AttendanceSave
) -> tuple[datetime, datetime | None]:
    arrived = utc_naive(payload.arrived_at)
    departed = utc_naive(payload.departed_at) if payload.departed_at else None
    if arrived > utc_now() + timedelta(minutes=1) or (
        departed and departed > utc_now() + timedelta(minutes=1)
    ):
        raise AppException("Arrival and departure cannot be in the future", 400)
    scheduled_start, _ = scheduled_bounds(assignment, shift)
    if abs(arrived - scheduled_start) > timedelta(hours=24):
        raise AppException(
            "Arrival must be within 24 hours of the scheduled shift start", 400
        )
    if departed and (departed <= arrived or departed - arrived > timedelta(hours=24)):
        raise AppException("Departure must follow arrival within 24 hours", 400)
    if (departed is None and payload.break_minutes) or (
        departed and payload.break_minutes >= (departed - arrived).total_seconds() / 60
    ):
        raise AppException(
            "Break time must be shorter than the recorded attendance", 400
        )
    return arrived, departed


async def propose_correction(
    *,
    session: AsyncSession,
    current_user: User,
    attendance_id: uuid.UUID,
    payload: AttendanceCorrectionCreate,
) -> AttendanceCorrection:
    record = await session.scalar(
        select(AttendanceRecord)
        .where(AttendanceRecord.id == attendance_id)
        .with_for_update()
    )
    if record is None:
        raise AppException("Attendance not found", 404)
    await _require_subject(session, current_user, record.user_id, record.department_id)
    if (
        payload.roster_assignment_id != record.roster_assignment_id
        or payload.expected_revision != record.revision
    ):
        raise AppException(
            "Attendance changed; reload before proposing a correction", 409
        )
    if not payload.reason.strip():
        raise AppException("Explain why the attendance time needs correction", 400)
    assignment, shift = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(RosterAssignment.id == record.roster_assignment_id)
        )
    ).one()
    arrived, departed = validate_times(assignment, shift, payload)
    assert departed is not None
    pending = await session.scalar(
        select(AttendanceCorrection)
        .join(
            WorkflowInstance,
            WorkflowInstance.id == AttendanceCorrection.workflow_instance_id,
        )
        .where(
            AttendanceCorrection.attendance_id == record.id,
            WorkflowInstance.status == WorkflowStatus.PENDING,
        )
    )
    if pending:
        if (
            pending.arrived_at == arrived
            and pending.departed_at == departed
            and pending.break_minutes == payload.break_minutes
            and pending.reason == payload.reason.strip()
        ):
            return pending
        raise AppException("A correction is already awaiting supervisor review", 409)
    correction = AttendanceCorrection(
        attendance_id=record.id,
        proposed_by_user_id=current_user.id,
        expected_revision=record.revision,
        arrived_at=arrived,
        departed_at=departed,
        break_minutes=payload.break_minutes,
        reason=payload.reason.strip(),
    )
    session.add(correction)
    await session.flush()
    owner = await session.get(User, record.user_id)
    assert owner is not None
    correction.workflow_instance_id = await workflow_service.start_workflow_for_entity(
        session=session,
        current_user=owner,
        department_id=record.department_id,
        workflow_type=WorkflowType.TIMESHEET,
        entity_type="attendance_correction",
        entity_id=correction.id,
    )
    workflow = await session.get(WorkflowInstance, correction.workflow_instance_id)
    if workflow:
        workflow.allow_self_approval = False
        workflow.require_distinct_approvers = True
    await session.commit()
    return correction


async def read_review(
    *,
    session: AsyncSession,
    current_user: User,
    attendance_id: uuid.UUID | None,
    correction_id: uuid.UUID | None,
) -> tuple[AttendanceRecord, list[tuple[AttendanceCorrection, WorkflowStatus | None]]]:
    if (attendance_id is None) == (correction_id is None):
        raise AppException("Supply an attendance ID or a correction ID", 400)
    correction = (
        await session.get(AttendanceCorrection, correction_id)
        if correction_id
        else None
    )
    if correction_id and correction is None:
        raise AppException("Correction not found", 404)
    record = await session.get(
        AttendanceRecord, correction.attendance_id if correction else attendance_id
    )
    if record is None:
        raise AppException("Attendance not found", 404)
    allowed = current_user.id == record.user_id
    if not allowed:
        department = await session.get(Department, record.department_id)
        if department:
            for key in ("timesheet.read.department", "timesheet.approve"):
                try:
                    await require_organisation_permission(
                        session,
                        current_user,
                        department.organisation_id,
                        key,
                        record.department_id,
                    )
                except AppException as exc:
                    if exc.status_code != 403:
                        raise
                else:
                    allowed = True
                    break
    if not allowed:
        instance_id = (
            correction.workflow_instance_id
            if correction
            else record.workflow_instance_id
        )
        allowed = bool(
            await session.scalar(
                select(WorkflowStepInstance.id)
                .where(
                    WorkflowStepInstance.workflow_instance_id == instance_id,
                    WorkflowStepInstance.required_user_id == current_user.id,
                )
                .limit(1)
            )
        )
    if not allowed:
        raise AppException("Attendance access denied", 403)
    rows = (
        await session.execute(
            select(AttendanceCorrection, WorkflowInstance.status)
            .outerjoin(
                WorkflowInstance,
                WorkflowInstance.id == AttendanceCorrection.workflow_instance_id,
            )
            .where(AttendanceCorrection.attendance_id == record.id)
            .order_by(AttendanceCorrection.created_at.desc())
        )
    ).all()
    return record, [tuple(row) for row in rows]


async def review_metadata(
    session: AsyncSession, instance_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[str, datetime]]:
    if not instance_ids:
        return {}
    rows = (
        await session.execute(
            select(
                WorkflowStepInstance.workflow_instance_id,
                func.concat(User.first_name, " ", User.last_name),
                WorkflowStepInstance.acted_at,
            )
            .join(User, User.id == WorkflowStepInstance.approver_user_id)
            .where(
                WorkflowStepInstance.workflow_instance_id.in_(instance_ids),
                WorkflowStepInstance.action == WorkflowAction.APPROVE,
            )
            .distinct(WorkflowStepInstance.workflow_instance_id)
            .order_by(
                WorkflowStepInstance.workflow_instance_id,
                WorkflowStepInstance.acted_at.desc(),
            )
        )
    ).all()
    return {
        instance_id: (name, acted_at)
        for instance_id, name, acted_at in rows
        if acted_at is not None
    }
