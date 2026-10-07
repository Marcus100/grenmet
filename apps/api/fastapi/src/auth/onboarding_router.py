import uuid

from fastapi import APIRouter, Response
from starlette.requests import Request

from src.auth import onboarding
from src.auth.onboarding_schemas import (
    ActivationAccountCreate,
    ActivationConfirm,
    ActivationIssue,
    ActivationLink,
    OnboardingStatus,
)
from src.auth.schemas import UserPublic
from src.dependencies import CurrentUser, SessionDep
from src.models import Message
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
        403: {"description": "Superuser required"},
        409: {"description": "Account exists"},
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
        403: {"description": "Superuser required"},
        404: {"description": "Account not found"},
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
        400: {"description": "Identity confirmation required"},
        403: {"description": "Superuser required"},
        404: {"description": "Account not found"},
        409: {"description": "Use account recovery instead"},
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
        403: {"description": "Superuser required"},
        404: {"description": "Account not found"},
    },
)
async def revoke(
    *, session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> None:
    await onboarding.revoke_activation(session, current_user, user_id)


@router.post(
    "/activate",
    response_model=Message,
    status_code=200,
    operation_id="authConfirmActivation",
    summary="Activate an administrator-approved account",
    description="Public endpoint requires a valid single-use activation secret and a new password. Does not establish a session or verify email.",
    responses={400: {"description": "Invalid, expired or used activation"}},
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
