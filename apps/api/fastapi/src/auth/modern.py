import uuid

from fastapi import APIRouter
from starlette.requests import Request

from src.auth import modern_service as service
from src.auth.account_security import new_recovery_codes, revoke_owned_session
from src.auth.modern_schemas import (
    AccountSecurityPublic,
    EmailConfirm,
    EmailRequest,
    GoogleChallengePublic,
    GoogleComplete,
    GoogleFinish,
    GoogleStart,
    GoogleStartPublic,
    RecoveryCodesPublic,
    SecurityProof,
)
from src.auth.schemas import SessionLoginResponse
from src.dependencies import CurrentUser, SessionDep
from src.models import Message
from src.rate_limit import limiter

router = APIRouter(prefix="/auth/modern", tags=["modern-auth"])


@router.post(
    "/email/request",
    response_model=Message,
    summary="Request verified password setup",
    status_code=200,
    description="Request verified password setup. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"description": "Invalid or expired proof"},
        403: {"description": "Account is not eligible"},
    },
)
@limiter.limit("5/minute")
async def email_request(
    *, request: Request, session: SessionDep, body: EmailRequest
) -> Message:
    return await service.email_request(request=request, session=session, body=body)


@router.post(
    "/email/confirm",
    response_model=Message,
    summary="Verify email and establish password",
    status_code=200,
    description="Verify email and establish password. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"description": "Invalid or expired proof"},
        403: {"description": "Account is not eligible"},
    },
)
@limiter.limit("10/minute")
async def email_confirm(
    *, request: Request, session: SessionDep, body: EmailConfirm
) -> Message:
    return await service.email_confirm(request=request, session=session, body=body)


@router.post(
    "/google/start",
    response_model=GoogleStartPublic,
    summary="Start Google sign-in",
    status_code=200,
    description="Start Google sign-in. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"description": "Invalid or expired proof"},
        403: {"description": "Account is not eligible"},
    },
)
@limiter.limit("10/minute")
async def google_start(
    *, request: Request, session: SessionDep, body: GoogleStart
) -> GoogleStartPublic:
    return await service.google_start(request=request, session=session, body=body)


@router.post(
    "/google/complete",
    response_model=GoogleChallengePublic,
    summary="Verify Google callback",
    status_code=200,
    description="Verify Google callback. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"description": "Invalid or expired proof"},
        403: {"description": "Account is not eligible"},
    },
)
@limiter.limit("10/minute")
async def google_complete(
    *, request: Request, session: SessionDep, body: GoogleComplete
) -> GoogleChallengePublic:
    return await service.google_complete(request=request, session=session, body=body)


@router.post(
    "/google/finish",
    response_model=SessionLoginResponse,
    summary="Finish Google sign-in with MFA",
    status_code=200,
    description="Finish Google sign-in with MFA. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"description": "Invalid or expired proof"},
        403: {"description": "Account is not eligible"},
    },
)
@limiter.limit("5/minute")
async def google_finish(
    *, request: Request, session: SessionDep, body: GoogleFinish
) -> SessionLoginResponse:
    return await service.google_finish(request=request, session=session, body=body)


@router.get(
    "/security",
    response_model=AccountSecurityPublic,
    status_code=200,
    summary="Read account security",
    description="Show verified sign-in methods and active sessions for the current account, without exposing session secrets.",
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Verify account email first"},
    },
)
async def read_account_security(
    *, session: SessionDep, current_user: CurrentUser
) -> AccountSecurityPublic:
    return await service.account_security(session=session, user=current_user)


@router.post(
    "/security/recovery-codes",
    response_model=RecoveryCodesPublic,
    status_code=200,
    summary="Replace MFA recovery codes",
    description="Returns eight recovery codes once after confirming password and an authenticator or existing recovery code. Only hashes are stored.",
    responses={400: {"description": "Confirmation failed"}},
)
@limiter.limit("5/minute")
async def replace_recovery_codes(
    *,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    body: SecurityProof,
) -> RecoveryCodesPublic:
    _ = request
    return RecoveryCodesPublic(
        codes=await new_recovery_codes(session, current_user, body.password, body.code)
    )


@router.delete(
    "/security/sessions/{session_id}",
    response_model=Message,
    status_code=200,
    summary="Revoke one of your sessions",
    description="Revokes only a session owned by the authenticated user.",
    responses={404: {"description": "Session not found"}},
)
async def revoke_security_session(
    *, session: SessionDep, current_user: CurrentUser, session_id: uuid.UUID
) -> Message:
    await revoke_owned_session(session, current_user, session_id)
    return Message(message="Session revoked")
