import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

from ..schemas import EmploymentAdminUpdate, UserProfilePublic, UserProfileUpdateMe
from ..service import (
    read_profile_for_user,
    update_employment_for_user,
    update_profile_for_current_user,
)

router = APIRouter(prefix="/hr", tags=["hr"])


@router.get(
    "/profile/me",
    response_model=UserProfilePublic,
    summary="Get my HR profile",
    description="Return the current user's HR profile (identity, employment, address, preferences).",
    responses={
        status.HTTP_200_OK: {"description": "HR profile returned"},
        status.HTTP_404_NOT_FOUND: {"description": "HR profile not found for this user"},
    },
)
async def read_hr_profile_me(session: SessionDep, current_user: CurrentUser) -> Any:
    return await read_profile_for_user(
        session=session, current_user=current_user
    )


@router.patch(
    "/profile/me",
    response_model=UserProfilePublic,
    summary="Update my HR profile",
    description="Update the current user's HR profile (identity, address, preferences).",
    responses={
        status.HTTP_200_OK: {"description": "Profile updated"},
        status.HTTP_404_NOT_FOUND: {"description": "HR profile not found for this user"},
    },
)
async def update_hr_profile_me(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: UserProfileUpdateMe,
) -> Any:
    update_payload = payload.model_dump(exclude_unset=True)
    return await update_profile_for_current_user(
        session=session,
        current_user=current_user,
        payload=update_payload,
    )


@router.patch(
    "/employment/{user_id}",
    response_model=UserProfilePublic,
    summary="Update employment (admin)",
    description="Update a user's employment record and approval authority. Supervisor or admin only.",
    responses={
        status.HTTP_200_OK: {"description": "Employment updated"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "User or employment record not found"},
    },
)
async def update_hr_employment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    payload: EmploymentAdminUpdate,
) -> Any:
    return await update_employment_for_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
        employment_update=payload.employment,
        approval_update=payload.approval_authority,
    )
