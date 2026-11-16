"""Two-factor authentication (TOTP) enrollment endpoints."""

from fastapi import APIRouter, Request, status

from src.auth import service, totp
from src.auth.account_security import verify_factor
from src.auth.privileged_mfa import session_id_from_token
from src.auth.schemas import (
    TwoFactorCodeRequest,
    TwoFactorDisableRequest,
    TwoFactorSetupResponse,
    TwoFactorStatusPublic,
)
from src.dependencies import AccountUser, RateLimitedAccountUser, SessionDep, TokenDep
from src.exceptions import AppException
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED, RateLimitedBody
from src.rate_limit import account_address, limiter

router = APIRouter(prefix="/auth/users/me/security/2fa", tags=["2fa"])

#: Mail-sending and code checks, per account. Setup mails a code to privileged
#: accounts (5 a minute, like email-code start); activation checks a code (10, like
#: email-code verify); disable checks a password and a code (5, like recovery codes).
SETUP_LIMIT = "5/minute"
ACTIVATE_LIMIT = "10/minute"
DISABLE_LIMIT = "5/minute"


@router.get(
    "",
    response_model=TwoFactorStatusPublic,
    summary="Get 2FA status",
    description="Returns whether two-factor authentication is enabled for the current account.",
    responses={**AUTHENTICATED},
)
async def twofa_status(*, current_user: AccountUser) -> TwoFactorStatusPublic:
    return TwoFactorStatusPublic(enabled=current_user.totp_enabled)


@router.post(
    "/setup",
    response_model=TwoFactorSetupResponse,
    summary="Begin 2FA enrollment",
    description="Generate a new TOTP secret and provisioning URI. 2FA is not active "
    "until a code is confirmed via /auth/users/me/security/2fa/activate. For a "
    "privileged account a one-time code is emailed to the account, and activation "
    "needs it as email_code (email_code_required is true).",
    responses={
        **AUTHENTICATED,
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": RateLimitedBody,
            "description": "Too many attempts; try again later",
        },
    },
)
@limiter.limit(SETUP_LIMIT, key_func=account_address)
async def twofa_setup(
    *,
    request: Request,
    session: SessionDep,
    current_user: RateLimitedAccountUser,
    token: TokenDep,
) -> TwoFactorSetupResponse:
    _ = request  # the rate limiter reads it
    keep_session_id = session_id_from_token(token)
    secret = await service.begin_totp_setup(
        session=session, user=current_user, keep_session_id=keep_session_id
    )
    return TwoFactorSetupResponse(
        secret=secret,
        provisioning_uri=totp.provisioning_uri(
            secret=secret, account_name=current_user.email
        ),
        email_code_required=await service.enrolment_needs_email_code(
            session=session, user=current_user, keep_session_id=keep_session_id
        ),
    )


@router.post(
    "/activate",
    response_model=TwoFactorStatusPublic,
    summary="Activate 2FA",
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid or expired code",
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": RateLimitedBody,
            "description": "Too many attempts; try again later",
        },
    },
    description="Confirms a TOTP code and enables two-factor authentication for the current account. "
    "The first authenticator of a privileged account also needs email_code, the code emailed when setup began.",
)
@limiter.limit(ACTIVATE_LIMIT, key_func=account_address)
async def twofa_activate(
    *,
    request: Request,
    session: SessionDep,
    current_user: RateLimitedAccountUser,
    token: TokenDep,
    payload: TwoFactorCodeRequest,
) -> TwoFactorStatusPublic:
    _ = request  # the rate limiter reads it
    ok = await service.activate_totp(
        session=session,
        user=current_user,
        code=payload.code,
        keep_session_id=session_id_from_token(token),
        email_code=payload.email_code,
    )
    if not ok:
        raise AppException("Invalid or expired 2FA code", status.HTTP_400_BAD_REQUEST)
    return TwoFactorStatusPublic(enabled=True)


@router.post(
    "/disable",
    response_model=TwoFactorStatusPublic,
    summary="Disable 2FA",
    description="Disable 2FA after confirming the account password.",
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Incorrect password",
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": RateLimitedBody,
            "description": "Too many attempts; try again later",
        },
    },
)
@limiter.limit(DISABLE_LIMIT, key_func=account_address)
async def twofa_disable(
    *,
    request: Request,
    session: SessionDep,
    current_user: RateLimitedAccountUser,
    payload: TwoFactorDisableRequest,
) -> TwoFactorStatusPublic:
    _ = request  # the rate limiter reads it
    verified = await service.authenticate(
        session=session, email=current_user.email, password=payload.password
    )
    if not verified:
        raise AppException("Incorrect password", status.HTTP_400_BAD_REQUEST)
    if not await verify_factor(session, current_user, payload.code):
        raise AppException("Authenticator or recovery code was not accepted", 400)
    current_user.mfa_recovery_hashes = []
    await service.disable_totp(session=session, user=current_user)
    return TwoFactorStatusPublic(enabled=False)
