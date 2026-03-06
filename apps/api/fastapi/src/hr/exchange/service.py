import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.utils.datetime import utc_now
from src.hr.constants import (
    ERROR_SHIFT_SWAP_ACTION_NOT_ALLOWED,
)
from src.hr.dependencies import get_shift_swap_request_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
)
from src.hr.workflow.models import WorkflowType
from src.hr.workflow.service import start_workflow_for_entity

from .models import ShiftSwapRequest
from .schemas import ShiftSwapAction, ShiftSwapRequestCreate


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
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    request.workflow_instance_id = await start_workflow_for_entity(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        workflow_type=WorkflowType.SHIFT_SWAP,
        entity_type="shift_swap",
        entity_id=request.id,
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


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
    return request
