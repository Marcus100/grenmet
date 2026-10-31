"""Administrator-issued sign-in setup: a one-use link lets the person choose a password.

For people who cannot receive email codes (no live mailbox, or an unverified or wrong
address). The administrator holds ``user.manage`` in scope and an MFA-verified session;
the link is hashed, expires after 72 hours, is bound to the account's current password
fingerprint and is spent on first use. Confirming it never verifies email, never
changes ``email_verification_required``, and never grants roles, memberships or app
access. Audit rows hold ids, the action and the expiry only: never a link, password,
email address or reason text.

Challenges reuse the shared store in ``onboarding`` (purpose ``sign_in_setup``) and the
public ``/auth/onboarding/activate`` endpoint, which dispatches on purpose.
"""

import logging
import uuid
from datetime import timedelta
from urllib.parse import urlencode

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.audit import service as audit
from src.audit.models import AuditEntry
from src.auth import assignments, modern_service
from src.auth.config import auth_settings
from src.auth.models import Role, User
from src.auth.models import Session as LoginSession
from src.auth.modern_models import AuthChallenge
from src.auth.onboarding_schemas import ActivationConfirm, ActivationLink
from src.auth.utils import get_password_hash_async
from src.exceptions import AppException
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

PURPOSE = "sign_in_setup"
LIFETIME_HOURS = 72
# Issuance counters are read from audit rows over this window.
RATE_WINDOW = timedelta(hours=1)
ISSUE_LIMIT_PER_ADMIN = 20
ISSUE_LIMIT_PER_TARGET = 5

_INVALID_LINK = (
    "This sign-in link is no longer valid. Ask your administrator for a new link."
)
_ACCOUNT_NOT_FOUND = "Account not found"


async def _issuer(session: AsyncSession, issuer_id: uuid.UUID) -> User | None:
    # Roles and permissions are needed by the live scope check (no lazy loads under asyncpg).
    result = await session.execute(
        select(User)
        .where(User.id == issuer_id)
        .options(selectinload(User.roles).selectinload(Role.permissions))
    )
    return result.scalars().unique().one_or_none()


