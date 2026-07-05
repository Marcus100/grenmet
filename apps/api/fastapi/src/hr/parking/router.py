import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    ParkingPermitCreate,
    ParkingPermitIssue,
    ParkingPermitListPublic,
    ParkingPermitPublic,
)

router = APIRouter(prefix="/hr", tags=["hr-parking"])


@router.post(
    "/parking-permits",
    response_model=ParkingPermitPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create parking permit application",
    description="Create an airport security parking access application. Requires parking.permit.create permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Parking permit application created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_parking_permit(
    *, session: SessionDep, current_user: CurrentUser, payload: ParkingPermitCreate
) -> Any:
    return await service.create_parking_permit(
        session=session, current_user=current_user, payload=payload
    )


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
        data=[
            ParkingPermitPublic.model_validate(item, from_attributes=True)
            for item in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/parking-permits/{permit_id}/issue",
    response_model=ParkingPermitPublic,
    summary="Issue a parking decal",
    description="Record decal issuance for a parking permit. Requires parking.permit.issue permission.",
    responses={
        status.HTTP_200_OK: {"description": "Decal issued"},
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
    return await service.issue_decal(
        session=session,
        current_user=current_user,
        permit_id=permit_id,
        payload=payload,
    )
