"""Profile photo routes (#1303): your own under ``/me``, others' under ``/org``."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import RedirectResponse

from src.auth.models import UserImage
from src.dependencies import CurrentUser, OwnAccountUser, SessionDep
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED, NOT_FOUND, ResponseMap

from . import images, service
from .exceptions import (
    ProfileImageNotFoundError,
    ProfileImageTooLargeError,
    ProfileImageTypeError,
)
from .schemas import ProfileImagePublic, ProfileImageSize

router = APIRouter(prefix="/profile-images", tags=["profile-images"])

INVALID: ResponseMap = {
    413: {"model": ApiError, "description": "Larger than 5 MB"},
    415: {
        "model": ApiError,
        "description": "Not sent as image/jpeg, image/png or image/webp",
    },
    422: {"model": ApiError, "description": "Not a usable JPEG, PNG or WebP photo"},
}
CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")
IMAGE_BODY = {
    "requestBody": {
        "required": True,
        "content": {
            content_type: {"schema": {"type": "string", "format": "binary"}}
            for content_type in CONTENT_TYPES
        },
    }
}
REDIRECT: ResponseMap = {307: {"description": "Redirect to the image"}}
UNAVAILABLE: ResponseMap = {
    503: {"model": ApiError, "description": "Photo storage is not configured"}
}


async def _read_image_body(request: Request) -> bytes:
    """The raw request body, refused as soon as it passes the size limit.

    Reading the stream here (instead of a multipart form, which is parsed whole
    before the handler runs) means an oversized upload is never buffered.
    """
    content_type = request.headers.get("content-type", "").split(";")[0].strip()
    if content_type not in CONTENT_TYPES:
        raise ProfileImageTypeError()
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > images.MAX_BYTES:
        raise ProfileImageTooLargeError()
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > images.MAX_BYTES:
            raise ProfileImageTooLargeError()
    return bytes(body)


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
    *, session: SessionDep, current_user: OwnAccountUser
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
        "Send the image itself as the request body with Content-Type image/jpeg, "
        "image/png or image/webp, up to 5 MB and 16 megapixels. The photo is "
        "turned upright, cropped square, stored as 64, 256 and 512 pixel WebP "
        "images, and its metadata (including GPS location) is removed. It is "
        "visible at once to people who share an organisation with you."
    ),
    operation_id="profileImagesSetMine",
    responses={**AUTHENTICATED, **INVALID, **UNAVAILABLE},
    openapi_extra=IMAGE_BODY,
)
async def set_my_profile_image(
    *, request: Request, session: SessionDep, current_user: OwnAccountUser
) -> Any:
    raw = await _read_image_body(request)
    row = await service.set_image(session=session, user=current_user, raw=raw)
    return _public(row)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove your profile photo",
    description="Deletes the photo and its stored images; 404 when you have none.",
    operation_id="profileImagesRemoveMine",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def remove_my_profile_image(
    *, session: SessionDep, current_user: OwnAccountUser
) -> None:
    await service.remove_image(session=session, user_id=current_user.id)


@router.get(
    "/me/image",
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    summary="Show your profile photo",
    description=(
        "Redirects to a short-lived link to your own image (for the account app, "
        "whose sessions cannot read other people's photos). 404 when you have none."
    ),
    operation_id="profileImagesShowMine",
    responses={**REDIRECT, **AUTHENTICATED, **NOT_FOUND, **UNAVAILABLE},
)
async def show_my_profile_image(
    *,
    session: SessionDep,
    current_user: OwnAccountUser,
    size: Annotated[ProfileImageSize, Query()] = ProfileImageSize.MEDIUM,
) -> RedirectResponse:
    link, _ = await service.read_link(
        session=session, viewer=current_user, owner_id=current_user.id, size=int(size)
    )
    return RedirectResponse(
        link,
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        headers={
            "Cache-Control": "private, max-age=240",
            "Vary": "Authorization, Cookie",
        },
    )


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
        headers={
            "Cache-Control": "private, max-age=240",
            "Vary": "Authorization, Cookie",
        },
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
