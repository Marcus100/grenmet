"""
Authentication endpoints for login, password recovery, and password reset.

This router handles all authentication-related operations including:
- OAuth2 token login
- Password recovery email
- Password reset
"""

from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from src.auth import service
from src.auth.constants import (
    ERROR_INACTIVE_USER,
    ERROR_INCORRECT_CREDENTIALS,
    ERROR_INVALID_TOKEN,
    ERROR_USER_NOT_FOUND,
    SUCCESS_PASSWORD_RECOVERY_SENT,
    SUCCESS_PASSWORD_UPDATED,
)
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import NewPassword, UserPublic
from src.auth.utils import get_password_hash
from src.config import settings
from src.dependencies import CurrentUser, SessionDep
from src.email import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)
from src.models import Message, Token

from ..utils import create_access_token

router = APIRouter(tags=["login"])


@router.post(
    "/login/access-token",
    response_model=Token,
    status_code=status.HTTP_200_OK,
    summary="Login with OAuth2",
    description="OAuth2 compatible token login. Returns an access token for future requests.",
    responses={
        status.HTTP_200_OK: {
            "description": "Login successful, access token returned",
            "model": Token,
        },
        status.HTTP_400_BAD_REQUEST: {
            "description": "Incorrect email/password or inactive user",
        },
    },
)
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = service.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail=ERROR_INCORRECT_CREDENTIALS)
    elif not user.is_active:
        raise HTTPException(status_code=400, detail=ERROR_INACTIVE_USER)
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=create_access_token(user.id, expires_delta=access_token_expires)
    )


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token.
    """
    return current_user


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Password Recovery.
    """
    user = service.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail=ERROR_USER_NOT_FOUND,
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )
    send_email(
        email_to=user.email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message=SUCCESS_PASSWORD_RECOVERY_SENT)


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password.
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail=ERROR_INVALID_TOKEN)
    user = service.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=ERROR_USER_NOT_FOUND,
        )
    elif not user.is_active:
        raise HTTPException(status_code=400, detail=ERROR_INACTIVE_USER)
    hashed_password = get_password_hash(password=body.new_password)
    user.hashed_password = hashed_password
    session.add(user)
    session.commit()
    return Message(message=SUCCESS_PASSWORD_UPDATED)


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery.
    """
    user = service.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
