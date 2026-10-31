"""Two-factor authentication (TOTP) enrollment endpoints."""

from fastapi import APIRouter, HTTPException, status

from src.auth import service, totp
from src.auth.account_security import verify_factor
from src.auth.privileged_mfa import session_id_from_token
from src.auth.schemas import (
    TwoFactorCodeRequest,
    TwoFactorDisableRequest,
    TwoFactorSetupResponse,
    TwoFactorStatusPublic,
)
from src.dependencies import AccountUser, SessionDep, TokenDep
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED

router = APIRouter(prefix="/auth/users/me/security/2fa", tags=["2fa"])


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
    "until a code is confirmed via /auth/users/me/security/2fa/activate.",
    responses={**AUTHENTICATED},
)
async def twofa_setup(
    *, session: SessionDep, current_user: AccountUser
) -> TwoFactorSetupResponse:
    secret = await service.begin_totp_setup(session=session, user=current_user)
    return TwoFactorSetupResponse(
        secret=secret,
        provisioning_uri=totp.provisioning_uri(
            secret=secret, account_name=current_user.email
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
        }
    },
    description="Confirms a TOTP code and enables two-factor authentication for the current account.",
)
async def twofa_activate(
    *,
    session: SessionDep,
    current_user: AccountUser,
    token: TokenDep,
    payload: TwoFactorCodeRequest,
) -> TwoFactorStatusPublic:
    ok = await service.activate_totp(
        session=session,
        user=current_user,
        code=payload.code,
        keep_session_id=session_id_from_token(token),
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired 2FA code",
        )
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
        }
    },
)
async def twofa_disable(
    *, session: SessionDep, current_user: AccountUser, payload: TwoFactorDisableRequest
) -> TwoFactorStatusPublic:
    verified = await service.authenticate(
        session=session, email=current_user.email, password=payload.password
    )
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password"
        )
    if not await verify_factor(session, current_user, payload.code):
        raise HTTPException(
            status_code=400, detail="Authenticator or recovery code was not accepted"
        )
    current_user.mfa_recovery_hashes = []
    await service.disable_totp(session=session, user=current_user)
    return TwoFactorStatusPublic(enabled=False)
