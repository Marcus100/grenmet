"""Two-factor authentication (TOTP) enrollment endpoints."""

from fastapi import APIRouter, HTTPException, status

from src.auth import service, totp
from src.auth.schemas import (
    TwoFactorCodeRequest,
    TwoFactorDisableRequest,
    TwoFactorSetupResponse,
    TwoFactorStatusPublic,
)
from src.dependencies import CurrentUser, SessionDep

router = APIRouter(prefix="/2fa", tags=["2fa"])


@router.get("/status", response_model=TwoFactorStatusPublic, summary="Get 2FA status")
async def twofa_status(*, current_user: CurrentUser) -> TwoFactorStatusPublic:
    return TwoFactorStatusPublic(enabled=current_user.totp_enabled)


@router.post(
    "/setup",
    response_model=TwoFactorSetupResponse,
    summary="Begin 2FA enrollment",
    description="Generate a new TOTP secret and provisioning URI. 2FA is not active "
    "until a code is confirmed via /2fa/activate.",
)
async def twofa_setup(
    *, session: SessionDep, current_user: CurrentUser
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
    responses={status.HTTP_400_BAD_REQUEST: {"description": "Invalid or expired code"}},
)
async def twofa_activate(
    *, session: SessionDep, current_user: CurrentUser, payload: TwoFactorCodeRequest
) -> TwoFactorStatusPublic:
    ok = await service.activate_totp(
        session=session, user=current_user, code=payload.code
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
    responses={status.HTTP_400_BAD_REQUEST: {"description": "Incorrect password"}},
)
async def twofa_disable(
    *, session: SessionDep, current_user: CurrentUser, payload: TwoFactorDisableRequest
) -> TwoFactorStatusPublic:
    verified = await service.authenticate(
        session=session, email=current_user.email, password=payload.password
    )
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password"
        )
    await service.disable_totp(session=session, user=current_user)
    return TwoFactorStatusPublic(enabled=False)
