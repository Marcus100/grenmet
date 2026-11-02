from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from src.auth.policy import require_permission
from src.dependencies import CurrentUser, SessionDep
from src.openapi_responses import AUTHENTICATED, UNAUTHENTICATED
from src.pagination import PaginationDep

from . import service
from .dependencies import authenticate_cms
from .schemas import (
    SLUG_MAX_LENGTH,
    SLUG_PATTERN,
    DeliveryAdminList,
    PostAccepted,
    PostIn,
)

router = APIRouter(prefix="/content-distribution", tags=["content-distribution"])

SOCIAL_MANAGE_PERMISSION = "cms.article.social.manage"


@router.post(
    "/internal/posts",
    response_model=PostAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(authenticate_cms)],
    summary="Save a post for social sharing (CMS hook)",
    description=(
        "Called by the CMS when an editor approves a post for social. Authenticated "
        "by the X-CMS-Secret header, not a user session. Idempotent per collection, "
        "slug and platform: a pending post is updated, a sent post is never reposted. "
        "Official warnings are refused (422), and so is a link or image on a host that "
        "is not approved in the server settings. Live posting is off unless its feature "
        "flag and the Meta settings are set."
    ),
    responses={
        **UNAUTHENTICATED,
        status.HTTP_422_UNPROCESSABLE_ENTITY: {
            "description": (
                "Refused: warning post, a link or image on an unapproved host, or a "
                "platform needs a caption or image"
            )
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "CMS_DISTRIBUTION_SECRET is not set"
        },
    },
)
async def save_post(*, session: SessionDep, body: PostIn) -> PostAccepted:
    deliveries = await service.upsert_post(session, body)
    return PostAccepted(deliveries=deliveries)


@router.get(
    "/admin/posts",
    response_model=DeliveryAdminList,
    summary="List social posts and their per-platform status",
    description=(
        "One row per post and platform, newest first. status is pending, scheduled, "
        "posted (live on the platform; external_id is its id), dry_run_sent (not sent "
        "live; reason says why), skipped (not sent; reason says why), failed (the "
        "outbox is retrying; error says why) or dead (given up; error says why). "
        "Needs the social publishing permission."
    ),
    responses={**AUTHENTICATED},
)
async def list_posts(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    slug: Annotated[
        str | None,
        Query(pattern=SLUG_PATTERN, max_length=SLUG_MAX_LENGTH),
    ] = None,
    collection: Annotated[
        str | None,
        Query(pattern=r"^[a-z][a-z0-9-]{1,59}$", max_length=60),
    ] = None,
) -> DeliveryAdminList:
    require_permission(
        current_user=current_user, permission_key=SOCIAL_MANAGE_PERMISSION
    )
    rows, total = await service.list_deliveries(
        session,
        offset=pagination.skip,
        limit=pagination.limit,
        slug=slug,
        collection=collection,
    )
    return DeliveryAdminList(data=rows, count=total)
