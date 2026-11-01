import uuid

from fastapi import APIRouter, Response
from starlette.requests import Request

from src.auth import onboarding, sign_in_setup
from src.auth.onboarding_schemas import (
    ActivationAccountCreate,
    ActivationConfirm,
    ActivationIssue,
    ActivationLink,
    AdminActivation,
    OnboardingStatus,
    SignInSetupIssue,
    SuperuserActionReason,
    VerificationResend,
)
from src.auth.schemas import UserPublic
from src.dependencies import CurrentUser, MfaAdminUser, MfaUserManager, SessionDep
from src.models import ApiError, Message
from src.rate_limit import limiter

router = APIRouter(prefix="/auth/onboarding", tags=["onboarding"])


@router.post(
    "/accounts",
    response_model=UserPublic,
    status_code=201,
    operation_id="authCreateOnboardingAccount",
    summary="Create an account for activation",
    description="Superuser creates an account without choosing or sharing its password. Does not grant app roles.",
    responses={
        403: {"model": ApiError, "description": "Superuser required"},
        409: {"model": ApiError, "description": "Account exists"},
    },
)
async def create_account(
    *, session: SessionDep, current_user: CurrentUser, body: ActivationAccountCreate
) -> UserPublic:
    user = await onboarding.create_account(session, current_user, body)
    return UserPublic.model_validate(user, from_attributes=True)


