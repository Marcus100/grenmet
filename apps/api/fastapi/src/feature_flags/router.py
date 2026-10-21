"""Feature flags (ADR-0020, ADR-0025 zones). Admin management is superuser-only."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request, Response
from fastapi import status as http_status

from src.auth.policy import require_permission
from src.dependencies import AccountUser, AdminUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgMember
from src.pagination import PaginationDep
from src.rate_limit import limiter

from . import service
from .schemas import (
    PUBLIC_KEYS_PATTERN,
    FeatureFlagAdmin,
    FeatureFlagAdminList,
    FeatureFlagCreate,
    FeatureFlagEvaluation,
    FeatureFlagUpdate,
)

router = APIRouter(prefix="/feature-flags", tags=["feature-flags"])

FlagId = Path(min_length=1, max_length=100)


@router.get(
    "/public/evaluate",
    response_model=FeatureFlagEvaluation,
    summary="Evaluate client-visible flags for an anonymous visitor",
    description=(
        "No authentication. Flag key to on/off for the requested keys (comma "
        "separated, at most 20). The visitor is anonymous, so only environment "
        "rules and the everyone audience can be on. Unknown and non-exposed keys "
        "are absent. Cacheable for 30 seconds; callers should cache about 60 "
        "seconds and treat 429 or any error as flag off."
    ),
    responses={429: {"description": "Rate limit exceeded"}},
)
@limiter.limit("600/minute")
async def evaluate_public(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    keys: Annotated[
        str,
        Query(
            pattern=PUBLIC_KEYS_PATTERN,
            max_length=1700,
            description="Comma-separated kebab-case flag keys, at most 20.",
        ),
    ],
) -> Any:
    del request  # slowapi reads it from the signature to key the limit
    flags = await service.evaluate_public(session, keys.split(","))
    response.headers["Cache-Control"] = "public, max-age=30"
    return FeatureFlagEvaluation(flags=flags)


@router.get(
    "/org/evaluate",
    response_model=FeatureFlagEvaluation,
    summary="Evaluate client-visible flags for my organisation",
    description=(
        "Flag key to on/off for the organisation in X-Barrels-Organisation and the "
        "signed-in user. Only flags marked exposed are returned."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND, **BAD_REQUEST},
)
async def evaluate_for_organisation(*, session: SessionDep, context: OrgMember) -> Any:
    flags = await service.evaluate_exposed(
        session, organisation_id=context.organisation_id, user_id=context.user.id
    )
    return FeatureFlagEvaluation(flags=flags)


@router.get(
    "/me/evaluate",
    response_model=FeatureFlagEvaluation,
    summary="Evaluate client-visible flags for me",
    description=(
        "Flag key to on/off for the signed-in user, without an organisation. Only "
        "flags marked exposed are returned."
    ),
    responses={**AUTHENTICATED},
)
async def evaluate_for_me(*, session: SessionDep, user: AccountUser) -> Any:
    flags = await service.evaluate_exposed(session, user_id=user.id)
    return FeatureFlagEvaluation(flags=flags)


@router.get(
    "/admin",
    response_model=FeatureFlagAdminList,
    summary="List feature flags",
    description="Every flag with its audience and staleness. Superuser only.",
    responses={**AUTHENTICATED},
)
async def list_flags(
    *, session: SessionDep, admin: AdminUser, pagination: PaginationDep
) -> Any:
    require_permission(current_user=admin, permission_key="feature_flags.manage")
    rows, total = await service.list_flags(
        session, offset=pagination.skip, limit=pagination.limit
    )
    return FeatureFlagAdminList(data=[service.to_admin(r) for r in rows], count=total)


@router.get(
    "/admin/stale",
    response_model=FeatureFlagAdminList,
    summary="List stale feature flags",
    description=(
        "Flags past their expires_at or review_by date: the cleanup list. "
        "Superuser only."
    ),
    responses={**AUTHENTICATED},
)
async def list_stale_flags(*, session: SessionDep, admin: AdminUser) -> Any:
    require_permission(current_user=admin, permission_key="feature_flags.manage")
    rows = await service.list_stale(session)
    return FeatureFlagAdminList(
        data=[service.to_admin(r) for r in rows], count=len(rows)
    )


@router.post(
    "/admin",
    response_model=FeatureFlagAdmin,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a feature flag",
    description=(
        "Creates a flag, off by default. Enabling outside the local environment "
        "needs a success metric. Superuser only."
    ),
    responses={**AUTHENTICATED, **CONFLICT},
)
async def create_flag(
    *, session: SessionDep, admin: AdminUser, payload: FeatureFlagCreate
) -> Any:
    require_permission(current_user=admin, permission_key="feature_flags.manage")
    flag = await service.create_flag(session, admin, payload)
    await session.commit()
    service.clear_cache()
    return service.to_admin(flag)


@router.get(
    "/admin/{flag_id}",
    response_model=FeatureFlagAdmin,
    summary="Get a feature flag",
    description="One flag by id. Superuser only.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_flag(
    *, session: SessionDep, admin: AdminUser, flag_id: str = FlagId
) -> Any:
    require_permission(current_user=admin, permission_key="feature_flags.manage")
    return service.to_admin(await service.get_flag(session, flag_id))


@router.patch(
    "/admin/{flag_id}",
    response_model=FeatureFlagAdmin,
    summary="Update a feature flag",
    description=(
        "Partial update; the key is immutable. Send null to clear success_metric, "
        "owner, expires_at or review_by. Superuser only."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def update_flag(
    *,
    session: SessionDep,
    admin: AdminUser,
    payload: FeatureFlagUpdate,
    flag_id: str = FlagId,
) -> Any:
    require_permission(current_user=admin, permission_key="feature_flags.manage")
    flag = await service.update_flag(session, admin, flag_id, payload)
    await session.commit()
    service.clear_cache()
    return service.to_admin(flag)


@router.delete(
    "/admin/{flag_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    summary="Delete a feature flag",
    description="Removes a flag once the code it guarded is gone. Superuser only.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def delete_flag(
    *, session: SessionDep, admin: AdminUser, flag_id: str = FlagId
) -> None:
    require_permission(current_user=admin, permission_key="feature_flags.manage")
    await service.delete_flag(session, admin, flag_id)
    await session.commit()
    service.clear_cache()
