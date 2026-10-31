"""Authenticating requests with an organisation API key (ADR-0029, PF5).

``Authorization: Bearer bk_...`` resolves to an ``ApiKeyContext``. Failure
contract:

1. Missing header, a non-``bk_`` credential (including a user JWT), an unknown,
   expired or revoked key: 401 with one generic message.
2. Organisation suspended: 403.
3. Too many requests from one address or one key: 429.
4. ``require_api_key_scope``: 403 when the key lacks the scope or the
   organisation is no longer entitled to the scope's product.

The user dependencies (``get_current_user`` and friends) only accept JWTs, so a
``bk_`` key is refused there; this dependency never accepts a JWT.
"""

import hmac
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
    OAuth2PasswordBearer,
)
from limits import parse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.dependencies import SessionDep, get_account_user
from src.rate_limit import connecting_address, limiter
from src.request_context import bind_organisation_id, reset_organisation_id

from . import api_key_scopes, api_keys, service
from .dependencies import ORGANISATION_HEADER, resolve_org_caller, resolve_org_context
from .exceptions import (
    ApiKeyInvalidError,
    ApiKeyRateLimitedError,
    ApiKeyScopeMissingError,
    OrganisationSuspendedError,
)
from .models import ApiKey, MembershipRole, OrganisationStatus, PlatformOrganisation

_bearer = HTTPBearer(
    scheme_name="OrganisationApiKey",
    description="Organisation API key (`bk_...`), sent as a Bearer token.",
    auto_error=False,
)
# Documents the member sign-in as an alternative on `org_or_key` routes; the
# token itself is read from `_bearer` (a `bk_` secret picks the key path).
_member_bearer = OAuth2PasswordBearer(
    tokenUrl=f"{auth_settings.API_V1_STR}/auth/token", auto_error=False
)
_PER_ADDRESS = parse("600/minute")
_PER_KEY = parse("600/minute")


@dataclass(frozen=True)
class ApiKeyContext:
    """The organisation and key behind an authenticated API-key request."""

    organisation: PlatformOrganisation
    key: ApiKey
    scopes: frozenset[str]

    @property
    def organisation_id(self) -> str:
        return self.organisation.id

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes


async def _within_limit(request: Request, key_id: str | None) -> bool:
    if not limiter.enabled:
        return True
    # Behind Cloudflare's proxy request.client is a Cloudflare edge; one
    # caller's bad keys must not lock out everyone arriving through it.
    host = connecting_address(request) if request.client else "unknown"
    if key_id is None:
        return await run_in_threadpool(
            limiter.limiter.hit, _PER_ADDRESS, "api-key-address", host
        )
    return await run_in_threadpool(limiter.limiter.hit, _PER_KEY, "api-key", key_id)


async def resolve_api_key(
    session: AsyncSession, request: Request, secret: str | None
) -> ApiKeyContext:
    """Look the secret up by its SHA-256 and apply the denial rules above."""
    if not await _within_limit(request, None):
        raise ApiKeyRateLimitedError()
    if not secret or not api_keys.looks_like_secret(secret):
        raise ApiKeyInvalidError()
    digest = api_keys.hash_secret(secret)
    row = (
        await session.execute(
            select(ApiKey, PlatformOrganisation)
            .join(
                PlatformOrganisation,
                PlatformOrganisation.id == ApiKey.organisation_id,
            )
            .where(ApiKey.key_hash == digest)
        )
    ).first()
    if row is None:
        raise ApiKeyInvalidError()
    key, organisation = row
    if not hmac.compare_digest(key.key_hash, digest) or not api_keys.is_active(key):
        raise ApiKeyInvalidError()
    if organisation.status != OrganisationStatus.ACTIVE.value:
        raise OrganisationSuspendedError()
    if not await _within_limit(request, key.id):
        raise ApiKeyRateLimitedError()
    if await api_keys.touch_last_used(session, key.id):
        await session.commit()
    return ApiKeyContext(
        organisation=organisation, key=key, scopes=frozenset(key.scopes or ())
    )


