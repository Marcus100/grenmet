import uuid

from fastapi import APIRouter
from starlette.requests import Request

from src.auth import app_service
from src.auth import modern_service as service
from src.auth import superuser_invitation as invitations
from src.auth.account_security import new_recovery_codes, revoke_owned_session
from src.auth.app_schemas import AccountEmailCodeStart, AppEmailCodeVerify
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
from src.auth.superuser_invitation_schemas import (
    SuperuserInvitationAccept,
    SuperuserInvitationCodeVerify,
    SuperuserInvitationCreate,
    SuperuserInvitationPublic,
)
from src.dependencies import AccountUser, SessionDep, TokenDep
from src.models import ApiError, Message
from src.openapi_responses import RateLimitedBody
from src.rate_limit import limiter, mail_limit_address
from src.turnstile import auth_turnstile_policy, require_turnstile

router = APIRouter(prefix="/auth", tags=["modern-auth"])


@router.post(
    "/password/setup",
    response_model=Message,
    summary="Request verified password setup",
    status_code=200,
    description="Request verified password setup. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"model": ApiError, "description": "Invalid or expired proof"},
        403: {"model": ApiError, "description": "Account is not eligible"},
    },
)
@limiter.limit("5/minute")
async def email_request(
    *, request: Request, session: SessionDep, body: EmailRequest
) -> Message:
    return await service.email_request(request=request, session=session, body=body)


@router.post(
    "/password/setup/confirm",
    response_model=Message,
    summary="Verify email and establish password",
    status_code=200,
    description="Verify email and establish password. Intentionally public; proof of account ownership is required to establish a session.",
    responses={
        400: {"model": ApiError, "description": "Invalid or expired proof"},
        403: {"model": ApiError, "description": "Account is not eligible"},
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
        400: {"model": ApiError, "description": "Invalid or expired proof"},
        403: {"model": ApiError, "description": "Account is not eligible"},
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
        400: {"model": ApiError, "description": "Invalid or expired proof"},
        403: {"model": ApiError, "description": "Account is not eligible"},
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
        400: {"model": ApiError, "description": "Invalid or expired proof"},
        403: {"model": ApiError, "description": "Account is not eligible"},
    },
)
@limiter.limit("5/minute")
async def google_finish(
    *, request: Request, session: SessionDep, body: GoogleFinish
) -> SessionLoginResponse:
    return await service.google_finish(request=request, session=session, body=body)


@router.get(
    "/users/me/security",
    response_model=AccountSecurityPublic,
    status_code=200,
    summary="Read account security",
    description="Show verified sign-in methods and active sessions for the current account, without exposing session secrets.",
    responses={
        401: {"model": ApiError, "description": "Authentication required"},
        403: {"model": ApiError, "description": "Verify account email first"},
    },
)
async def read_account_security(
    *, session: SessionDep, current_user: AccountUser
) -> AccountSecurityPublic:
    return await service.account_security(session=session, user=current_user)


@router.post(
    "/users/me/security/recovery-codes",
    response_model=RecoveryCodesPublic,
    status_code=200,
    summary="Replace MFA recovery codes",
    description="Returns eight recovery codes once after confirming an authenticator code or an unused recovery code. The password is also required when the account has one; email-code accounts send none. Only hashes are stored.",
    responses={400: {"model": ApiError, "description": "Confirmation failed"}},
)
@limiter.limit("5/minute")
async def replace_recovery_codes(
    *,
    request: Request,
    session: SessionDep,
    current_user: AccountUser,
    body: SecurityProof,
) -> RecoveryCodesPublic:
    _ = request
    return RecoveryCodesPublic(
        codes=await new_recovery_codes(session, current_user, body.password, body.code)
    )


@router.delete(
    "/users/me/security/sessions/{session_id}",
    response_model=Message,
    status_code=200,
    summary="Revoke one of your sessions",
    description="Revokes only a session owned by the authenticated user.",
    responses={404: {"model": ApiError, "description": "Session not found"}},
)
async def revoke_security_session(
    *, session: SessionDep, current_user: AccountUser, session_id: uuid.UUID
) -> Message:
    await revoke_owned_session(session, current_user, session_id)
    return Message(message="Session revoked")


@router.post(
    "/email-code/start",
    response_model=Message,
    status_code=200,
    summary="Send a Barrels account sign-in code",
    description='Email a 6-digit code for signing in at auth.barrels.gd. The reply is the same for every address and never waits on mail. A request past the limits (one code per mailbox per minute, five per mailbox per hour, twenty per client per hour) gets the same reply and sends nothing. While the API has AUTH_TURNSTILE_SECRET_KEY set, a missing or rejected Cloudflare Turnstile token (turnstile_token) is 400 "Verification failed" for every address, before any lookup.',
    responses={
        400: {"model": ApiError, "description": "Turnstile verification failed"},
        429: {"model": RateLimitedBody, "description": "Rate limit exceeded"},
    },
)
@limiter.limit("5/minute")
async def account_email_code_start(
    *, request: Request, session: SessionDep, body: AccountEmailCodeStart
) -> Message:
    await require_turnstile(request, body.turnstile_token, auth_turnstile_policy())
    return await app_service.account_email_code_start(
        session=session, body=body, client_ip=mail_limit_address(request)
    )


