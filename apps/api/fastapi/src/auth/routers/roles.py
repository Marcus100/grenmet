"""
Role management endpoints.

This router handles role CRUD operations. All endpoints require superuser privileges.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth import service
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import RoleCreate, RolePublic, RolesPublic
from src.dependencies import SessionDep

router = APIRouter(
    prefix="/auth/roles",
    tags=["roles"],
    dependencies=[Depends(get_current_active_superuser)],
)


@router.get(
    "/",
    response_model=RolesPublic,
    summary="List roles",
    description="Return roles (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Roles returned"}},
)
async def read_roles(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve roles (superuser only).
    """
    roles, count = await service.get_roles_with_count(
        session=session, skip=skip, limit=limit
    )
    return RolesPublic(
        data=[RolePublic.model_validate(role, from_attributes=True) for role in roles],
        count=count,
    )


@router.get(
    "/{role_id}",
    response_model=RolePublic,
    summary="Get role by ID",
    description="Return a role by ID (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "Role returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Role not found"},
    },
)
async def read_role(session: SessionDep, role_id: uuid.UUID) -> Any:
    """
    Get role by ID (superuser only).
    """
    role = await service.get_role(session=session, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post(
    "/",
    response_model=RolePublic,
    summary="Create role",
    description="Create a role (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Role created"}},
)
async def create_role(*, session: SessionDep, role_in: RoleCreate) -> Any:
    """
    Create new role (superuser only).
    """
    return await service.create_role(session=session, role_in=role_in)