async def get_api_key_context(
    request: Request,
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AsyncGenerator[ApiKeyContext]:
    context = await resolve_api_key(
        session, request, credentials.credentials if credentials else None
    )
    token = bind_organisation_id(context.organisation.id)
    try:
        yield context
    finally:
        try:
            reset_organisation_id(token)
        except ValueError:
            # Teardown ran in a different context; the request task is ending.
            pass


def require_api_key_scope(
    scope: str,
) -> Callable[..., Awaitable[ApiKeyContext]]:
    """Build a dependency requiring ``scope`` on the key and the organisation's
    current entitlement to the scope's product."""
    if not api_key_scopes.is_valid(scope):
        raise ValueError(f"Unknown API key scope: {scope}")

    async def dependency(
        session: SessionDep,
        context: Annotated[ApiKeyContext, Depends(get_api_key_context)],
    ) -> ApiKeyContext:
        if not context.has_scope(scope):
            raise ApiKeyScopeMissingError()
        await service.require_app_enabled(
            session,
            organisation_id=context.organisation_id,
            app_key=api_key_scopes.product_of(scope),
        )
        return context

    return dependency


ApiKeyCaller = Annotated[ApiKeyContext, Depends(get_api_key_context)]


@dataclass(frozen=True)
class OrgAccess:
    """The organisation a request acts for, from a member or an API key.

    ``user`` is the signed-in member, ``key`` the API key; exactly one is set."""

    organisation: PlatformOrganisation
    user: User | None = None
    key: ApiKey | None = None

    @property
    def organisation_id(self) -> str:
        return self.organisation.id

    @property
    def actor_id(self) -> uuid.UUID | None:
        """The member's id; ``None`` for an API key (the system acts)."""
        return self.user.id if self.user else None


def org_or_key(
    app_key: str,
    scope: str,
    minimum_role: MembershipRole = MembershipRole.MEMBER,
    *,
    session_app: str | None = None,
) -> Callable[..., AsyncGenerator[OrgAccess]]:
    """Build a dependency for an ``org`` route that a signed-in member or an API
    key may call (ADR-0025 zones stay; ADR-0029).

    A ``bk_`` bearer takes the key path: the key's organisation must be active
    and entitled to ``app_key`` and the key must hold ``scope`` (401, 403, 429 as
    in ``require_api_key_scope``); the organisation header is ignored. Any other
    credential takes the unchanged member path: sign-in (401), organisation
    header (400), membership (404), ``minimum_role`` (403), entitlement (403).

    ``session_app`` opts the route in to the app-scoped session of that app: a JWT
    whose ``app`` claim equals it takes the member path (active account with
    ``app.<key>.access``). Any other app's token stays 401."""
    if not api_key_scopes.is_valid(scope):
        raise ValueError(f"Unknown API key scope: {scope}")
    if api_key_scopes.product_of(scope) != app_key:
        raise ValueError(f"Scope {scope} does not belong to {app_key}")

    async def dependency(
        request: Request,
        session: SessionDep,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
        _documented_member_auth: Annotated[str | None, Depends(_member_bearer)],
        organisation: Annotated[
            str | None,
            Header(
                alias=ORGANISATION_HEADER,
                description=(
                    "Id of the organisation the request acts for. Required for a "
                    "signed-in member (account"
                    + (f" or {session_app} app session" if session_app else "")
                    + "); ignored with an organisation API key."
                ),
            ),
        ] = None,
    ) -> AsyncGenerator[OrgAccess]:
        secret = credentials.credentials if credentials else None
        if secret is not None and secret.startswith("bk_"):
            context = await resolve_api_key(session, request, secret)
            if not context.has_scope(scope):
                raise ApiKeyScopeMissingError()
            await service.require_app_enabled(
                session, organisation_id=context.organisation_id, app_key=app_key
            )
            access = OrgAccess(organisation=context.organisation, key=context.key)
        else:
            if secret is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            if session_app is None:
                user = await get_account_user(session, secret)
            else:
                user, _ = await resolve_org_caller(session, credentials, session_app)
            member = await resolve_org_context(session, user, organisation)
            member.require_role(minimum_role)
            await service.require_app_enabled(
                session, organisation_id=member.organisation_id, app_key=app_key
            )
            access = OrgAccess(organisation=member.organisation, user=user)
        token = bind_organisation_id(access.organisation_id)
        try:
            yield access
        finally:
            try:
                reset_organisation_id(token)
            except ValueError:
                pass

    return dependency
