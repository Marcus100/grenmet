"""
Authentication endpoints for login, password recovery, and password reset.

This router handles all authentication-related operations including:
- OAuth2 token login
- Password recovery email
- Password reset
"""

from datetime import datetime
from typing import Annotated, Any, overload

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from starlette.requests import Request

from src.auth import service
from src.auth.constants import (
    ERROR_INACTIVE_USER,
    ERROR_INCORRECT_CREDENTIALS,
    ERROR_INVALID_CREDENTIALS,
    ERROR_INVALID_SESSION,
    ERROR_INVALID_TOKEN,
    ERROR_USER_NOT_FOUND,
    SUCCESS_LOGGED_OUT,
    SUCCESS_LOGGED_OUT_ALL,
    SUCCESS_PASSWORD_RECOVERY_SENT,
    SUCCESS_PASSWORD_UPDATED,
)
from src.auth.dependencies import get_current_active_superuser
from src.auth.schemas import (
    NewPassword,
    SessionAccessTokenResponse,
    SessionLoginRequest,
    SessionLoginResponse,
    SessionPublic,
    SessionTokenRequest,
    UserPublic,
)
from src.dependencies import CurrentUser, SessionDep
from src.email import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)
from src.models import Message, Token
from src.rate_limit import limiter

from ..utils import create_access_token

router = APIRouter(tags=["login"])


def _request_metadata(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None
    return user_agent, ip_address


@overload
def _session_auth_response(
    *,
    access_token: str,
    access_token_expires_at: datetime,
    session_token: str,
    db_session: Any,
    user: Any,
) -> SessionLoginResponse: ...


@overload
def _session_auth_response(
    *,
    access_token: str,
    access_token_expires_at: datetime,
    session_token: None,
    db_session: Any,
    user: Any,
) -> SessionAccessTokenResponse: ...


def _session_auth_response(
    *,
    access_token: str,
    access_token_expires_at: datetime,
    session_token: str | None,
    db_session: Any,
    user: Any,
) -> SessionLoginResponse | SessionAccessTokenResponse:
    payload = {
        "access_token": access_token,
        "token_type": "bearer",
        "access_token_expires_at": access_token_expires_at,
        "session_expires_at": db_session.expires_at,
        "session": SessionPublic.model_validate(db_session, from_attributes=True),
        "user": UserPublic.model_validate(user, from_attributes=True),
    }
    if session_token is not None:
        return SessionLoginResponse(session_token=session_token, **payload)
    return SessionAccessTokenResponse(**payload)


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
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "description": "Rate limit exceeded",
        },
    },
)
@limiter.limit("10/minute")
async def login_access_token(
    request: Request,
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    _ = request
    user = await service.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail=ERROR_INCORRECT_CREDENTIALS)
    elif not user.is_active:
        raise HTTPException(status_code=400, detail=ERROR_INACTIVE_USER)
    access_token_expires = service.get_legacy_access_token_expires_delta()
    return Token(
        access_token=create_access_token(user.id, expires_delta=access_token_expires)
    )


@router.post(
    "/login/session",
    response_model=SessionLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Create a persisted web session",
    description="Authenticate a user, create an opaque persisted session, and mint a short-lived access token.",
    responses={
        status.HTTP_200_OK: {"description": "Session created successfully"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Incorrect email/password or inactive user",
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "description": "Rate limit exceeded",
        },
    },
)
@limiter.limit("10/minute")
async def login_session(
    request: Request,
    session: SessionDep,
    body: SessionLoginRequest,
) -> SessionLoginResponse:
    """Create a long-lived session plus a short-lived access token for web clients."""
    user = await service.authenticate(
        session=session,
        email=body.email,
        password=body.password,
    )
    if not user:
        raise HTTPException(status_code=400, detail=ERROR_INCORRECT_CREDENTIALS)
    if not user.is_active:
        raise HTTPException(status_code=400, detail=ERROR_INACTIVE_USER)

    user_agent, ip_address = _request_metadata(request)
    db_session, session_token = await service.create_session(
        session=session,
        user=user,
        client_type=body.client_type,
        app_name=body.app_name,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    access_token, access_token_expires_at = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
    )
    return _session_auth_response(
        access_token=access_token,
        access_token_expires_at=access_token_expires_at,
        session_token=session_token,
        db_session=db_session,
        user=user,
    )


