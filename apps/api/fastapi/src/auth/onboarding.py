"""Administrator-mediated activation; never asserts ownership of an email inbox.

Challenges reuse the shared hashed, expiring, transaction-locked token store.
App readiness is calculated by the same policy functions used at sign-in.
"""

import secrets
import uuid
from datetime import timedelta
from urllib.parse import urlencode

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.audit import service as audit
from src.auth import modern_service, service, totp
from src.auth.config import auth_settings
from src.auth.models import Session as LoginSession
from src.auth.models import User
from src.auth.modern_models import AuthChallenge
from src.auth.onboarding_schemas import (
    AccessBlocker,
    ActivationAccountCreate,
    ActivationConfirm,
    ActivationLink,
    AppAccessStatus,
    OnboardingStatus,
)
from src.auth.utils import get_password_hash_async
from src.exceptions import AppException
from src.utils.datetime import utc_now

PURPOSE = "staff_activation"
LIFETIME_MINUTES = 30


def require_administrator(actor: User) -> None:
    if not actor.is_superuser:
        raise AppException("Only a superuser can approve account activation", 403)


async def target_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.scalar(
        select(User).where(User.id == user_id).with_for_update()
    )
    if user is None:
        raise AppException("Account not found", 404)
    return user


def can_activate(user: User) -> bool:
    # This is onboarding, not a bypass for recovery of established or privileged accounts.
    return bool(
        user.is_active
        and not user.is_superuser
        and (user.password_setup_pending or user.email_verified_at is None)
    )


async def record(
    session: AsyncSession, actor_id: uuid.UUID, user_id: uuid.UUID, action: str
) -> None:
    audit.set_actor(session, actor_id)
    await audit.record_change(
        session,
        entity_type="account",
        entity_id=str(user_id),
        record_type="account_activation",
        record_id=str(user_id),
        action=action,
        changes={"activation": (None, action)},
    )