@router.get(
    "/{user_id}",
    response_model=OnboardingStatus,
    status_code=200,
    operation_id="authGetOnboardingStatus",
    summary="Explain account and app readiness",
    description="Superuser view of account activation and staff/CMS access blockers. Domain workflow readiness remains domain-owned.",
    responses={
        403: {"model": ApiError, "description": "Superuser required"},
        404: {"model": ApiError, "description": "Account not found"},
    },
)
async def status(
    *, session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> OnboardingStatus:
    return await onboarding.status(session, current_user, user_id)


@router.post(
    "/{user_id}/activation",
    response_model=ActivationLink,
    status_code=201,
    operation_id="authIssueActivation",
    summary="Issue a one-use activation link",
    description="Superuser confirms identity and delivers a 30-minute link directly. Replaces previous activation links. Never verifies email or grants roles.",
    responses={
        400: {"model": ApiError, "description": "Identity confirmation required"},
        403: {"model": ApiError, "description": "Superuser required"},
        404: {"model": ApiError, "description": "Account not found"},
        409: {"model": ApiError, "description": "Use account recovery instead"},
    },
)
@limiter.limit("5/minute")
async def issue(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    current_user: CurrentUser,
    user_id: uuid.UUID,
    body: ActivationIssue,
) -> ActivationLink:
    _ = request
    response.headers["Cache-Control"] = "no-store"
    return await onboarding.issue_activation(
        session, current_user, user_id, body.identity_confirmed
    )


@router.delete(
    "/{user_id}/activation",
    status_code=204,
    operation_id="authRevokeActivation",
    summary="Revoke an activation link",
    description="Superuser invalidates outstanding activation links for an account.",
    responses={
        403: {"model": ApiError, "description": "Superuser required"},
        404: {"model": ApiError, "description": "Account not found"},
    },
)
async def revoke(
    *, session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> None:
    await onboarding.revoke_activation(session, current_user, user_id)


@router.post(
    "/{user_id}/sign-in-setup",
    response_model=ActivationLink,
    status_code=201,
    operation_id="authIssueSignInSetup",
    summary="Issue a one-use sign-in setup link",
    description=(
        "Manager with `user.manage` in scope (or a superuser) and an MFA-verified session "
        "issues a 24-hour one-use link. The person opens it and chooses a password; the "
        "administrator never sees the password. Replaces earlier sign-in links. Never "
        "verifies email, grants roles or app access. Refused for the caller's own account, "
        "for owners unless the caller is a superuser, and for inactive or ended-employment "
        "accounts. A reason (3 to 500 characters) is required unless the email is unverified or "
        "password setup is pending. A courtesy notice goes to the address on file. Only a superuser "
        "can set up privileged accounts. Rate limited per administrator and per account."
    ),
    responses={
        400: {
            "model": ApiError,
            "description": "Identity confirmation or reason required",
        },
        403: {
            "model": ApiError,
            "description": "Insufficient permission, MFA session required, own account, owner, or privileged account (superuser required)",
        },
        404: {
            "model": ApiError,
            "description": "Account not found or outside your scope",
        },
        409: {"model": ApiError, "description": "Inactive account or ended employment"},
        429: {"model": ApiError, "description": "Too many links issued recently"},
    },
)
@limiter.limit("10/minute")
async def issue_sign_in_setup(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    manager: MfaUserManager,
    user_id: uuid.UUID,
    body: SignInSetupIssue,
) -> ActivationLink:
    _ = request
    response.headers["Cache-Control"] = "no-store"
    return await sign_in_setup.issue(
        session, manager, user_id, body.identity_confirmed, body.reason
    )


@router.delete(
    "/{user_id}/sign-in-setup",
    status_code=204,
    operation_id="authRevokeSignInSetup",
    summary="Revoke a sign-in setup link",
    description="Manager with `user.manage` in scope and an MFA-verified session cancels outstanding sign-in setup links for an account.",
    responses={
        403: {
            "model": ApiError,
            "description": "Insufficient permission or MFA session required",
        },
        404: {
            "model": ApiError,
            "description": "Account not found or outside your scope",
        },
    },
)
async def revoke_sign_in_setup(
    *, session: SessionDep, manager: MfaUserManager, user_id: uuid.UUID
) -> None:
    await sign_in_setup.revoke(session, manager, user_id)


@router.post(
    "/{user_id}/admin-activate",
    response_model=OnboardingStatus,
    status_code=200,
    operation_id="authAdminActivateAccount",
    summary="Vouch for an account (roles and memberships only)",
    description=(
        "Superuser with an enrolled authenticator vouches for an existing account "
        "whose email cannot be verified. Unlocks staff roles and owner/admin "
        "memberships (`require_verified_or_admin_activated`); does not set "
        "`email_verified_at` and does not clear the strict deposit and "
        "organiser-request gate. A reason is required and audited. Idempotent. "
        "Body also carries `expected_email`, which must match the account's address (409 otherwise) and is stored in the audit entry. Inactive and superuser accounts are refused (409)."
    ),
    responses={
        403: {
            "model": ApiError,
            "description": "Superuser with an authenticator required (superuser_mfa_required)",
        },
        404: {"model": ApiError, "description": "Account not found"},
        409: {"model": ApiError, "description": "Inactive or superuser account"},
    },
)
@limiter.limit("20/minute")
async def admin_activate(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    admin: MfaAdminUser,
    user_id: uuid.UUID,
    body: AdminActivation,
) -> OnboardingStatus:
    _ = request
    response.headers["Cache-Control"] = "no-store"
    return await onboarding.admin_activate(
        session, admin, user_id, body.reason, body.expected_email
    )


@router.post(
    "/{user_id}/resend-verification",
    response_model=VerificationResend,
    status_code=200,
    operation_id="authAdminResendVerification",
    summary="Send an existing account its verification email again",
    description=(
        "Superuser with an enrolled authenticator re-sends the verification link. "
        "Reports `delivered: false` when mail is not configured or fails. A "
        "reason is required and audited."
    ),
    responses={
        403: {
            "model": ApiError,
            "description": "Superuser with an authenticator required (superuser_mfa_required)",
        },
        404: {"model": ApiError, "description": "Account not found"},
        409: {"model": ApiError, "description": "Inactive account"},
    },
)
@limiter.limit("5/minute")
async def resend_verification(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    admin: MfaAdminUser,
    user_id: uuid.UUID,
    body: SuperuserActionReason,
) -> VerificationResend:
    response.headers["Cache-Control"] = "no-store"
    return await onboarding.resend_verification(
        request, session, admin, user_id, body.reason
    )


@router.post(
    "/activate",
    response_model=Message,
    status_code=200,
    operation_id="authConfirmActivation",
    summary="Activate an administrator-approved account",
    description="Public endpoint requires a valid single-use activation secret and a new password. Does not establish a session or verify email.",
    responses={
        400: {"model": ApiError, "description": "Invalid, expired or used activation"}
    },
)
@limiter.limit("5/minute")
async def confirm(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    body: ActivationConfirm,
) -> Message:
    _ = request
    response.headers["Cache-Control"] = "no-store"
    await onboarding.confirm_activation(session, body)
    return Message(message="Account activated. Sign in with your new password.")
