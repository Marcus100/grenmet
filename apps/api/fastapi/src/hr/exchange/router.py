from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import ShiftSwapDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    ShiftSwapAction,
    ShiftSwapRequestCreate,
    ShiftSwapRequestPublic,
    ShiftSwapRequestsPublic,
    ShiftSwapSubmit,
)

router = APIRouter(prefix="/hr", tags=["hr-exchange"])


@router.get(
    "/shift-swaps/me",
    response_model=ShiftSwapRequestsPublic,
    summary="List my shift swap requests",
    description="Return shift swap requests created by the current user, newest first.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap requests returned"},
    },
)
async def list_my_shift_swaps(
    session: SessionDep, current_user: CurrentUser, pagination: PaginationDep
) -> Any:
    swaps, total = await service.list_my_shift_swap_requests(
        session=session,
        current_user=current_user,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return ShiftSwapRequestsPublic(
        data=[
            ShiftSwapRequestPublic.model_validate(swap, from_attributes=True)
            for swap in swaps
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


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
async def create_shift_swap(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftSwapRequestCreate
) -> Any:
    return await service.create_shift_swap_request(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/shift-swaps/{shift_swap_id}/submit",
    response_model=ShiftSwapRequestPublic,
    summary="Submit a draft shift swap request",
    description="Submit a previously-saved DRAFT shift swap request, attaching named co-approvers. Requires shift_swap.request.create.self permission and ownership of the request.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap request submitted"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Shift swap request is not a draft"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to submit this shift swap request"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Shift swap request not found"},
    },
)
async def submit_shift_swap(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap: ShiftSwapDep,
    payload: ShiftSwapSubmit,
) -> Any:
    return await service.submit_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )


@router.patch(
    "/shift-swaps/{shift_swap_id}",
    response_model=ShiftSwapRequestPublic,
    summary="Edit a draft shift swap request",
    description="Update a still-DRAFT shift swap request in place. Requires shift_swap.request.create.self permission and ownership.",
    responses={
        status.HTTP_200_OK: {"description": "Shift swap request updated"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Shift swap request is not a draft"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to edit this shift swap request"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Shift swap request not found"},
    },
)
async def update_shift_swap(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap: ShiftSwapDep,
    payload: ShiftSwapRequestCreate,
) -> Any:
    return await service.update_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )


@router.delete(
    "/shift-swaps/{shift_swap_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft shift swap request",
    description="Delete an own DRAFT shift swap request. Requires shift_swap.request.create.self permission and ownership.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Shift swap request deleted"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Shift swap request is not a draft"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to delete this shift swap request"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Shift swap request not found"},
    },
)
async def delete_shift_swap(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap: ShiftSwapDep,
) -> None:
    await service.delete_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
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
async def action_shift_swap(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap: ShiftSwapDep,
    payload: ShiftSwapAction,
) -> Any:
    return await service.action_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )
