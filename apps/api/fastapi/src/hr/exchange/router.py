from typing import Any

from fastapi import APIRouter, Response, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import ShiftSwapDep
from src.hr.filenames import preview_filename
from src.hr.roster.schemas import RosterRulesPublic, RuleViolationPublic
from src.hr.submission import submission_list, submission_public
from src.openapi_responses import AUTHENTICATED
from src.pagination import PaginationDep
from src.utils.filenames import content_disposition

from . import service, swap_rules
from .schemas import (
    ShiftSwapAction,
    ShiftSwapRequestCreate,
    ShiftSwapRequestPublic,
    ShiftSwapRequestsPublic,
    ShiftSwapRuleCheckPublic,
    ShiftSwapSubmit,
)

router = APIRouter(prefix="/hr", tags=["hr-exchange"])


@router.post(
    "/shift-swaps/preview-pdf",
    operation_id="hrPreviewShiftSwapPdf",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Preview a shift exchange PDF",
    description="Render unsaved exchange values with resolved employee names without creating a request or signature.",
    responses={
        200: {"content": {"application/pdf": {}}, "description": "Draft PDF"},
        400: {"description": "Invalid exchange"},
        403: {"description": "Insufficient permission"},
    },
)
async def preview_shift_swap(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftSwapRequestCreate
) -> Response:
    pdf = await service.preview_shift_swap_pdf(
        session=session, current_user=current_user, payload=payload
    )
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": content_disposition(
                "inline", preview_filename("shift_swap")
            ),
        },
    )


@router.get(
    "/shift-swaps/me",
    response_model=ShiftSwapRequestsPublic,
    summary="List my shift swap requests",
    description="Return shift swap requests created by the current user, newest first.",
    responses={
        **AUTHENTICATED,
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
        data=await submission_list(session, swaps, ShiftSwapRequestPublic),
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
        status.HTTP_201_CREATED: {"description": "Shift swap request created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Invalid participants or roster conflict"
        },
    },
)
async def create_shift_swap(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftSwapRequestCreate
) -> Any:
    result = await service.create_shift_swap_request(
        session=session, current_user=current_user, payload=payload
    )
    return await submission_public(session, result, ShiftSwapRequestPublic)


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
    result = await service.submit_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )
    return await submission_public(session, result, ShiftSwapRequestPublic)


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
    result = await service.update_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )
    return await submission_public(session, result, ShiftSwapRequestPublic)


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
        status.HTTP_400_BAD_REQUEST: {
            "description": "Invalid stage action or changed roster"
        },
    },
)
async def action_shift_swap(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    shift_swap: ShiftSwapDep,
    payload: ShiftSwapAction,
) -> Any:
    result = await service.action_shift_swap_request(
        session=session,
        current_user=current_user,
        shift_swap_id=shift_swap.id,
        payload=payload,
    )
    return await submission_public(session, result, ShiftSwapRequestPublic)


@router.get(
    "/shift-swaps/{shift_swap_id}/rule-check",
    response_model=ShiftSwapRuleCheckPublic,
    operation_id="hrCheckShiftSwapRules",
    summary="Check a shift exchange against department roster rules",
    description=(
        "Return warn-only breaches of the department's rest, consecutive-day and "
        "weekly-hour limits that this exchange would introduce for the two "
        "employees. Never blocks approval. Available to the two employees and to "
        "holders of roster.view in the department scope."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Rule check returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Not permitted to view this swap"},
        status.HTTP_404_NOT_FOUND: {"description": "Shift swap not found"},
    },
)
async def check_shift_swap_rules(
    session: SessionDep, current_user: CurrentUser, swap: ShiftSwapDep
) -> Any:
    rules, violations = await swap_rules.check_swap_rules(
        session=session, current_user=current_user, swap=swap
    )
    return ShiftSwapRuleCheckPublic(
        shift_swap_id=swap.id,
        rules=RosterRulesPublic(
            department_id=swap.department_id,
            min_rest_hours=rules.min_rest_hours,
            max_consecutive_days=rules.max_consecutive_days,
            max_weekly_hours=rules.max_weekly_hours,
        ),
        violations=[
            RuleViolationPublic(
                code=v.code.value,
                user_id=v.user_id,
                start_date=v.start_date,
                end_date=v.end_date,
                observed=v.observed,
                limit=v.limit,
                detail=v.detail,
            )
            for v in violations
        ],
        count=len(violations),
    )