async def _locked_target(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await session.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    return result.scalar_one_or_none()


async def _in_scope(session: AsyncSession, actor: User, user_id: uuid.UUID) -> User:
    """The target account when ``actor`` may manage it; otherwise 404.

    Out-of-scope and unknown ids are indistinguishable, so cross-organisation
    ids never reveal that an account exists."""
    target = await _locked_target(session, user_id)
    if target is None:
        raise AppException(_ACCOUNT_NOT_FOUND, 404)
    if target.id == actor.id:
        raise AppException("Your own sign-in is managed in account security", 403)
    try:
        await assignments.require_user_management(session, actor, target)
    except AppException:
        raise AppException(_ACCOUNT_NOT_FOUND, 404) from None
    return target


async def _check_eligible(session: AsyncSession, actor: User, target: User) -> None:
    """Gates for issuing or confirming a link. Raises AppException on refusal."""
    from src.hr.models import EmploymentRecord, live_employment_clause
    from src.organisations.models import Membership, MembershipRole, MembershipStatus
    from src.utils.timezones import local_today

    if not actor.is_superuser:
        owner = await session.scalar(
            select(Membership.id).where(
                Membership.user_id == target.id,
                Membership.role == MembershipRole.OWNER.value,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
        if owner is not None:
            raise AppException(
                "Organisation owners can only be set up by a superuser", 403
            )
    if not target.is_active:
        raise AppException(
            "Account is inactive. Reactivate it before setting up sign-in.", 409
        )
    has_record = await session.scalar(
        select(EmploymentRecord.user_id)
        .where(EmploymentRecord.user_id == target.id)
        .limit(1)
    )
    if has_record is not None:
        live = await session.scalar(
            select(EmploymentRecord.user_id)
            .where(
                EmploymentRecord.user_id == target.id,
                live_employment_clause(local_today()),
            )
            .limit(1)
        )
        if live is None:
            raise AppException(
                "Employment has ended, so sign-in setup is not available", 409
            )


async def _audit(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID,
    target_id: uuid.UUID,
    action: str,
    changes: dict[str, tuple[object, object]],
) -> None:
    audit.set_actor(session, actor_id)
    await audit.record_change(
        session,
        entity_type="account",
        entity_id=str(target_id),
        record_type="sign_in_setup",
        record_id=str(target_id),
        action=action,
        changes=changes,
    )


async def _recent_issues(
    session: AsyncSession, *, actor_id: uuid.UUID | None, target_id: uuid.UUID | None
) -> int:
    statement = (
        select(func.count())
        .select_from(AuditEntry)
        .where(
            AuditEntry.record_type == "sign_in_setup",
            AuditEntry.action == "issued",
            AuditEntry.created_at >= utc_now() - RATE_WINDOW,
        )
    )
    if actor_id is not None:
        statement = statement.where(AuditEntry.actor_user_id == actor_id)
    if target_id is not None:
        statement = statement.where(AuditEntry.entity_id == str(target_id))
    return int(await session.scalar(statement) or 0)


async def _enforce_issue_limits(
    session: AsyncSession, actor: User, target: User
) -> None:
    if (
        await _recent_issues(session, actor_id=None, target_id=target.id)
        >= ISSUE_LIMIT_PER_TARGET
        or await _recent_issues(session, actor_id=actor.id, target_id=None)
        >= ISSUE_LIMIT_PER_ADMIN
    ):
        logger.warning(
            "Sign-in setup rate limit reached",
            extra={"actor_id": str(actor.id), "target_id": str(target.id)},
        )
        raise AppException(
            "Too many sign-in links were issued recently. Try again later.", 429
        )


async def issue(
    session: AsyncSession, actor: User, user_id: uuid.UUID, identity_confirmed: bool
) -> ActivationLink:
    """Issue a one-use link for ``user_id``, replacing any earlier sign-in link."""
    if not identity_confirmed:
        raise AppException("Confirm the person's identity before issuing a link", 400)
    target = await _in_scope(session, actor, user_id)
    await _check_eligible(session, actor, target)
    await _enforce_issue_limits(session, actor, target)
    await session.execute(
        delete(AuthChallenge).where(
            AuthChallenge.user_id == target.id, AuthChallenge.purpose == PURPOSE
        )
    )
    token = await modern_service.issue(
        session,
        PURPOSE,
        user_id=target.id,
        data={
            "email": target.email,
            "credential": modern_service.digest(target.hashed_password),
            "actor_id": str(actor.id),
        },
        minutes=LIFETIME_HOURS * 60,
    )
    expires = await session.scalar(
        select(AuthChallenge.expires_at).where(
            AuthChallenge.token_hash == modern_service.digest(token)
        )
    )
    await _audit(
        session,
        actor_id=actor.id,
        target_id=target.id,
        action="issued",
        changes={"expires_at": (None, expires.isoformat() if expires else None)},
    )
    await session.commit()
    return ActivationLink(
        activation_url=(
            f"{auth_settings.AUTH_FRONTEND_URL.rstrip('/')}/activate"
            f"#{urlencode({'token': token})}"
        ),
        expires_at=expires or utc_now() + timedelta(hours=LIFETIME_HOURS),
    )


async def revoke(session: AsyncSession, actor: User, user_id: uuid.UUID) -> None:
    target = await _in_scope(session, actor, user_id)
    await session.execute(
        delete(AuthChallenge).where(
            AuthChallenge.user_id == target.id, AuthChallenge.purpose == PURPOSE
        )
    )
    await _audit(
        session,
        actor_id=actor.id,
        target_id=target.id,
        action="revoked",
        changes={},
    )
    await session.commit()


async def confirm(session: AsyncSession, body: ActivationConfirm) -> None:
    """Spend the link and set the person's password. Every refusal is the same message."""
    user_id = await session.scalar(
        select(AuthChallenge.user_id).where(
            AuthChallenge.token_hash == modern_service.digest(body.token),
            AuthChallenge.purpose == PURPOSE,
        )
    )
    if user_id is None:
        raise AppException(_INVALID_LINK, 400)
    user = await _locked_target(session, user_id)
    if user is None:
        raise AppException(_INVALID_LINK, 400)
    challenge = await modern_service.consume(session, body.token, PURPOSE)
    issuer = await _issuer(session, uuid.UUID(challenge.data["actor_id"]))
    if (
        issuer is None
        or not issuer.is_active
        or user.email != challenge.data.get("email")
        or modern_service.digest(user.hashed_password)
        != challenge.data.get("credential")
    ):
        raise AppException(_INVALID_LINK, 400)
    try:
        # The issuer's authority and the account's state are checked again now.
        await _in_scope(session, issuer, user.id)
        await _check_eligible(session, issuer, user)
    except AppException:
        raise AppException(_INVALID_LINK, 400) from None
    user.hashed_password = await get_password_hash_async(body.new_password)
    user.password_changed_at = utc_now()
    user.password_setup_pending = False
    # Email verification flags, roles, memberships and app grants are untouched.
    await session.execute(delete(AuthChallenge).where(AuthChallenge.user_id == user.id))
    await session.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    session.add(user)
    await _audit(
        session,
        actor_id=user.id,
        target_id=user.id,
        action="completed",
        changes={"completed": (None, True)},
    )
    await session.commit()
