import uuid
from typing import Annotated

from fastapi import APIRouter, Path

from src.cap import profiles
from src.cap.profile_schemas import (
    CapProfileDraftRequest,
    CapProfilePublic,
    CapProfileSave,
)
from src.cap.schemas import CapAlertPublic
from src.dependencies import CurrentUser, SessionDep

router = APIRouter(prefix="/hazard-profiles", tags=["cap"])


@router.get("", response_model=list[CapProfilePublic])
async def read_hazard_profiles(
    session: SessionDep, current_user: CurrentUser
) -> list[CapProfilePublic]:
    return await profiles.list_versions(session, current_user)


@router.post("/{key}/versions", response_model=CapProfilePublic, status_code=201)
async def save_hazard_profile(
    session: SessionDep,
    current_user: CurrentUser,
    key: Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{0,99}$")],
    payload: CapProfileSave,
) -> CapProfilePublic:
    return await profiles.save_version(session, current_user, key, payload)


@router.post("/{profile_id}/approve", response_model=CapProfilePublic)
async def approve_hazard_profile(
    session: SessionDep, current_user: CurrentUser, profile_id: uuid.UUID
) -> CapProfilePublic:
    return await profiles.approve(session, current_user, profile_id)


@router.post("/{profile_id}/draft", response_model=CapAlertPublic, status_code=201)
async def draft_from_hazard_profile(
    session: SessionDep,
    current_user: CurrentUser,
    profile_id: uuid.UUID,
    payload: CapProfileDraftRequest,
) -> CapAlertPublic:
    return await profiles.create_draft(session, current_user, profile_id, payload)
