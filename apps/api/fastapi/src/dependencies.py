"""
Global dependencies for the application.

This module provides reusable dependencies following FastAPI best practices:
1. Dependencies are cached per request (called only once)
2. Dependencies can chain (depend on other dependencies)
3. Type annotations make dependencies clear and reusable

Dependency Chain Example:
    SessionDep -> get_db() -> yields async database session
    TokenDep -> reusable_oauth2 -> extracts JWT token from header
    CurrentUser -> get_current_user(SessionDep, TokenDep) -> validates and returns user
    SettingsDep -> get_settings() -> returns app settings

Usage Example:
    @router.get("/me")
    async def get_me(current_user: CurrentUser):
        # current_user is automatically injected and validated
        return current_user
"""

import uuid
from collections.abc import AsyncGenerator
from typing import Annotated, Any, cast

import jwt
import sentry_sdk
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth import superuser_mfa
from src.auth.config import auth_settings
from src.auth.constants import (
    ERROR_INACTIVE_USER,
    ERROR_INSUFFICIENT_PRIVILEGES,
    ERROR_INVALID_CREDENTIALS,
)
from src.auth.models import Role, User
from src.auth.utils import ALGORITHM
from src.config import Settings, get_settings
from src.database import async_session_factory
from src.models import TokenPayload

# OAuth2 scheme for token extraction
# This extracts the Bearer token from the Authorization header
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{auth_settings.API_V1_STR}/auth/token"
)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_db() -> AsyncGenerator[AsyncSession]:
    """
    Async database session dependency.

    Yields an AsyncSession for the request path.
    """
    async with async_session_factory() as session:
        yield session


# Typed dependency annotations
SessionDep = Annotated[AsyncSession, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def _token_user_id(token: str, *, app: str | None = None) -> uuid.UUID:
    """Validate a staff or account bearer token (never an app-scoped one).

    ``app`` also admits that one app's session; only ``optional_account`` passes it."""
    try:
        payload = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[ALGORITHM])
        token_data = TokenPayload(**payload)
    except InvalidTokenError, ValidationError:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    if not token_data.sub:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    if token_data.app is not None and token_data.app != app:
        # App-scoped tokens (src/auth/apps.py) only work on their own app's routes.
        raise _unauthorized("This sign-in is limited to another app")
    try:
        return uuid.UUID(token_data.sub)
    except ValueError:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)


def _token_app(token: str) -> str | None:
    """The ``app`` claim of a token already validated by ``_token_user_id``."""
    try:
        payload = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[ALGORITHM])
        return TokenPayload(**payload).app
    except InvalidTokenError, ValidationError:
        return None


async def get_current_user(session: SessionDep, token: TokenDep) -> User:
    """
    Get current authenticated user dependency.

    This dependency chains two other dependencies:
    1. SessionDep - for database access
    2. TokenDep - for JWT token validation

    Returns the authenticated user if the token is valid.
    Raises HTTPException if token is invalid or user not found.

    This dependency is cached, so you can use it multiple times in
    chained dependencies without additional database queries."""
    user = await get_authenticated_user(session, _token_user_id(token))
    from src.auth.privileged_mfa import require_privileged_mfa

    await require_privileged_mfa(session, user, token=token)
    # ADR-0037: the opaque database ID only, never name or email.
    sentry_sdk.set_tag("user_id", str(user.id))
    return user


async def get_account_user(session: SessionDep, token: TokenDep) -> User:
    """Any active, verified Barrels account, staff-approved or not (ADR-0017).

    Only for self-service routes about the caller's own account (profile,
    password, two-factor, sessions, access). Everything else uses CurrentUser,
    which keeps refusing accounts without staff approval.
    """
    return await get_authenticated_user(
        session, _token_user_id(token), allow_unapproved=True
    )


