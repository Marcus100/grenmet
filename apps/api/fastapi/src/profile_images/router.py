"""Profile photo routes (#1303): your own under ``/me``, others' under ``/org``."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Query, UploadFile, status
from fastapi.responses import RedirectResponse

from src.auth.models import UserImage
from src.dependencies import CurrentUser, SessionDep
from src.openapi_responses import AUTHENTICATED, NOT_FOUND, ResponseMap

from . import images, service
from .exceptions import ProfileImageNotFoundError
from .schemas import ProfileImagePublic, ProfileImageSize

router = APIRouter(prefix="/profile-images", tags=["profile-images"])

INVALID: ResponseMap = {
    422: {"description": "Not a JPEG, PNG or WebP photo, or too large"}
}
REDIRECT: ResponseMap = {307: {"description": "Redirect to the image"}}
UNAVAILABLE: ResponseMap = {503: {"description": "Photo storage is not configured"}}


def _public(row: UserImage) -> ProfileImagePublic:
    return ProfileImagePublic(
        user_id=row.user_id,
        version=row.object_key.rsplit("/", 1)[-1],
        updated_at=row.updated_at,
        sizes=list(images.SIZES),
    )


@router.get(
    "/me",
    response_model=ProfileImagePublic,
    summary="Get your profile photo details",
    description="404 when you have no photo. Read the image itself through "
    "GET /profile-images/org/{user_id} with your own user id.",
    operation_id="profileImagesGetMine",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_my_profile_image(
    *, session: SessionDep, current_user: CurrentUser
) -> Any:
    row = await service.get_image(session=session, user_id=current_user.id)
    if row is None:
        raise ProfileImageNotFoundError()
    return _public(row)


@router.put(
    "/me",
    response_model=ProfileImagePublic,
    summary="Upload or replace your profile photo",
    description=(
        "JPEG, PNG or WebP up to 5 MB. The photo is cropped square, stored as "
        "64, 256 and 512 pixel WebP images, and its metadata (including GPS "
        "location) is removed. It is visible at once to people who share an "
        "organisation with you."
    ),
    operation_id="profileImagesSetMine",
    responses={**AUTHENTICATED, **INVALID, **UNAVAILABLE},
)
async def set_my_profile_image(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File(description="JPEG, PNG or WebP, up to 5 MB")],
) -> Any:
    raw = await file.read(images.MAX_BYTES + 1)
    row = await service.set_image(session=session, user=current_user, raw=raw)
    return _public(row)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove your profile photo",
    operation_id="profileImagesRemoveMine",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def remove_my_profile_image(
    *, session: SessionDep, current_user: CurrentUser
) -> None:
    await service.remove_image(session=session, user_id=current_user.id)


@router.get(
    "/org/{user_id}",
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    summary="Show a person's profile photo",
    description=(
        "Redirects to a short-lived link to the image. Visible to the person, "
        "superusers and people who share an organisation with them (active "
        "membership of the same organisation, or active employment in the same "
        "HR organisation). Otherwise, or when there is no photo, 404: show "
        "initials instead."
    ),
    operation_id="profileImagesShow",
    responses={
        **REDIRECT,
        **AUTHENTICATED,
        **NOT_FOUND,
        **UNAVAILABLE,
    },
)
async def show_profile_image(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    size: Annotated[ProfileImageSize, Query()] = ProfileImageSize.MEDIUM,
) -> RedirectResponse:
    link, _ = await service.read_link(
        session=session, viewer=current_user, owner_id=user_id, size=int(size)
    )
    return RedirectResponse(
        link,
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        headers={"Cache-Control": "private, max-age=240"},
    )


@router.delete(
    "/org/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove someone's profile photo",
    description=(
        "For an unsuitable photo. Requires hr.employment.manage over the person "
        "(or superuser). Recorded in their employee history. Staff cannot upload "
        "a photo for someone else."
    ),
    operation_id="profileImagesRemove",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def remove_profile_image(
    *, session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> None:
    await service.remove_for_staff(
        session=session, current_user=current_user, user_id=user_id
    )
