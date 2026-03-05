import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep

from ..schemas import EmploymentAdminUpdate, UserProfilePublic, UserProfileUpdateMe
from ..service import (
    read_profile_for_user,
    update_employment_for_user,
    update_profile_for_current_user,
)

router = APIRouter(prefix="/hr", tags=["hr"])


@router.get("/profile/me", response_model=UserProfilePublic)
def read_hr_profile_me(session: SessionDep, current_user: CurrentUser) -> Any:
    return read_profile_for_user(session=session, current_user=current_user)


@router.patch("/profile/me", response_model=UserProfilePublic)
def update_hr_profile_me(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: UserProfileUpdateMe,
) -> Any:
    update_payload = payload.model_dump(exclude_unset=True)
    return update_profile_for_current_user(
        session=session,
        current_user=current_user,
        payload=update_payload,
    )


@router.patch("/employment/{user_id}", response_model=UserProfilePublic)
def update_hr_employment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    payload: EmploymentAdminUpdate,
) -> Any:
    return update_employment_for_user(
        session=session,
        current_user=current_user,
        target_user_id=user_id,
        employment_update=payload.employment,
        approval_update=payload.approval_authority,
    )
