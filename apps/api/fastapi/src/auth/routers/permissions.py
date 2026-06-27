"""Permission management endpoints.

All endpoints require superuser privileges.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth import service
from src.auth.constants import ERROR_PERMISSION_NOT_FOUND
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import PermissionCreate, PermissionPublic
from src.dependencies import SessionDep
from src.pagination import PaginatedResponse, PaginationParams, get_pagination_params

router = APIRouter(
    prefix="/auth/permissions",
    tags=["permissions"],
    dependencies=[Depends(get_current_active_superuser)],
)


@router.get(
    "/",
    response_model=PaginatedResponse[PermissionPublic],
    summary="List permissions",
    description="Return permissions (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Permissions returned"}},
)
async def read_permissions(
    session: SessionDep,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
) -> Any:
    permissions, count = await service.get_permissions_with_count(
        session=session, skip=pagination.skip, limit=pagination.limit
    )
    return PaginatedResponse(
        data=[
            PermissionPublic.model_validate(p, from_attributes=True)
            for p in permissions
        ],
        count=count,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/{permission_id}",
    response_model=PermissionPublic,
    summary="Get permission by ID",
    description="Return a permission by ID (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "Permission returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Permission not found"},
    },
)
async def read_permission(session: SessionDep, permission_id: uuid.UUID) -> Any:
    permission = await service.get_permission(
        session=session, permission_id=permission_id
    )
    if not permission:
        raise HTTPException(status_code=404, detail=ERROR_PERMISSION_NOT_FOUND)
    return permission


@router.post(
    "/",
    response_model=PermissionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create permission",
    description="Create a permission (superuser only).",
    responses={status.HTTP_201_CREATED: {"description": "Permission created"}},
)
async def create_permission(
    *, session: SessionDep, permission_in: PermissionCreate
) -> Any:
    return await service.create_permission(session=session, permission_in=permission_in)
