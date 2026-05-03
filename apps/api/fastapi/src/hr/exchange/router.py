from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import ShiftSwapDep

from .schemas import (
    ShiftSwapAction,
    ShiftSwapRequestCreate,
    ShiftSwapRequestPublic,
)
from .service import (
    action_shift_swap_request,
    create_shift_swap_request,
)

router = APIRouter(prefix="/hr", tags=["hr-exchange"])


@router.post(
    "/shift-swaps",
    response_model=ShiftSwapRequestPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create shift swap request",
    description="Create a shift swap request. Requires shift_swap.request.create.self permission.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap request created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_shift_swap_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftSwapRequestCreate
) -> Any:
    return await create_shift_swap_request(
        session=session, current_user=current_user, payload=payload
    )


@router.patch(
    "/shift-swaps/{shift_swap_id}/action",
    response_model=ShiftSwapRequestPublic,
    summary="Action shift swap request",
    description="Approve or reject a shift swap request. Requires shift_swap.request.action and scope over the requesting user.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap request updated"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to action this shift swap"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Shift swap request not found"},
    },
)
async def action_shift_swap_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap: ShiftSwapDep,
    payload: ShiftSwapAction,
) -> Any:
    return await action_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )
