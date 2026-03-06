import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

from .schemas import (
    LeaveRequestAction,
    LeaveRequestCreate,
    LeaveRequestListPublic,
    LeaveRequestPublic,
)
from .service import (
    action_leave_request,
    create_leave_request,
    list_leave_requests,
)

router = APIRouter(prefix="/hr", tags=["hr-leave"])


@router.post(
    "/leave-requests",
    response_model=LeaveRequestPublic,
    summary="Create leave request",
    description="Create a leave request for the current user. Requires leave.request.create.self permission.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
def create_leave_request_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: LeaveRequestCreate
) -> Any:
    return create_leave_request(session=session, current_user=current_user, payload=payload)


@router.patch(
    "/leave-requests/{leave_request_id}/action",
    response_model=LeaveRequestPublic,
    summary="Action leave request",
    description="Approve or update a leave request. Requires leave.request.action and scope over the user.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request updated"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to action this leave request"},
        status.HTTP_404_NOT_FOUND: {"description": "Leave request not found"},
    },
)
def action_leave_request_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request_id: uuid.UUID,
    payload: LeaveRequestAction,
) -> Any:
    return action_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request_id,
        payload=payload,
    )


@router.get(
    "/leave-requests/me",
    response_model=LeaveRequestListPublic,
    summary="List my leave requests",
    description="Return leave requests for the current user.",
    responses={status.HTTP_200_OK: {"description": "Leave requests returned"}},
)
def read_my_leave_requests(session: SessionDep, current_user: CurrentUser) -> Any:
    rows = list_leave_requests(session=session, current_user=current_user)
    return LeaveRequestListPublic(
        data=[LeaveRequestPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )
