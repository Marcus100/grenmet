"""Apply the final approval and its accounting effects in the workflow transaction."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.exceptions import AppException
from src.hr.absentee.models import AbsenteeReport
from src.hr.dailystatus.models import StatusReport
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest
from src.hr.models import RequestStatus
from src.hr.parking.models import ParkingPermit
from src.hr.timesheet.models import Timesheet, TimesheetStatus
from src.hr.workflow.models import WorkflowInstance, WorkflowStatus
from src.utils.datetime import utc_now


async def finalize_entity(
    session: AsyncSession, instance: WorkflowInstance, actor_id: uuid.UUID
) -> None:
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
                        .order_by(col(WorkflowInstance.created_at).desc())
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
    if isinstance(entity, LeaveRequest) and target == RequestStatus.APPROVED:
        await session.execute(
            select(User).where(User.id == entity.user_id).with_for_update()
        )
        previous = (
            (
                await session.execute(
                    select(LeaveBalanceEvent).where(
                        LeaveBalanceEvent.related_leave_request_id == entity.id
                    )
                )
            )
            .scalars()
            .first()
        )
        if previous is None:
            last = (
                (
                    await session.execute(
                        select(LeaveBalanceEvent)
                        .where(
                            LeaveBalanceEvent.user_id == entity.user_id,
                            LeaveBalanceEvent.leave_type == entity.leave_type.value,
                        )
                        .order_by(col(LeaveBalanceEvent.created_at).desc())
                        .limit(1)
                    )
                )
                .scalars()
                .first()
            )
            from src.baseline.models import StaffCredential

            credential = await session.get(StaffCredential, entity.user_id)
            if last is None and credential is not None:
                raise AppException(
                    "Opening leave balance must be verified before approval", 409
                )
            balance = last.balance_after_days if last else 0
            session.add(
                LeaveBalanceEvent(
                    user_id=entity.user_id,
                    leave_type=entity.leave_type.value,
                    delta_days=-entity.days_requested,
                    balance_after_days=balance - entity.days_requested,
                    reason="Approved leave request",
                    related_leave_request_id=entity.id,
                    created_by_user_id=actor_id,
                )
            )
    entity.status = target
    entity.updated_at = utc_now()
    session.add(entity)
