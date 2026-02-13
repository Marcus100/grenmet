"""
Global dependencies for the application.

This module provides reusable dependencies following FastAPI best practices:
1. Dependencies are cached per request (called only once)
2. Dependencies can chain (depend on other dependencies)
3. Type annotations make dependencies clear and reusable

Dependency Chain Example:
    SessionDep -> get_db() -> yields database session
    TokenDep -> reusable_oauth2 -> extracts JWT token from header
    CurrentUser -> get_current_user(SessionDep, TokenDep) -> validates and returns user
    SettingsDep -> get_settings() -> returns app settings

Usage Example:
    @router.get("/me")
    def get_me(current_user: CurrentUser):
        # current_user is automatically injected and validated
        return current_user
"""

from collections.abc import Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from src.auth.constants import (
    ERROR_INACTIVE_USER,
    ERROR_INVALID_CREDENTIALS,
    ERROR_USER_NOT_FOUND,
)
from src.auth.models import User
from src.auth.utils import ALGORITHM
from src.config import Settings, get_settings, settings
from src.database import engine
from src.models import TokenPayload

# OAuth2 scheme for token extraction
# This extracts the Bearer token from the Authorization header
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    """
    Database session dependency.

    Yields a SQLModel session that is automatically closed after the request.
    This ensures proper connection management and prevents connection leaks.

    The session is cached per request, so multiple dependencies can use
    the same session without creating multiple connections.
    """
    with Session(engine) as session:
        yield session


# Typed dependency annotations
# These make dependencies easy to use with type hints
SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
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
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_INVALID_CREDENTIALS,
        )
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    if not user.is_active:
        raise HTTPException(status_code=400, detail=ERROR_INACTIVE_USER)
    return user


# Convenience type annotations for common dependencies
# Use these in route parameters for clean, readable code
CurrentUser = Annotated[User, Depends(get_current_user)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    """
    Get current superuser dependency.

    This dependency chains CurrentUser, demonstrating dependency composition:
    CurrentUser -> get_current_user -> SessionDep + TokenDep

    Returns the user if they are a superuser.
    Raises HTTPException if the user lacks superuser privileges.

    Example:
        @router.delete("/admin/users/{user_id}")
        def delete_user(superuser: Annotated[User, Depends(get_current_active_superuser)]):
            # Only superusers can access this route
            pass
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