async def get_authenticated_user(
    session: AsyncSession, user_id: uuid.UUID, *, allow_unapproved: bool = False
) -> User:
    """Apply the same live account and role checks for every credential type."""
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(cast(Any, User.roles)).selectinload(
                cast(Any, Role.permissions)
            ),
            selectinload(cast(Any, User.user_image)),
        )
    )
    result = await session.execute(stmt)
    user = result.scalars().unique().first()
    if not user:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    if not user.is_active:
        raise _unauthorized(ERROR_INACTIVE_USER)
    if user.registration_pending and not allow_unapproved:
        raise HTTPException(
            status_code=403,
            detail="Your registration is awaiting administrator approval",
        )
    if user.password_setup_pending and user.email_verified_at is None:
        raise HTTPException(
            status_code=403, detail="Finish account activation before continuing"
        )
    from sqlalchemy.orm.attributes import set_committed_value

    from src.auth.access import effective_roles

    set_committed_value(user, "roles", await effective_roles(session, user))
    # Attribute this request's audited changes to the signed-in person, and say the
    # sign-in was an account session (app sessions set their own, see organisations).
    from src.audit.service import set_actor, set_actor_session

    set_actor(session, user.id)
    set_actor_session(session, app=None)
    return user


# Convenience type annotations for common dependencies
# Use these in route parameters for clean, readable code
CurrentUser = Annotated[User, Depends(get_current_user)]
AccountUser = Annotated[User, Depends(get_account_user)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_current_active_superuser(current_user: CurrentUser) -> User:
    """Shared superuser dependency (canonical in src.dependencies)."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_INSUFFICIENT_PRIVILEGES,
        )
    return current_user


def is_user_manager(user: User) -> bool:
    """Superuser or holder of user.manage (delegated account administration)."""
    from src.auth.policy import has_permission

    return user.is_superuser or has_permission(
        current_user=user, permission_key="user.manage"
    )


async def get_current_user_manager(current_user: CurrentUser) -> User:
    """Allow superusers and users holding the user.manage permission.

    user.manage delegates account administration (create staff logins,
    deactivate leavers) to hr-admins; anything touching superuser status or
    role/permission definitions stays superuser-only via in-route guards.
    """
    if not is_user_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_INSUFFICIENT_PRIVILEGES,
        )
    return current_user


AdminUser = Annotated[User, Depends(get_current_active_superuser)]


async def get_current_mfa_superuser(
    admin: AdminUser, session: SessionDep, token: TokenDep
) -> User:
    """Superuser with an enrolled authenticator and a session that passed MFA.

    Applies in every environment, whatever ``AUTH_PRIVILEGED_MFA_MODE`` says."""
    from src.auth import privileged_mfa

    superuser_mfa.require_superuser_mfa(admin)
    await privileged_mfa.require_mfa_session(session, admin, token=token)
    return admin


MfaAdminUser = Annotated[User, Depends(get_current_mfa_superuser)]


async def optional_account(
    request: Request, session: AsyncSession, *, app: str | None = None
) -> User | None:
    """The signed-in account behind a bearer header, or None.

    For public routes that stay anonymous but apply a rule to a signed-in
    caller (for example the verified-email deposit gate, ADR-0018). It reads the
    header itself so the route's OpenAPI security stays public, and a missing or
    bad credential never fails the request: browsing needs no sign-in. ``app``
    also recognises that app's own session (for example ``bookings``), so its
    users are not mistaken for guests; it grants nothing, it only names the caller."""
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        user = await get_authenticated_user(
            session,
            _token_user_id(token.strip(), app=app),
            allow_unapproved=True,
        )
        if app is not None and _token_app(token.strip()) == app:
            # An app session counts only while the account still holds that
            # app's access (the check user_for_app makes).
            from src.auth.eligibility import is_eligible_for_app

            if not await is_eligible_for_app(session=session, user=user, app_key=app):
                # A guest from here on: undo the audit attribution made above.
                from src.audit.service import set_actor

                set_actor(session, None)
                return None
        return user
    except HTTPException:
        return None
