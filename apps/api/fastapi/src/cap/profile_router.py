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
from src.openapi_responses import AUTHENTICATED, NOT_FOUND

router = APIRouter(prefix="/hazard-profiles", tags=["cap"])


@router.get(
    "",
    response_model=list[CapProfilePublic],
    summary="List CAP hazard profiles",
    description="Returns the latest accessible version of each CAP hazard profile for the current user.",
    responses={**AUTHENTICATED},
)
async def read_hazard_profiles(
    session: SessionDep, current_user: CurrentUser
) -> list[CapProfilePublic]:
    return await profiles.list_versions(session, current_user)


@router.post(
    "/{key}/versions",
    response_model=CapProfilePublic,
    status_code=201,
    summary="Save a CAP hazard profile version",
    description="Creates a new version of a named CAP hazard profile for later alert drafting and review.",
    responses={**AUTHENTICATED},
)
async def save_hazard_profile(
    session: SessionDep,
    current_user: CurrentUser,
    key: Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{0,99}$")],
    payload: CapProfileSave,
) -> CapProfilePublic:
    return await profiles.save_version(session, current_user, key, payload)


@router.post(
    "/{profile_id}/approve",
    response_model=CapProfilePublic,
    summary="Approve a CAP hazard profile",
    description="Approves a reviewed CAP hazard profile version so it can be used to create alerts.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def approve_hazard_profile(
    session: SessionDep, current_user: CurrentUser, profile_id: uuid.UUID
) -> CapProfilePublic:
    return await profiles.approve(session, current_user, profile_id)


@router.post(
    "/{profile_id}/draft",
    response_model=CapAlertPublic,
    status_code=201,
    summary="Draft an alert from a CAP hazard profile",
    description="Creates a new CAP alert draft using the selected hazard profile and supplied event details.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def draft_from_hazard_profile(
    session: SessionDep,
    current_user: CurrentUser,
    profile_id: uuid.UUID,
    payload: CapProfileDraftRequest,
) -> CapAlertPublic:
    return await profiles.create_draft(session, current_user, profile_id, payload)