@router.post(
    "/login/session/access-token",
    response_model=SessionAccessTokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange a session secret for a short-lived access token",
    description="Validate a persisted session and mint a fresh access token for server-side API calls.",
)
async def exchange_session_for_access_token(
    request: Request,
    session: SessionDep,
    body: SessionTokenRequest,
) -> SessionAccessTokenResponse:
    """Exchange an opaque session secret for a short-lived API access token."""
    user_agent, ip_address = _request_metadata(request)
    exchange = await service.exchange_session_for_access_token(
        session=session,
        session_secret=body.session_token,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    if not exchange:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_INVALID_SESSION,
            headers={"WWW-Authenticate": "Bearer"},
        )

    db_session, user, access_token, access_token_expires_at = exchange
    return _session_auth_response(
        access_token=access_token,
        access_token_expires_at=access_token_expires_at,
        session_token=None,
        db_session=db_session,
        user=user,
    )


@router.post(
    "/login/session/refresh",
    response_model=SessionLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate a persisted session",
    description="Rotate a valid session secret and mint a fresh short-lived access token.",
)
async def refresh_session(
    request: Request,
    session: SessionDep,
    body: SessionTokenRequest,
) -> SessionLoginResponse:
    """Rotate an existing session and return a replacement secret plus access token."""
    db_session = await service.get_active_session_by_secret(
        session=session, session_secret=body.session_token
    )
    if not db_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_INVALID_SESSION,
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await service.get_user_by_id(session=session, user_id=db_session.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_agent, ip_address = _request_metadata(request)
    new_session, new_session_token = await service.rotate_session(
        session=session,
        db_session=db_session,
        user=user,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    access_token, access_token_expires_at = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
    )
    return _session_auth_response(
        access_token=access_token,
        access_token_expires_at=access_token_expires_at,
        session_token=new_session_token,
        db_session=new_session,
        user=user,
    )


@router.post(
    "/login/session/logout",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Revoke a persisted session",
    description="Revoke the current persisted session. This endpoint is idempotent.",
)
async def logout_session(session: SessionDep, body: SessionTokenRequest) -> Message:
    """Revoke a single persisted session."""
    db_session = await service.get_session_by_secret(
        session=session, session_secret=body.session_token
    )
    if db_session:
        await service.revoke_session(session=session, db_session=db_session)
    return Message(message=SUCCESS_LOGGED_OUT)


@router.post(
    "/login/session/logout-all",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Revoke every session for the current user",
    description="Invalidate all persisted sessions belonging to the current user.",
)
async def logout_all_sessions(
    session: SessionDep, body: SessionTokenRequest
) -> Message:
    """Revoke all active sessions for the user identified by the supplied session secret."""
    db_session = await service.get_active_session_by_secret(
        session=session, session_secret=body.session_token
    )
    if not db_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_INVALID_SESSION,
            headers={"WWW-Authenticate": "Bearer"},
        )
    await service.revoke_user_sessions(session=session, user_id=db_session.user_id)
    return Message(message=SUCCESS_LOGGED_OUT_ALL)


@router.post("/login/test-token", response_model=UserPublic)
async def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token.
    """
    return current_user


@router.post(
    "/password-recovery/{email}",
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Rate limit exceeded"},
    },
)
@limiter.limit("5/minute")
async def recover_password(
    request: Request, email: str, session: SessionDep
) -> Message:
    """
    Password Recovery.
    """
    _ = request
    user = await service.get_user_by_email(session=session, email=email)
    if user:
        password_reset_token = generate_password_reset_token(email=email)
        email_data = await generate_reset_password_email(
            email_to=user.email, email=email, token=password_reset_token
        )
        await run_in_threadpool(
            send_email,
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return Message(message=SUCCESS_PASSWORD_RECOVERY_SENT)


@router.post(
    "/reset-password/",
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Rate limit exceeded"},
    },
)
@limiter.limit("5/minute")
async def reset_password(
    request: Request, session: SessionDep, body: NewPassword
) -> Message:
    """
    Reset password.
    """
    _ = request
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail=ERROR_INVALID_TOKEN)

    user = await service.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=ERROR_USER_NOT_FOUND,
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail=ERROR_INACTIVE_USER)
    await service.set_password(
        session=session, user=user, new_password=body.new_password
    )
    return Message(message=SUCCESS_PASSWORD_UPDATED)


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
async def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery.
    """
    user = await service.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(status_code=404, detail=ERROR_USER_NOT_FOUND)
    password_reset_token = generate_password_reset_token(email=email)
    email_data = await generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
