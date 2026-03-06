"""
Permission management endpoints.

This router handles permission CRUD operations. All endpoints require superuser privileges.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import func, select

from src.auth import service
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import PermissionCreate, PermissionPublic, PermissionsPublic
from src.dependencies import SessionDep

router = APIRouter(
    prefix="/auth/permissions",
    tags=["permissions"],
    dependencies=[Depends(get_current_active_superuser)],
)


@router.get(
    "/",
    response_model=PermissionsPublic,
    summary="List permissions",
    description="Return permissions (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Permissions returned"}},
)
def read_permissions(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve permissions (superuser only).
    """
    permissions = service.get_permissions(session=session, skip=skip, limit=limit)
    count_statement = select(func.count()).select_from(service.Permission)
    count = session.exec(count_statement).one()
    return PermissionsPublic(
        data=[
            PermissionPublic.model_validate(perm, from_attributes=True)
            for perm in permissions
        ],
        count=count,
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
def read_permission(session: SessionDep, permission_id: uuid.UUID) -> Any:
    """
    Get permission by ID (superuser only).
    """
    permission = service.get_permission(session=session, permission_id=permission_id)
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    return permission


@router.post(
    "/",
    response_model=PermissionPublic,
    summary="Create permission",
    description="Create a permission (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Permission created"}},
)
def create_permission(*, session: SessionDep, permission_in: PermissionCreate) -> Any:
    """
    Create new permission (superuser only).
    """
    permission = service.create_permission(session=session, permission_in=permission_in)
    return permission
