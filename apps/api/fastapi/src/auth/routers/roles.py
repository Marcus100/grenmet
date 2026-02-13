"""
Role management endpoints.

This router handles role CRUD operations. All endpoints require superuser privileges.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

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
)
def read_roles(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve roles (superuser only).
    """
    roles = service.get_roles(session=session, skip=skip, limit=limit)
    count_statement = select(func.count()).select_from(service.Role)
    count = session.exec(count_statement).one()
    return RolesPublic(
        data=[RolePublic.model_validate(role, from_attributes=True) for role in roles],
        count=count,
    )


@router.get(
    "/{role_id}",
    response_model=RolePublic,
)
def read_role(session: SessionDep, role_id: uuid.UUID) -> Any:
    """
    Get role by ID (superuser only).
    """
    role = service.get_role(session=session, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post(
    "/",
    response_model=RolePublic,
)
def create_role(*, session: SessionDep, role_in: RoleCreate) -> Any:
    """
    Create new role (superuser only).
    """
    role = service.create_role(session=session, role_in=role_in)
    return role
