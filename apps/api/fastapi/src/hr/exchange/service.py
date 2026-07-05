import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED,
    ERROR_SHIFT_SWAP_NOT_DRAFT,
)
from src.hr.dependencies import get_shift_swap_request_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import RequestStatus
from src.hr.workflow.models import WorkflowInstance, WorkflowType
from src.hr.workflow.service import start_workflow_for_entity, submit_draft_workflow
from src.utils.datetime import utc_now

from .models import ShiftSwapRequest
from .schemas import ShiftSwapAction, ShiftSwapRequestCreate, ShiftSwapSubmit

logger = logging.getLogger(__name__)


async def list_my_shift_swap_requests(
    *, session: AsyncSession, current_user: User, skip: int = 0, limit: int = 100
) -> tuple[list[ShiftSwapRequest], int]:
    """Shift swaps the current user filed or is the counterpart of."""
    base = select(ShiftSwapRequest).where(
        (col(ShiftSwapRequest.requesting_user_id) == current_user.id)
        | (col(ShiftSwapRequest.counterpart_user_id) == current_user.id)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(col(ShiftSwapRequest.created_at).desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def create_shift_swap_request(
    *, session: AsyncSession, current_user: User, payload: ShiftSwapRequestCreate
) -> ShiftSwapRequest:
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = ShiftSwapRequest(
        requesting_user_id=current_user.id,
        counterpart_user_id=payload.counterpart_user_id,
        department_id=payload.department_id,
        swap_type=payload.swap_type,
        source_date=payload.source_date,
        source_shift_code=payload.source_shift_code,
        target_date=payload.target_date,
        target_shift_code=payload.target_shift_code,
        effective_date=payload.effective_date,
        restoration_date=payload.restoration_date,
        reason=payload.reason,
        status=RequestStatus.DRAFT if payload.as_draft else RequestStatus.SUBMITTED,
    )
    # Flush to obtain the id, then start the workflow and commit once so the
    # request and its workflow instance are persisted atomically.
    session.add(request)
    await session.flush()
    request.workflow_instance_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.SHIFT_SWAP,
        entity_type="shift_swap",
        entity_id=request.id,
        co_approver_user_ids=payload.co_approver_user_ids,
        submit=not payload.as_draft,
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


async def submit_shift_swap_request(
    *,
    session: AsyncSession,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapSubmit,
) -> ShiftSwapRequest:
    """Submit a previously-saved DRAFT shift swap request into the approval chain."""
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )
    if request.requesting_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_SHIFT_SWAP_NOT_DRAFT)

    if request.workflow_instance_id:
        await submit_draft_workflow(
            session=session,
            current_user=current_user,
            workflow_instance_id=request.workflow_instance_id,
            co_approver_user_ids=payload.co_approver_user_ids,
            commit=False,
        )
    else:
        # Drafted before a template existed for the department — start fresh.
        workflow_id = await start_workflow_for_entity(
            session=session,
            current_user=current_user,
            department_id=request.department_id,
            workflow_type=WorkflowType.SHIFT_SWAP,
            entity_type="shift_swap",
            entity_id=request.id,
            co_approver_user_ids=payload.co_approver_user_ids,
            submit=True,
        )
        if workflow_id:
            request.workflow_instance_id = workflow_id

    request.status = RequestStatus.SUBMITTED
    request.updated_at = utc_now()
    session.add(request)
    await session.commit()
    await session.refresh(request)
    logger.info(
        "Shift swap submitted from draft",
        extra={
            "shift_swap_id": str(request.id),
            "user_id": str(current_user.id),
        },
    )
    return request


async def update_shift_swap_request(
    *,
    session: AsyncSession,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapRequestCreate,
) -> ShiftSwapRequest:
    """Edit a still-DRAFT shift swap request in place (no new record is created)."""
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )
    if request.requesting_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_SHIFT_SWAP_NOT_DRAFT)

    request.counterpart_user_id = payload.counterpart_user_id
    request.department_id = payload.department_id
    request.swap_type = payload.swap_type
    request.source_date = payload.source_date
    request.source_shift_code = payload.source_shift_code
    request.target_date = payload.target_date
    request.target_shift_code = payload.target_shift_code
    request.effective_date = payload.effective_date
    request.restoration_date = payload.restoration_date
    request.reason = payload.reason
    request.updated_at = utc_now()
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


async def delete_shift_swap_request(
    *, session: AsyncSession, current_user: User, shift_swap_id: uuid.UUID
) -> None:
    """Delete an own DRAFT shift swap request (and its unstarted workflow)."""
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.create.self"
    )
    request = await get_shift_swap_request_or_404(
        session=session, shift_swap_id=shift_swap_id
    )
    if request.requesting_user_id != current_user.id:
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    if request.status != RequestStatus.DRAFT:
        raise HRValidationError(ERROR_SHIFT_SWAP_NOT_DRAFT)

    workflow_instance_id = request.workflow_instance_id
    # Delete the request first (it holds the FK to the instance), then the
    # DRAFT instance itself (a draft has no step rows to clean up).
    await session.delete(request)
    if workflow_instance_id:
        instance = await session.get(WorkflowInstance, workflow_instance_id)
        if instance:
            await session.delete(instance)
    await session.commit()


async def action_shift_swap_request(
    *,
    session: AsyncSession,
    current_user: User,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapAction,
) -> ShiftSwapRequest:
    require_permission(
        current_user=current_user, permission_key="shift_swap.request.action"
    )
    request = await get_shift_swap_request_or_404(
        session=session,
        shift_swap_id=shift_swap_id,
    )
    if not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=request.requesting_user_id,
        permission_key="shift_swap.request.action",
    ):
        raise HRPermissionDeniedError(ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED)
    request.status = payload.status
    request.updated_at = utc_now()
    session.add(request)
    await session.commit()
    await session.refresh(request)
    logger.info(
        "Shift swap actioned",
        extra={
            "shift_swap_id": str(request.id),
            "status": payload.status.value,
            "actor_id": str(current_user.id),
        },
    )
    return request
