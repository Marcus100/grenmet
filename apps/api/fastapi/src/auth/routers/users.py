"""
User management endpoints for CRUD operations on users.

This router handles:
- User listing (superuser only)
- User creation (superuser only)
- User registration (public)
- User profile updates
- User deletion
- Password changes
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from src.auth import service
from src.auth.constants import (
    ERROR_INSUFFICIENT_PRIVILEGES,
    ERROR_PASSWORD_INCORRECT,
    ERROR_PASSWORD_SAME,
    ERROR_SUPERUSER_DELETE_SELF,
    ERROR_USER_EXISTS,
    ERROR_USER_NOT_FOUND,
    SUCCESS_PASSWORD_UPDATED,
    SUCCESS_USER_DELETED,
)
from src.auth.dependencies import get_current_active_superuser
from src.auth.models import User
from src.auth.schemas import (
    UpdatePassword,
    UserCreate,
    UserPublic,
    UserRegister,
    UserUpdate,
    UserUpdateMe,
)
from src.auth.utils import get_password_hash, verify_password
from src.dependencies import CurrentUser, SessionDep
from src.email import generate_new_account_email, send_email
from src.email_config import email_settings
from src.models import Message
from src.pagination import PaginatedResponse, PaginationParams, get_pagination_params

router = APIRouter(prefix="/auth/users", tags=["users"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=PaginatedResponse[UserPublic],
    summary="List users",
    description="Return users (superuser only). Uses standard pagination (page, size, total_pages).",
    responses={status.HTTP_200_OK: {"description": "Users returned"}},
)
async def read_users(
    session: SessionDep,
    pagination: PaginationParams = Depends(get_pagination_params),
) -> Any:
    """
    Retrieve users.
    """
    users, count = await service.get_users(
        session=session, skip=pagination.skip, limit=pagination.limit
    )
    return PaginatedResponse(
        data=[UserPublic.model_validate(user) for user in users],
        count=count,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
    summary="Create user",
    description="Create a user (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "User created"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "User with this email already exists"
        },
    },
)
async def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    """
    Create new user.
    """
    user = await service.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail=ERROR_USER_EXISTS,
        )
    user = await service.create_user(session=session, user_create=user_in)
    if email_settings.EMAILS_ENABLED and user_in.email:
        email_data = await generate_new_account_email(
            email_to=user_in.email,
            username=user_in.email,
            password=user_in.password,
        )
        await run_in_threadpool(
            send_email,
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Get current user",
    description="Return the currently authenticated user.",
    responses={status.HTTP_200_OK: {"description": "Current user returned"}},
)
async def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.patch(
    "/me",
    response_model=UserPublic,
    summary="Update current user",
    description="Update profile fields for the currently authenticated user.",
    responses={
        status.HTTP_200_OK: {"description": "User updated"},
        status.HTTP_409_CONFLICT: {"description": "Email already exists"},
    },
)
async def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """
    Update own user.
    """
    if user_in.email:
        existing_user = await service.get_user_by_email(
            session=session, email=user_in.email
        )
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(status_code=409, detail=ERROR_USER_EXISTS)
    user = await session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    user_data = user_in.model_dump(exclude_unset=True)
    user.sqlmodel_update(user_data)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.patch(
    "/me/password",
    response_model=Message,
    summary="Change current user password",
    description="Change password for the currently authenticated user.",
    responses={
        status.HTTP_200_OK: {"description": "Password updated"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Current password incorrect or new password unchanged"
        },
    },
)
async def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password.
    """
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail=ERROR_PASSWORD_INCORRECT)
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail=ERROR_PASSWORD_SAME)
    hashed_password = get_password_hash(body.new_password)

    user = await session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    user.hashed_password = hashed_password
    session.add(user)
    await session.commit()
    return Message(message=SUCCESS_PASSWORD_UPDATED)


@router.delete(
    "/me",
    response_model=Message,
    summary="Delete current user",
    description="Delete currently authenticated user account.",
    responses={
        status.HTTP_200_OK: {"description": "User deleted"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Superuser cannot delete own account"
        },
    },
)
async def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    """
    if current_user.is_superuser:
        raise HTTPException(status_code=403, detail=ERROR_SUPERUSER_DELETE_SELF)

    user = await session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    await session.delete(user)
    await session.commit()
    return Message(message=SUCCESS_USER_DELETED)


@router.post(
    "/signup",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
    description="Create a new user account without authentication. Public endpoint for user registration.",
    responses={
        status.HTTP_201_CREATED: {
            "description": "User registered successfully",
            "model": UserPublic,
        },
        status.HTTP_400_BAD_REQUEST: {
            "description": "User with this email already exists",
        },
    },
)
async def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = await service.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(status_code=400, detail=ERROR_USER_EXISTS)
    user_create = UserCreate.model_validate(user_in)
    created_user = await service.create_user(session=session, user_create=user_create)

    if email_settings.EMAILS_ENABLED:
        try:
            email_data = await generate_new_account_email(
                email_to=user_in.email,
                username=user_in.username,
                password=user_in.password,
                first_name=user_in.first_name,
            )
            await run_in_threadpool(
                send_email,
                email_to=user_in.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )
        except Exception:
            # Welcome email failure must not block registration.
            import logging as _logging

            _logging.getLogger(__name__).exception(
                "Failed to send welcome email to %s", user_in.email
            )

    return created_user


@router.get(
    "/{user_id}",
    response_model=UserPublic,
    summary="Get user by ID",
    description="Return user by ID. Non-superusers can only fetch themselves.",
    responses={
        status.HTTP_200_OK: {"description": "User returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient privileges"},
    },
)
async def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    if user.id == current_user.id:
        return user
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail=ERROR_INSUFFICIENT_PRIVILEGES,
        )
    return user


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
    summary="Update user by ID",
    description="Update a user by ID (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "User updated"},
        status.HTTP_404_NOT_FOUND: {"description": "User not found"},
        status.HTTP_409_CONFLICT: {"description": "Email already exists"},
    },
)
async def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
) -> Any:
    """
    Update a user.
    """

    db_user = await session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = await service.get_user_by_email(
            session=session, email=user_in.email
        )
        if existing_user and existing_user.id != user_id:
            raise HTTPException(status_code=409, detail=ERROR_USER_EXISTS)
    return await service.update_user(session=session, db_user=db_user, user_in=user_in)


@router.delete(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    summary="Delete user by ID",
    description="Delete a user by ID (superuser only).",
    responses={
        status.HTTP_200_OK: {"description": "User deleted"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Superuser cannot delete own account"
        },
        status.HTTP_404_NOT_FOUND: {"description": "User not found"},
    },
)
async def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Message:
    """
    Delete a user.
    """

    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    if user.id == current_user.id:
        raise HTTPException(status_code=403, detail=ERROR_SUPERUSER_DELETE_SELF)
    await session.delete(user)
    await session.commit()
    return Message(message=SUCCESS_USER_DELETED)
