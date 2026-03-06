"""User role assignment management endpoints."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth import service
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import (
    UserRoleAssignmentCreate,
    UserRoleAssignmentPublic,
    UserRoleAssignmentsPublic,
    UserRoleAssignmentUpdate,
)
from src.dependencies import SessionDep

router = APIRouter(
    prefix="/auth/role-assignments",
    tags=["role-assignments"],
    dependencies=[Depends(get_current_active_superuser)],
)


@router.get(
    "/",
    response_model=UserRoleAssignmentsPublic,
    summary="List role assignments",
    description="Return role assignments, optionally filtered by user_id (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Role assignments returned"}},
)
async def read_role_assignments(session: SessionDep, user_id: uuid.UUID | None = None) -> Any:
    assignments = await service.get_user_role_assignments(
        session=session, user_id=user_id
    )
    return UserRoleAssignmentsPublic(
        data=[
            UserRoleAssignmentPublic.model_validate(assignment, from_attributes=True)
            for assignment in assignments
        ],
        count=len(assignments),
    )


@router.get(
    "/{assignment_id}",
    response_model=UserRoleAssignmentPublic,
    summary="Get role assignment by ID",
    description="Return a role assignment by ID (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "Role assignment returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Role assignment not found"},
    },
)
async def read_role_assignment(session: SessionDep, assignment_id: uuid.UUID) -> Any:
    assignment = await service.get_user_role_assignment(
        session=session, assignment_id=assignment_id
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Role assignment not found")
    return assignment


@router.post(
    "/",
    response_model=UserRoleAssignmentPublic,
    summary="Create role assignment",
    description="Create a user-role assignment (superuser only).",
    responses={status.HTTP_200_OK: {"description": "Role assignment created"}},
)
async def create_role_assignment(
    *, session: SessionDep, assignment_in: UserRoleAssignmentCreate
) -> Any:
    return await service.create_user_role_assignment(
        session=session, assignment_in=assignment_in
    )


@router.patch(
    "/{assignment_id}",
    response_model=UserRoleAssignmentPublic,
    summary="Update role assignment",
    description="Update a user-role assignment (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "Role assignment updated"},
        status.HTTP_404_NOT_FOUND: {"description": "Role assignment not found"},
    },
)
async def update_role_assignment(
    *,
    session: SessionDep,
    assignment_id: uuid.UUID,
    assignment_in: UserRoleAssignmentUpdate,
) -> Any:
    db_assignment = await service.get_user_role_assignment(
        session=session, assignment_id=assignment_id
    )
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Role assignment not found")
    return await service.update_user_role_assignment(
        session=session,
        db_assignment=db_assignment,
        assignment_in=assignment_in,
    )
