import logging
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED,
    ERROR_LEAVE_REQUEST_NOT_DRAFT,
)
from src.hr.dependencies import get_leave_request_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import RequestStatus
from src.hr.workflow.models import WorkflowInstance, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from .models import LeaveBalanceEvent, LeaveRequest
from .schemas import LeaveRequestAction, LeaveRequestCreate, LeaveRequestSubmit

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
        professional_appointment_subtype=payload.professional_appointment_subtype,
        reason=payload.reason,
        contact_phone=payload.contact_phone,
        leave_address=payload.leave_address,
        travel_from_date=payload.travel_from_date,
        travel_to_date=payload.travel_to_date,
        salary_in_advance=payload.salary_in_advance,
        requires_acting_appointment=payload.requires_acting_appointment,
        acting_officer_id=payload.acting_officer_id,
        expected_return_date=payload.expected_return_date,
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
    )
    # Flush to obtain the id, then start the workflow and commit once so the
    # request and its workflow instance are persisted atomically.
    session.add(leave_request)
    await session.flush()

    workflow_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="leave_request",
        entity_id=leave_request.id,
        co_approver_user_ids=payload.co_approver_user_ids,
        submit=not payload.as_draft,
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
            "as_draft": payload.as_draft,
        },
    )
    return leave_request


async def submit_leave_request(
    *,
    session: AsyncSession,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestSubmit,
) -> LeaveRequest:
    """Submit a previously-saved DRAFT leave request into the approval chain."""
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )
    if leave_request.user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if leave_request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_LEAVE_REQUEST_NOT_DRAFT)

    if leave_request.workflow_instance_id:
        await submit_draft_workflow(
            session=session,
            current_user=current_user,
            workflow_instance_id=leave_request.workflow_instance_id,
            co_approver_user_ids=payload.co_approver_user_ids,
            commit=False,
        )
    else:
        # Drafted before a template existed for the department — start fresh.
        workflow_id = await start_workflow_for_entity(
            session=session,
            current_user=current_user,
            department_id=leave_request.department_id,
            workflow_type=WorkflowType.LEAVE_REQUEST,
            entity_type="leave_request",
            entity_id=leave_request.id,
            co_approver_user_ids=payload.co_approver_user_ids,
            submit=True,
        )
        if workflow_id:
            leave_request.workflow_instance_id = workflow_id

    leave_request.status = RequestStatus.SUBMITTED
    leave_request.updated_at = utc_now()
    session.add(leave_request)
    await session.commit()
    await session.refresh(leave_request)
    logger.info(
        "Leave request submitted from draft",
        extra={
            "leave_request_id": str(leave_request.id),
            "user_id": str(current_user.id),
        },
    )
    return leave_request


async def update_leave_request(
    *,
    session: AsyncSession,
    current_user: User,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestCreate,
) -> LeaveRequest:
    """Edit a still-DRAFT leave request in place (no new record is created)."""
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )
    if leave_request.user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if leave_request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_LEAVE_REQUEST_NOT_DRAFT)

    leave_request.department_id = payload.department_id
    leave_request.leave_type = payload.leave_type
    leave_request.start_date = payload.start_date
    leave_request.end_date = payload.end_date
    leave_request.days_requested = payload.days_requested
    leave_request.days_with_pay = payload.days_with_pay
    leave_request.days_without_pay = payload.days_without_pay
    leave_request.professional_appointment_subtype = (
        payload.professional_appointment_subtype
    )
    leave_request.reason = payload.reason
    leave_request.contact_phone = payload.contact_phone
    leave_request.leave_address = payload.leave_address
    leave_request.travel_from_date = payload.travel_from_date
    leave_request.travel_to_date = payload.travel_to_date
    leave_request.salary_in_advance = payload.salary_in_advance
    leave_request.requires_acting_appointment = payload.requires_acting_appointment
    leave_request.acting_officer_id = payload.acting_officer_id
    leave_request.expected_return_date = payload.expected_return_date
    leave_request.updated_at = utc_now()
    session.add(leave_request)
    await session.commit()
    await session.refresh(leave_request)
    return leave_request


async def delete_leave_request(
    *, session: AsyncSession, current_user: User, leave_request_id: uuid.UUID
) -> None:
    """Delete an own DRAFT leave request (and its unstarted workflow instance)."""
    require_permission(
        current_user=current_user, permission_key="leave.request.create.self"
    )
    leave_request = await get_leave_request_or_404(
        session=session, leave_request_id=leave_request_id
    )
    if leave_request.user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_LEAVE_REQUEST_ACTION_NOT_ALLOWED)
    if leave_request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_LEAVE_REQUEST_NOT_DRAFT)

    workflow_instance_id = leave_request.workflow_instance_id
    # Delete the request first (it holds the FK to the instance), then the
    # DRAFT instance itself (a draft has no step rows to clean up).
    await session.delete(leave_request)
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance:
            await session.delete(instance)
    await session.commit()


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
        # Lock the latest balance row so concurrent approvals of the same
        # user+leave-type serialize and cannot both derive from a stale balance.
        # (An empty ledger has no row to lock; the first-ever pair of concurrent
        # approvals is a known residual gap addressed by a balance table later.)
        result = await session.execute(
            select(LeaveBalanceEvent)
            .where(
                col(LeaveBalanceEvent.user_id) == leave_request.user_id,
                col(LeaveBalanceEvent.leave_type) == leave_type_value,
            )
            .order_by(col(LeaveBalanceEvent.created_at).desc())
            .with_for_update()
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
    *, session: AsyncSession, current_user: User, skip: int = 0, limit: int = 100
) -> tuple[list[LeaveRequest], int]:
    base = select(LeaveRequest).where(col(LeaveRequest.user_id) == current_user.id)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(col(LeaveRequest.created_at).desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0