async def create_account(
    session: AsyncSession, actor: User, body: ActivationAccountCreate
) -> User:
    require_administrator(actor)
    if await session.scalar(
        select(User.id).where(
            (User.email == body.email) | (User.username == body.username)
        )
    ):
        raise AppException("An account already uses that email or username", 409)
    user = User(
        **body.model_dump(),
        hashed_password=await get_password_hash_async(secrets.token_urlsafe(48)),
        password_setup_pending=True,
        email_verification_required=True,
        registration_pending=False,
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.flush()
    await record(session, actor.id, user.id, "created")
    await session.commit()
    await session.refresh(user)
    return user


async def issue_activation(
    session: AsyncSession, actor: User, user_id: uuid.UUID, confirmed: bool
) -> ActivationLink:
    require_administrator(actor)
    if not confirmed:
        raise AppException("Confirm the person's identity before issuing a link", 400)
    user = await target_user(session, user_id)
    if not can_activate(user):
        raise AppException(
            "Use account recovery for established accounts; inactive and superuser accounts cannot be activated here",
            409,
        )
    await session.execute(
        delete(AuthChallenge).where(
            AuthChallenge.user_id == user.id, AuthChallenge.purpose == PURPOSE
        )
    )
    token = await modern_service.issue(
        session,
        PURPOSE,
        user_id=user.id,
        data={
            "email": user.email,
            "credential": modern_service.digest(user.hashed_password),
            "actor_id": str(actor.id),
        },
        minutes=LIFETIME_MINUTES,
    )
    expires = await session.scalar(
        select(AuthChallenge.expires_at).where(
            AuthChallenge.token_hash == modern_service.digest(token)
        )
    )
    await record(session, actor.id, user.id, "issued")
    await session.commit()
    return ActivationLink(
        activation_url=f"{auth_settings.AUTH_FRONTEND_URL.rstrip('/')}/activate#{urlencode({'token': token})}",
        expires_at=expires or utc_now() + timedelta(minutes=LIFETIME_MINUTES),
    )


async def revoke_activation(
    session: AsyncSession, actor: User, user_id: uuid.UUID
) -> None:
    require_administrator(actor)
    await target_user(session, user_id)
    await session.execute(
        delete(AuthChallenge).where(
            AuthChallenge.user_id == user_id, AuthChallenge.purpose == PURPOSE
        )
    )
    await record(session, actor.id, user_id, "revoked")
    await session.commit()


async def confirm_activation(session: AsyncSession, body: ActivationConfirm) -> None:
    # Lock the account before its challenge, matching issuance/revocation lock order.
    user_id = await session.scalar(
        select(AuthChallenge.user_id).where(
            AuthChallenge.token_hash == modern_service.digest(body.token),
            AuthChallenge.purpose == PURPOSE,
        )
    )
    if user_id is None:
        raise AppException(
            "Activation link expired or already used. Ask your administrator for a new link.",
            400,
        )
    user = await target_user(session, user_id)
    challenge = await modern_service.consume(session, body.token, PURPOSE)
    issuer = await session.get(User, uuid.UUID(challenge.data["actor_id"]))
    if (
        not can_activate(user)
        or not issuer
        or not issuer.is_active
        or not issuer.is_superuser
        or user.email != challenge.data.get("email")
        or modern_service.digest(user.hashed_password)
        != challenge.data.get("credential")
    ):
        raise AppException(
            "This activation is no longer valid. Ask your administrator for a new link.",
            400,
        )
    user.hashed_password = await get_password_hash_async(body.new_password)
    user.password_changed_at = utc_now()
    user.password_setup_pending = False
    user.email_verification_required = False
    # No change to email_verified_at, staff approval, app grants, roles, or MFA.
    await session.execute(delete(AuthChallenge).where(AuthChallenge.user_id == user.id))
    await session.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    await record(session, user.id, user.id, "activated")
    session.add(user)
    await session.commit()


async def status(
    session: AsyncSession, actor: User, user_id: uuid.UUID
) -> OnboardingStatus:
    require_administrator(actor)
    user = await target_user(session, user_id)
    common: list[AccessBlocker] = []
    if not user.is_active:
        common.append(AccessBlocker.INACTIVE)
    if user.password_setup_pending and user.email_verified_at is None:
        common.append(AccessBlocker.PASSWORD_SETUP)
    if user.email_verification_required and user.email_verified_at is None:
        common.append(AccessBlocker.EMAIL_VERIFICATION)
    requires_mfa = auth_settings.AUTH_PRIVILEGED_MFA_MODE == "enforce" and (
        user.is_superuser
        or await service.has_effective_permission(
            session=session, user=user, permission_key="user.manage"
        )
    )
    if requires_mfa and not (user.totp_enabled and totp.is_encrypted(user.totp_secret)):
        common.append(AccessBlocker.MFA_ENROLMENT)
    staff = [*common]
    if user.registration_pending:
        staff.append(AccessBlocker.STAFF_APPROVAL)
    cms = [*common]
    if (
        not service.cms_identity_ready(user)
        and AccessBlocker.EMAIL_VERIFICATION not in cms
    ):
        cms.append(AccessBlocker.EMAIL_VERIFICATION)
    if not user.is_superuser and user.cms_access not in {"writer", "publisher"}:
        cms.append(AccessBlocker.CMS_GRANT)
    pending = await session.scalar(
        select(AuthChallenge.token_hash).where(
            AuthChallenge.user_id == user_id,
            AuthChallenge.purpose == PURPOSE,
            AuthChallenge.expires_at > utc_now(),
        )
    )
    return OnboardingStatus(
        user_id=user_id,
        email_verified=user.email_verified_at is not None,
        password_setup_pending=user.password_setup_pending,
        activation_pending=pending is not None,
        can_issue_activation=can_activate(user),
        apps=[
            AppAccessStatus(
                app="gaa-admin",
                label="GAA Admin",
                available=service.is_staff_eligible(user)
                and AccessBlocker.MFA_ENROLMENT not in staff,
                requires_mfa_sign_in=requires_mfa,
                blockers=staff,
            ),
            AppAccessStatus(
                app="cms",
                label="GMS content",
                available=await service.is_eligible_for_app(
                    session=session, user=user, app_key="cms"
                )
                and AccessBlocker.MFA_ENROLMENT not in cms,
                requires_mfa_sign_in=requires_mfa,
                blockers=cms,
            ),
        ],
    )


async def _can_read_history(session: AsyncSession, actor: User, entity_id: str) -> bool:
    _ = session
    return actor.is_superuser or str(actor.id) == entity_id


registry.register_entity("account", _can_read_history)
