import logging
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED,
)
from src.hr.dependencies import get_leave_request_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
)
from src.hr.models import RequestStatus
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity
from src.utils.datetime import utc_now

from .models import LeaveBalanceEvent, LeaveRequest
from .schemas import LeaveRequestAction, LeaveRequestCreate

logger = logging.getLogger(__name__)


async def create_leave_request(
    *, session: AsyncSession, current_user: User, payload: LeaveRequestCreate
) -> LeaveRequest:
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = LeaveRequest(
        user_id=current_user.id,
        department_id=payload.department_id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_requested=payload.days_requested,
        days_with_pay=payload.days_with_pay,
        days_without_pay=payload.days_without_pay,
        reason=payload.reason,
        contact_phone=payload.contact_phone,
        leave_address=payload.leave_address,
        acting_officer_id=payload.acting_officer_id,
    )
    session.add(leave_request)
    await session.commit()
    await session.refresh(leave_request)

    workflow_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="leave_request",
        entity_id=leave_request.id,
    )
    if workflow_id:
        leave_request.workflow_instance_id = workflow_id
        session.add(leave_request)
        await session.commit()
        await session.refresh(leave_request)
    logger.info(
        "Leave request created",
        extra={
            "leave_request_id": str(leave_request.id),
            "user_id": str(current_user.id),
        },
    )
    return leave_request


async def action_leave_request(
    *,
    session: AsyncSession,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestAction,
) -> LeaveRequest:
    require_permission(current_user=current_user, permission_key="leave.request.action")
    leave_request = await get_leave_request_or_404(
        session=session,
        leave_request_id=leave_request_id,
    )
    if not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=leave_request.user_id,
        permission_key="leave.request.action",
    ):
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    leave_request.status = payload.status
    if payload.head_of_dept_comments is not None:
        leave_request.head_of_dept_comments = payload.head_of_dept_comments
    leave_request.updated_at = utc_now()
    session.add(leave_request)
    if payload.status == RequestStatus.APPROVED:
        leave_type_value = leave_request.leave_type.value
        result = await session.execute(
            select(LeaveBalanceEvent)
            .where(
                col(LeaveBalanceEvent.user_id) == leave_request.user_id,
                col(LeaveBalanceEvent.leave_type) == leave_type_value,
            )
            .order_by(col(LeaveBalanceEvent.created_at).desc())
        )
        last_event = result.scalars().first()
        current_balance = (
            last_event.balance_after_days if last_event else Decimal("0.0")
        )
        new_balance = current_balance - leave_request.days_requested
        session.add(
            LeaveBalanceEvent(
                user_id=leave_request.user_id,
                leave_type=leave_type_value,
                delta_days=-leave_request.days_requested,
                balance_after_days=new_balance,
                reason="Leave request approved",
                related_leave_request_id=leave_request.id,
                created_by_user_id=current_user.id,
            )
        )
    await session.commit()
    await session.refresh(leave_request)
    logger.info(
        "Leave request actioned",
        extra={
            "leave_request_id": str(leave_request.id),
            "status": leave_request.status.value,
            "actor_id": str(current_user.id),
        },
    )
    return leave_request


async def list_leave_requests(
    *, session: AsyncSession, current_user: User
) -> list[LeaveRequest]:
    result = await session.execute(
        select(LeaveRequest)
        .where(col(LeaveRequest.user_id) == current_user.id)
        .order_by(col(LeaveRequest.created_at).desc())
        .limit(100)
    )
    return list(result.scalars().all())
