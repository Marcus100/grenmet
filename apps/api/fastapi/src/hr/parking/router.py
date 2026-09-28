import uuid
from typing import Any

from fastapi import APIRouter, Response, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.submission import submission_list, submission_public
from src.pagination import PaginationDep

from . import service
from .schemas import (
    ParkingPermitCreate,
    ParkingPermitIssue,
    ParkingPermitListPublic,
    ParkingPermitPublic,
    ParkingPermitSubmit,
)

router = APIRouter(prefix="/hr", tags=["hr-parking"])


@router.post(
    "/parking-permits/preview-pdf",
    operation_id="hrPreviewParkingPermitPdf",
    response_class=Response,
    status_code=200,
    summary="Preview parking application PDF",
    description="Render the scoped draft application without saving or signing it.",
    responses={
        200: {"content": {"application/pdf": {}}, "description": "Draft PDF"},
        400: {"description": "Invalid application"},
        403: {"description": "Subject outside scope"},
        422: {"description": "Invalid fields"},
    },
)
async def preview_parking_permit(
    *, session: SessionDep, current_user: CurrentUser, payload: ParkingPermitCreate
) -> Response:
    pdf = await service.preview_pdf(
        session=session, current_user=current_user, payload=payload
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch(
    "/parking-permits/{permit_id}",
    operation_id="hrUpdateParkingPermit",
    response_model=ParkingPermitPublic,
    status_code=200,
    summary="Edit a parking application draft",
    description="Reporter-owned draft edits retain the workflow department.",
    responses={
        400: {"description": "Application is not editable"},
        403: {"description": "Subject outside scope"},
        404: {"description": "Application not found"},
    },
)
async def update_parking_permit(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    permit_id: uuid.UUID,
    payload: ParkingPermitCreate,
) -> Any:
    result = await service.update_permit(
        session=session, current_user=current_user, permit_id=permit_id, payload=payload
    )
    return await submission_public(session, result, ParkingPermitPublic)


@router.post(
    "/parking-permits/{permit_id}/submit",
    operation_id="hrSubmitParkingPermit",
    response_model=ParkingPermitPublic,
    status_code=200,
    summary="Submit a parking application draft",
    description="Submit a reporter-owned draft to the configured approval workflow, with optional fresh saved-signature consent.",
    responses={
        400: {"description": "Invalid draft or workflow"},
        403: {"description": "Subject outside scope"},
        404: {"description": "Application not found"},
    },
)
async def submit_parking_permit(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    permit_id: uuid.UUID,
    payload: ParkingPermitSubmit,
) -> Any:
    result = await service.submit_permit(
        session=session, current_user=current_user, permit_id=permit_id, payload=payload
    )
    return await submission_public(session, result, ParkingPermitPublic)


@router.post(
    "/parking-permits",
    response_model=ParkingPermitPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create parking permit application",
    description="Create an airport security parking access application. Requires parking.permit.create permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Parking permit application created"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid subject or workflow"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_parking_permit(
    *, session: SessionDep, current_user: CurrentUser, payload: ParkingPermitCreate
) -> Any:
    result = await service.create_parking_permit(
        session=session, current_user=current_user, payload=payload
    )
    return await submission_public(session, result, ParkingPermitPublic)


@router.get(
    "/parking-permits",
    response_model=ParkingPermitListPublic,
    summary="List parking permits",
    description="List parking permits (own or by department). Department filter requires parking.permit.read.department.",
    responses={
        status.HTTP_200_OK: {"description": "Parking permits returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def read_parking_permits(
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    department_id: str | None = None,
) -> Any:
    rows, total = await service.list_parking_permits(
        session=session,
        current_user=current_user,
        department_id=department_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return ParkingPermitListPublic(
        data=await submission_list(session, rows, ParkingPermitPublic),
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/parking-permits/{permit_id}/issue",
    response_model=ParkingPermitPublic,
    summary="Issue a parking decal",
    description="Record issuance only after approval, within active organisation/department scope. Identical retries preserve the original issuer/date; renewals and replacements are separate applications.",
    responses={
        status.HTTP_200_OK: {"description": "Decal issued"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Unapproved application or already issued decal"
        },
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Parking permit not found"},
    },
)
async def issue_parking_decal(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    permit_id: uuid.UUID,
    payload: ParkingPermitIssue,
) -> Any:
    result = await service.issue_decal(
        session=session,
        current_user=current_user,
        permit_id=permit_id,
        payload=payload,
    )
    return await submission_public(session, result, ParkingPermitPublic)
