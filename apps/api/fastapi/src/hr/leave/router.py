from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import LeaveRequestDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    LeaveRequestAction,
    LeaveRequestCreate,
    LeaveRequestListPublic,
    LeaveRequestPublic,
    LeaveRequestSubmit,
)

router = APIRouter(prefix="/hr", tags=["hr-leave"])


@router.post(
    "/leave-requests",
    response_model=LeaveRequestPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create leave request",
    description="Create a leave request for the current user. Requires leave.request.create.self permission.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_leave_request(
    *, session: SessionDep, current_user: CurrentUser, payload: LeaveRequestCreate
) -> Any:
    return await service.create_leave_request(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/leave-requests/{leave_request_id}/submit",
    response_model=LeaveRequestPublic,
    summary="Submit a draft leave request",
    description="Submit a previously-saved DRAFT leave request, attaching named co-approvers. Requires leave.request.create.self permission and ownership of the request.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request submitted"},
        status.HTTP_400_BAD_REQUEST: {"description": "Leave request is not a draft"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to submit this leave request"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Leave request not found"},
    },
)
async def submit_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
    payload: LeaveRequestSubmit,
) -> Any:
    return await service.submit_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
        payload=payload,
    )


@router.patch(
    "/leave-requests/{leave_request_id}",
    response_model=LeaveRequestPublic,
    summary="Edit a draft leave request",
    description="Update a still-DRAFT leave request in place. Requires leave.request.create.self permission and ownership.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request updated"},
        status.HTTP_400_BAD_REQUEST: {"description": "Leave request is not a draft"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to edit this request"},
        status.HTTP_404_NOT_FOUND: {"description": "Leave request not found"},
    },
)
async def update_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
    payload: LeaveRequestCreate,
) -> Any:
    return await service.update_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
        payload=payload,
    )


@router.delete(
    "/leave-requests/{leave_request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft leave request",
    description="Delete an own DRAFT leave request. Requires leave.request.create.self permission and ownership.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Leave request deleted"},
        status.HTTP_400_BAD_REQUEST: {"description": "Leave request is not a draft"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to delete this request"},
        status.HTTP_404_NOT_FOUND: {"description": "Leave request not found"},
    },
)
async def delete_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
) -> None:
    await service.delete_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
    )


@router.patch(
    "/leave-requests/{leave_request_id}/action",
    response_model=LeaveRequestPublic,
    summary="Action leave request",
    description="Approve or update a leave request. Requires leave.request.action and scope over the user.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request updated"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to action this leave request"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Leave request not found"},
    },
)
async def action_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
    payload: LeaveRequestAction,
) -> Any:
    return await service.action_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
        payload=payload,
    )


@router.get(
    "/leave-requests/me",
    response_model=LeaveRequestListPublic,
    summary="List my leave requests",
    description="Return leave requests for the current user.",
    responses={status.HTTP_200_OK: {"description": "Leave requests returned"}},
)
async def read_my_leave_requests(
    session: SessionDep, current_user: CurrentUser, pagination: PaginationDep
) -> Any:
    rows, total = await service.list_leave_requests(
        session=session,
        current_user=current_user,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return LeaveRequestListPublic(
        data=[
            LeaveRequestPublic.model_validate(item, from_attributes=True)
            for item in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )
