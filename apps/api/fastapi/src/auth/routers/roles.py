"""Role management endpoints.

All endpoints require superuser privileges.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth import service
from src.auth.constants import ERROR_ROLE_IN_USE, ERROR_ROLE_NOT_FOUND
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import RoleCreate, RolePublic, RoleUpdate
from src.dependencies import SessionDep
from src.pagination import PaginatedResponse, PaginationParams, get_pagination_params

router = APIRouter(
    prefix="/auth/roles",
    tags=["roles"],
    dependencies=[Depends(get_current_active_superuser)],
)


@router.get(
    "",
    response_model=PaginatedResponse[RolePublic],
    summary="List roles",
    description="Return roles (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Roles returned"}},
)
async def read_roles(
    session: SessionDep,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
) -> Any:
    roles, count = await service.get_roles_with_count(
        session=session, skip=pagination.skip, limit=pagination.limit
    )
    return PaginatedResponse(
        data=[RolePublic.model_validate(role, from_attributes=True) for role in roles],
        count=count,
        page=pagination.page,
        size=pagination.size,
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
    role = await service.get_role(session=session, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail=ERROR_ROLE_NOT_FOUND)
    return role


@router.post(
    "",
    response_model=RolePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create role",
    description="Create a role (superuser only).",
    responses={status.HTTP_201_CREATED: {"description": "Role created"}},
)
async def create_role(*, session: SessionDep, role_in: RoleCreate) -> Any:
    return await service.create_role(session=session, role_in=role_in)


@router.patch(
    "/{role_id}",
    response_model=RolePublic,
    summary="Update role",
    description="Update a role's name or description (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "Role updated"},
        status.HTTP_404_NOT_FOUND: {"description": "Role not found"},
    },
)
async def update_role(
    *, session: SessionDep, role_id: uuid.UUID, role_in: RoleUpdate
) -> Any:
    role = await service.get_role(session=session, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail=ERROR_ROLE_NOT_FOUND)
    return await service.update_role(session=session, db_role=role, role_in=role_in)


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete role",
    description="Delete a role (superuser only). Fails while any user still holds the role.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Role deleted"},
        status.HTTP_400_BAD_REQUEST: {"description": "Role is still assigned"},
        status.HTTP_404_NOT_FOUND: {"description": "Role not found"},
    },
)
async def delete_role(*, session: SessionDep, role_id: uuid.UUID) -> None:
    role = await service.get_role(session=session, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail=ERROR_ROLE_NOT_FOUND)
    assignment_count = await service.count_role_assignments_for_role(
        session=session, role_id=role_id
    )
    if assignment_count > 0:
        raise HTTPException(status_code=400, detail=ERROR_ROLE_IN_USE)
    await service.delete_role(session=session, db_role=role)
