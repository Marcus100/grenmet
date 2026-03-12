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
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from src.auth.config import auth_settings
from src.auth.constants import (
    ERROR_INACTIVE_USER,
    ERROR_INSUFFICIENT_PRIVILEGES,
    ERROR_INVALID_CREDENTIALS,
)
from src.auth.models import Role, User, UserImage
from src.auth.utils import ALGORITHM
from src.config import Settings, get_settings
from src.database import async_session_factory
from src.models import TokenPayload

# OAuth2 scheme for token extraction
# This extracts the Bearer token from the Authorization header
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{auth_settings.API_V1_STR}/login/access-token"
)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Async database session dependency.

    Yields an AsyncSession for the request path.
    """
    async with async_session_factory() as session:
        yield session


# Typed dependency annotations
SessionDep = Annotated[AsyncSession, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


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
    try:
        payload = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[ALGORITHM])
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    if not token_data.sub:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    try:
        user_id = uuid.UUID(token_data.sub)
    except ValueError:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.user_image),
        )
    )
    result = await session.execute(stmt)
    user = result.scalars().unique().first()
    if not user:
        raise _unauthorized(ERROR_INVALID_CREDENTIALS)
    if not user.is_active:
        raise _unauthorized(ERROR_INACTIVE_USER)
    return user


# Convenience type annotations for common dependencies
# Use these in route parameters for clean, readable code
CurrentUser = Annotated[User, Depends(get_current_user)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_current_active_superuser(current_user: CurrentUser) -> User:
    """Shared superuser dependency (canonical in src.dependencies)."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_INSUFFICIENT_PRIVILEGES,
        )
    return current_user