@router.post(
    "/email-code/verify",
    response_model=SessionLoginResponse,
    status_code=200,
    summary="Sign in to the Barrels account with an email code",
    description="Verify the code and open an account session (ADR-0017); the first verified code creates the account when sign-up is open.",
    responses={
        400: {"model": ApiError, "description": "Wrong or expired code"},
        403: {"model": ApiError, "description": "Registration closed"},
        429: {"model": RateLimitedBody, "description": "Rate limit exceeded"},
    },
)
@limiter.limit("10/minute")
async def account_email_code_verify(
    *, request: Request, session: SessionDep, body: AppEmailCodeVerify
) -> SessionLoginResponse:
    return await app_service.account_email_code_verify(
        request=request, session=session, body=body
    )


@router.post(
    "/superuser-invitations",
    response_model=SuperuserInvitationPublic,
    status_code=201,
    summary="Invite a Barrels superuser",
    description="Superuser only, with an authenticator and a two-step sign-in. Emails a single-use link that works for 24 hours. The invitee must prove the address with an emailed code. The reason (10 to 500 characters) is written to the audit log. The token is never returned.",
    responses={
        400: {"model": ApiError, "description": "Address cannot be invited"},
        403: {"model": ApiError, "description": "Superuser two-step sign-in required"},
        422: {"model": ApiError, "description": "Reason missing or too short or long"},
        429: {"model": ApiError, "description": "Too many invitations"},
    },
)
async def create_superuser_invitation(
    *,
    session: SessionDep,
    current_user: AccountUser,
    token: TokenDep,
    body: SuperuserInvitationCreate,
) -> SuperuserInvitationPublic:
    await invitations.require_superuser_session(session, current_user, token=token)
    invitation = await invitations.create_invitation(
        session,
        inviter=current_user,
        email=str(body.email),
        reason=body.reason,
    )
    await session.commit()
    return SuperuserInvitationPublic.model_validate(invitation, from_attributes=True)


@router.get(
    "/superuser-invitations",
    response_model=list[SuperuserInvitationPublic],
    status_code=200,
    summary="List open superuser invitations",
    description="Superuser only, with a two-step sign-in. Lists invitations that are neither accepted, revoked nor expired (at most 100). Tokens are never listed.",
    responses={
        403: {"model": ApiError, "description": "Superuser two-step sign-in required"}
    },
)
async def list_superuser_invitations(
    *, session: SessionDep, current_user: AccountUser, token: TokenDep
) -> list[SuperuserInvitationPublic]:
    await invitations.require_superuser_session(session, current_user, token=token)
    rows = await invitations.list_pending(session)
    return [
        SuperuserInvitationPublic.model_validate(row, from_attributes=True)
        for row in rows
    ]


@router.post(
    "/superuser-invitations/{invitation_id}/revoke",
    response_model=SuperuserInvitationPublic,
    status_code=200,
    summary="Revoke a superuser invitation",
    description="Superuser only, with a two-step sign-in. An open invitation stops working at once. Accepted, revoked and unknown invitations are refused.",
    responses={
        403: {"model": ApiError, "description": "Superuser two-step sign-in required"},
        404: {"model": ApiError, "description": "Invitation not found"},
        409: {"model": ApiError, "description": "Invitation already closed"},
    },
)
async def revoke_superuser_invitation(
    *,
    session: SessionDep,
    current_user: AccountUser,
    token: TokenDep,
    invitation_id: uuid.UUID,
) -> SuperuserInvitationPublic:
    await invitations.require_superuser_session(session, current_user, token=token)
    row = await invitations.revoke_invitation(
        session, actor=current_user, invitation_id=invitation_id
    )
    await session.commit()
    return SuperuserInvitationPublic.model_validate(row, from_attributes=True)


@router.post(
    "/superuser-invitations/code",
    response_model=Message,
    status_code=200,
    summary="Email the invitee a sign-in code",
    description="Intentionally public: the token proves the invitation. Emails a six-digit code to the invited address, subject to the same limits as sign-in. The reply is the same whether or not the token is valid.",
    responses={429: {"model": RateLimitedBody, "description": "Rate limit exceeded"}},
)
@limiter.limit("5/minute")
async def superuser_invitation_code(
    *, request: Request, session: SessionDep, body: SuperuserInvitationAccept
) -> Message:
    message = await invitations.request_code(
        session, token=body.token, client_ip=mail_limit_address(request)
    )
    return Message(message=message)


@router.post(
    "/superuser-invitations/accept",
    response_model=SessionLoginResponse,
    status_code=200,
    summary="Accept a superuser invitation",
    description="Intentionally public: the token and the code emailed to the invited address are the proof. Grants superuser, clears the pending approval, audits the grant once and opens an account session. Single use; a wrong, expired, replayed or revoked invitation is refused with the same message.",
    responses={
        400: {"model": ApiError, "description": "Invitation or code not accepted"},
        429: {"model": RateLimitedBody, "description": "Rate limit exceeded"},
    },
)
@limiter.limit("10/minute")
async def accept_superuser_invitation(
    *, request: Request, session: SessionDep, body: SuperuserInvitationCodeVerify
) -> SessionLoginResponse:
    return await invitations.accept_invitation(
        session,
        request,
        token=body.token,
        code=body.code,
        totp_code=body.totp_code,
    )
