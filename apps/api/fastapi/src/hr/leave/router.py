from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import LeaveRequestDep
from src.hr.filenames import preview_filename
from src.hr.roster.schemas import with_rule_warnings
from src.hr.submission import submission_list, submission_public
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED
from src.pagination import PaginationDep
from src.utils.pdf_response import PDF_HEADERS_DOC, pdf_response

from . import service
from .models import LeaveType
from .schemas import (
    LeaveRequestAction,
    LeaveRequestCreate,
    LeaveRequestListPublic,
    LeaveRequestPublic,
    LeaveRequestSubmit,
    WorkingDaysPublic,
)

router = APIRouter(prefix="/hr", tags=["hr-leave"])


@router.post(
    "/leave-requests/preview-pdf",
    operation_id="hrPreviewLeaveRequestPdf",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Preview a leave request PDF",
    description="Render an unsaved leave application using the same Python renderer as the signed PDF. No request or signature is stored.",
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "Draft PDF preview",
            "headers": PDF_HEADERS_DOC,
        },
        400: {
            "model": ApiError,
            "description": "Invalid date order, day count or travel dates",
        },
        403: {"model": ApiError, "description": "Permission or department mismatch"},
        422: {"description": "Invalid leave request fields"},
    },
)
async def preview_leave_request_pdf(
    *, session: SessionDep, current_user: CurrentUser, payload: LeaveRequestCreate
) -> Response:
    pdf = await service.preview_leave_request_pdf(
        session=session, current_user=current_user, payload=payload
    )
    return pdf_response(pdf, preview_filename("leave_request"))


@router.post(
    "/leave-requests",
    response_model=LeaveRequestPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create leave request",
    description="Create a leave request for the current user. Requires leave.request.create.self permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Leave request created"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid leave request fields",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def create_leave_request(
    *, session: SessionDep, current_user: CurrentUser, payload: LeaveRequestCreate
) -> Any:
    result = await service.create_leave_request(
        session=session, current_user=current_user, payload=payload
    )
    return await submission_public(session, result, LeaveRequestPublic)


@router.post(
    "/leave-requests/{leave_request_id}/submit",
    response_model=LeaveRequestPublic,
    summary="Submit a draft leave request",
    description="Submit a previously-saved DRAFT leave request, attaching named co-approvers. Requires leave.request.create.self permission and ownership of the request.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request submitted"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Leave request is not a draft or required fields are invalid",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Not allowed to submit this leave request",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Leave request not found",
        },
    },
)
async def submit_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
    payload: LeaveRequestSubmit,
) -> Any:
    result = await service.submit_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
        payload=payload,
    )
    return await submission_public(session, result, LeaveRequestPublic)


@router.patch(
    "/leave-requests/{leave_request_id}",
    response_model=LeaveRequestPublic,
    summary="Edit a draft leave request",
    description="Update a still-DRAFT leave request in place. Requires leave.request.create.self permission and ownership.",
    responses={
        status.HTTP_200_OK: {"description": "Leave request updated"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Leave request is not a draft",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Not allowed to edit this request",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Leave request not found",
        },
    },
)
async def update_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
    payload: LeaveRequestCreate,
) -> Any:
    result = await service.update_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
        payload=payload,
    )
    return await submission_public(session, result, LeaveRequestPublic)


@router.delete(
    "/leave-requests/{leave_request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft leave request",
    description="Delete an own DRAFT leave request. Requires leave.request.create.self permission and ownership.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Leave request deleted"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Leave request is not a draft",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Not allowed to delete this request",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Leave request not found",
        },
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
    responses=with_rule_warnings(
        {
            status.HTTP_200_OK: {"description": "Leave request updated"},
            status.HTTP_403_FORBIDDEN: {
                "model": ApiError,
                "description": "Not allowed to action this leave request",
            },
            status.HTTP_404_NOT_FOUND: {
                "model": ApiError,
                "description": "Leave request not found",
            },
        }
    ),
)
async def action_leave_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    leave_request: LeaveRequestDep,
    payload: LeaveRequestAction,
) -> Any:
    result = await service.action_leave_request(
        session=session,
        current_user=current_user,
        leave_request_id=leave_request.id,
        payload=payload,
    )
    return await submission_public(session, result, LeaveRequestPublic)


@router.get(
    "/leave-requests/me",
    response_model=LeaveRequestListPublic,
    summary="List my leave requests",
    description="Return leave requests for the current user.",
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Leave requests returned"},
    },
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
        data=await submission_list(session, rows, LeaveRequestPublic),
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/leave/working-days",
    response_model=WorkingDaysPublic,
    summary="Working days between two dates",
    description="Suggest the days requested for a leave range: the caller's published roster work shifts when it covers the whole range, otherwise Monday to Friday, excluding public holidays. Holidays from the provisional list are flagged. For an annual vacation (leave_type=VACATION) it also returns a provisional suggested_extra_days count for holidays that fall on would-be working days; it is advice for HR and never posts to a balance. Requires leave.request.create.self.",
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Working day count returned"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid or too long range",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def read_working_days(
    session: SessionDep,
    current_user: CurrentUser,
    start: Annotated[date, Query(description="First day of leave")],
    end: Annotated[date, Query(description="Last day of leave")],
    leave_type: Annotated[
        LeaveType | None,
        Query(description="Leave type; VACATION adds the provisional extra-day hint"),
    ] = None,
) -> Any:
    return await service.working_days_between(
        session=session,
        current_user=current_user,
        start=start,
        end=end,
        leave_type=leave_type,
    )
