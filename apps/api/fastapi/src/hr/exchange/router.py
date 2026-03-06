import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

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
    summary="Create shift swap request",
    description="Create a shift swap request. Requires shift_swap.request.create.self permission.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap request created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
def create_shift_swap_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftSwapRequestCreate
) -> Any:
    return create_shift_swap_request(session=session, current_user=current_user, payload=payload)


@router.patch(
    "/shift-swaps/{shift_swap_id}/action",
    response_model=ShiftSwapRequestPublic,
    summary="Action shift swap request",
    description="Approve or reject a shift swap request. Requires shift_swap.request.action and scope over the requesting user.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap request updated"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to action this shift swap"},
        status.HTTP_404_NOT_FOUND: {"description": "Shift swap request not found"},
    },
)
def action_shift_swap_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap_id: uuid.UUID,
    payload: ShiftSwapAction,
) -> Any:
    return action_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap_id,
        payload=payload,
    )
