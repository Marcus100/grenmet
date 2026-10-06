"""Dependencies for routes owned by an app-scoped app (src/auth/apps.py).

Only bearer tokens minted for that app are accepted; staff tokens and other
apps' tokens are refused. The staff approval gate does not apply, but the
account must be active, verified and hold ``app.<key>.access``.
"""

import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.auth import service
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import ALGORITHM
from src.dependencies import SessionDep
from src.models import TokenPayload

_bearer = HTTPBearer(auto_error=False)
OptionalBearer = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthorized(detail: str = "Sign in again") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def user_for_app(
    session: SessionDep, credentials: HTTPAuthorizationCredentials, app_key: str
) -> User:
    try:
        payload = TokenPayload(
            **jwt.decode(
                credentials.credentials,
                auth_settings.SECRET_KEY,
                algorithms=[ALGORITHM],
            )
        )
        user_id = uuid.UUID(payload.sub or "")
    except InvalidTokenError, ValidationError, ValueError:
        raise _unauthorized() from None
    if payload.app != app_key:
        raise _unauthorized("Sign in to this app to continue")
    user = (
        await session.execute(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.user_image))
        )
    ).scalar_one_or_none()
    if user is None or not await service.is_eligible_for_app(
        session=session, user=user, app_key=app_key
    ):
        raise _unauthorized()
    return user


def unauthorized(detail: str = "Sign in again") -> HTTPException:
    return _unauthorized(detail)


def app_user(app_key: str) -> Callable[..., Awaitable[User]]:
    """Required signed-in member of ``app_key``."""

    async def dependency(session: SessionDep, credentials: OptionalBearer) -> User:
        if credentials is None:
            raise _unauthorized()
        return await user_for_app(session, credentials, app_key)

    return dependency


def optional_app_user(app_key: str) -> Callable[..., Awaitable[User | None]]:
    """Signed-in member when a token is supplied; ``None`` for anonymous visitors.

    A supplied but invalid token still fails rather than silently downgrading.
    """

    async def dependency(
        session: SessionDep, credentials: OptionalBearer
    ) -> User | None:
        if credentials is None:
            return None
        return await user_for_app(session, credentials, app_key)

    return dependency
