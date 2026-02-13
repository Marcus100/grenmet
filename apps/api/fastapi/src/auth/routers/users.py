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
from sqlmodel import col, delete, func, select

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
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from src.auth.utils import get_password_hash, verify_password
from src.config import settings
from src.dependencies import CurrentUser, SessionDep
from src.email import generate_new_account_email, send_email
from src.items.models import Item
from src.models import Message

router = APIRouter(prefix="/auth/users", tags=["users"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
def read_users(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve users.
    """
    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = select(User).offset(skip).limit(limit)
    users = session.exec(statement).all()

    return UsersPublic(
        data=[UserPublic.model_validate(user) for user in users], count=count
    )


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    """
    Create new user.
    """
    user = service.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail=ERROR_USER_EXISTS,
        )

    user = service.create_user(session=session, user_create=user_in)
    if settings.EMAILS_ENABLED and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.patch("/me", response_model=UserPublic)
def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """
    Update own user.
    """
    if user_in.email:
        existing_user = service.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(status_code=409, detail=ERROR_USER_EXISTS)
    user_data = user_in.model_dump(exclude_unset=True)
    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.patch("/me/password", response_model=Message)
def update_password_me(
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
    current_user.hashed_password = hashed_password
    session.add(current_user)
    session.commit()
    return Message(message=SUCCESS_PASSWORD_UPDATED)


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    """
    if current_user.is_superuser:
        raise HTTPException(status_code=403, detail=ERROR_SUPERUSER_DELETE_SELF)
    session.delete(current_user)
    session.commit()
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
def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = service.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail=ERROR_USER_EXISTS,
        )
    user_create = UserCreate.model_validate(user_in)
    user = service.create_user(session=session, user_create=user_create)
    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = session.get(User, user_id)
    if user == current_user:
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
)
def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
) -> Any:
    """
    Update a user.
    """
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = service.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(status_code=409, detail=ERROR_USER_EXISTS)

    db_user = service.update_user(session=session, db_user=db_user, user_in=user_in)
    return db_user


@router.delete(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Message:
    """
    Delete a user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    if user == current_user:
        raise HTTPException(status_code=403, detail=ERROR_SUPERUSER_DELETE_SELF)
    statement = delete(Item).where(col(Item.owner_id) == user_id)
    session.exec(statement)
    session.delete(user)
    session.commit()
    return Message(message=SUCCESS_USER_DELETED)
