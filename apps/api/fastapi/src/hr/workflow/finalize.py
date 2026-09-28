"""Apply the final approval and its accounting effects in the workflow transaction."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.hr.absentee.models import AbsenteeReport
from src.hr.dailystatus.models import StatusReport
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.leave import ledger
from src.hr.leave.models import LeaveEntryKind, LeaveRequest
from src.hr.models import RequestStatus
from src.hr.parking.models import ParkingPermit
from src.hr.timesheet.models import Timesheet, TimesheetStatus
from src.hr.workflow.models import WorkflowInstance, WorkflowStatus
from src.utils.datetime import utc_now


async def finalize_entity(
    session: AsyncSession, instance: WorkflowInstance, actor_id: uuid.UUID
) -> None:
    if instance.entity_type == "attendance_correction":
        from src.hr.attendance.models import AttendanceCorrection, AttendanceRecord
        from src.hr.workflow.models import WorkflowType

        correction = await session.get(AttendanceCorrection, instance.entity_id)
        if correction is None:
            raise AppException("Attendance correction not found", 409)
        attendance = await session.scalar(
            select(AttendanceRecord)
            .where(AttendanceRecord.id == correction.attendance_id)
            .with_for_update()
        )
        if (
            attendance is None
            or correction.workflow_instance_id != instance.id
            or attendance.department_id != instance.department_id
            or attendance.user_id != instance.requested_by_user_id
            or instance.workflow_type != WorkflowType.TIMESHEET
        ):
            raise AppException(
                "Workflow does not match this attendance correction", 409
            )
        if instance.status == WorkflowStatus.APPROVED:
            if attendance.revision != correction.expected_revision:
                raise AppException("Attendance changed; propose a new correction", 409)
            attendance.arrived_at = correction.arrived_at
            attendance.departed_at = correction.departed_at
            attendance.break_minutes = correction.break_minutes
            attendance.revision += 1
            attendance.workflow_instance_id = instance.id
            attendance.updated_at = utc_now()
        return
    if instance.entity_type == "attendance":
        from src.hr.attendance.models import AttendanceRecord
        from src.hr.workflow.models import WorkflowType

        attendance = await session.get(AttendanceRecord, instance.entity_id)
        if (
            attendance is None
            or attendance.workflow_instance_id != instance.id
            or attendance.department_id != instance.department_id
            or attendance.user_id != instance.requested_by_user_id
            or instance.workflow_type != WorkflowType.TIMESHEET
            or attendance.departed_at is None
        ):
            raise AppException("Workflow does not match this attendance revision", 409)
        return
    if instance.entity_type == "timesheet":
        timesheet = await session.get(Timesheet, instance.entity_id)
        if timesheet:
            latest = (
                (
                    await session.execute(
                        select(WorkflowInstance)
                        .where(
                            WorkflowInstance.entity_type == "timesheet",
                            WorkflowInstance.entity_id == timesheet.id,
                        )
                        .order_by(WorkflowInstance.created_at.desc())
                        .limit(1)
                    )
                )
                .scalars()
                .first()
            )
            if (
                timesheet.user_id != instance.requested_by_user_id
                or timesheet.department_id != instance.department_id
                or latest is None
                or latest.id != instance.id
            ):
                raise AppException("Workflow does not match this timesheet", 409)
            approved = instance.status == WorkflowStatus.APPROVED
            timesheet.status = (
                TimesheetStatus.APPROVED if approved else TimesheetStatus.REJECTED
            )
            timesheet.approved_by_user_id = actor_id if approved else None
            timesheet.approved_at = utc_now() if approved else None
            timesheet.updated_at = utc_now()
            session.add(timesheet)
        return
    models = {
        "leave_request": LeaveRequest,
        "shift_swap": ShiftSwapRequest,
        "absentee_report": AbsenteeReport,
        "status_report": StatusReport,
        "parking_permit": ParkingPermit,
    }
    model = models.get(instance.entity_type)
    if model is None:
        return
    entity = await session.get(model, instance.entity_id)
    if not isinstance(
        entity,
        (LeaveRequest, ShiftSwapRequest, AbsenteeReport, StatusReport, ParkingPermit),
    ):
        return
    if (
        entity.workflow_instance_id != instance.id
        or entity.department_id != instance.department_id
    ):
        raise AppException("Workflow does not match this HR record", 409)
    expected_type = {
        "leave_request": "LEAVE_REQUEST",
        "shift_swap": "SHIFT_SWAP",
        "absentee_report": "ABSENTEE_REPORT",
        "status_report": "STATUS_REPORT",
        "parking_permit": "PARKING_PERMIT",
    }[instance.entity_type]
    if instance.workflow_type.value != expected_type:
        raise AppException("Workflow type does not match this HR record", 409)
    target = (
        RequestStatus.APPROVED
        if instance.status == WorkflowStatus.APPROVED
        else RequestStatus.REJECTED
    )
    if entity.status == target:
        return
    if isinstance(entity, ShiftSwapRequest) and target == RequestStatus.APPROVED:
        from src.hr.exchange import roster_effects

        if not entity.counterpart_agreed:
            raise AppException(
                "The other employee must agree before final approval", 400
            )
        await roster_effects.apply_exchange(session, entity, actor_id)
    if isinstance(entity, LeaveRequest) and target == RequestStatus.APPROVED:
        from src.baseline.models import StaffCredential

        credential = await session.get(StaffCredential, entity.user_id)
        if credential is not None and not await ledger.has_entry(
            session, entity.user_id, entity.leave_type.value
        ):
            raise AppException(
                "Opening leave balance must be verified before approval", 409
            )
        await ledger.post(
            session,
            user_id=entity.user_id,
            leave_type=entity.leave_type.value,
            kind=LeaveEntryKind.APPROVAL_DEBIT,
            delta=-entity.days_requested,
            reason="Approved leave request",
            actor_id=actor_id,
            leave_request_id=entity.id,
        )
    entity.status = target
    entity.updated_at = utc_now()
    session.add(entity)
