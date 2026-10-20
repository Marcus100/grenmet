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
from collections.abc import AsyncGenerator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from limits import parse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import SessionDep
from src.rate_limit import limiter
from src.request_context import bind_organisation_id, reset_organisation_id

from . import api_key_scopes, api_keys, service
from .exceptions import (
    ApiKeyInvalidError,
    ApiKeyRateLimitedError,
    ApiKeyScopeMissingError,
    OrganisationSuspendedError,
)
from .models import ApiKey, OrganisationStatus, PlatformOrganisation

_bearer = HTTPBearer(
    scheme_name="OrganisationApiKey",
    description="Organisation API key (`bk_...`), sent as a Bearer token.",
    auto_error=False,
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
    host = request.client.host if request.client else "unknown"
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
