"""Administrator-issued sign-in setup: a one-use link lets the person choose a password.

For people who cannot receive email codes (no live mailbox, or an unverified or wrong
address). The administrator holds ``user.manage`` in scope and an MFA-verified session.
The link is hashed, expires after ``LIFETIME_HOURS``, is bound to the account's current
password fingerprint and is spent on first use. Confirming it never verifies email,
never changes ``email_verification_required``, and never grants roles, memberships or
app access. It does sign the account out everywhere: sessions, Google links, remembered
devices and API keys the account created are revoked, the same clean-up as the squatting
retirement. The authenticator and recovery codes are kept.

Privilege ceiling: a manager (not a superuser) may only set up ordinary accounts whose
live permissions they already hold. Anyone privileged, holding ``user.manage``, holding
a department-manager-or-above role, or holding a permission the manager lacks needs a
superuser. Privileged accounts without an authenticator are refused to non-superusers,
which blocks the takeover-then-enrol path.

Quiet takeover guard: the link is for accounts with a delivery problem (email not
verified, or password setup pending). Otherwise the administrator must state a reason.
Both the person's address on file and nothing else receive a courtesy notice when a
link is issued and when it is completed. The notice carries no link.

Audit rows hold ids, the action, the expiry and the stated reason. The reason is marked
sensitive, so readers without ``audit.view_sensitive`` see it masked. Logs never carry the
reason, a link, a password or an address.

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
from src.auth import app_service, assignments, modern_service, privileged_mfa, totp
from src.auth.config import auth_settings
from src.auth.models import Role, User
from src.auth.modern_models import AuthChallenge
from src.auth.onboarding_schemas import ActivationConfirm, ActivationLink
from src.auth.utils import get_password_hash_async
from src.exceptions import AppException
from src.notifications import service as notification_service
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

PURPOSE = "sign_in_setup"
# Config constant: a sign-in setup link works for 24 hours, once.
LIFETIME_HOURS = 24
# Fragment marker so the public page can use sign-in-setup wording.
FRAGMENT_PURPOSE = "sign-in-setup"
# Issuance counters are read from audit rows over this window.
RATE_WINDOW = timedelta(hours=1)
ISSUE_LIMIT_PER_ADMIN = 20
ISSUE_LIMIT_PER_TARGET = 5
MANAGE_PERMISSION = "user.manage"
# Department-manager-or-above roles: setting these up is a superuser decision.
MANAGER_ROLE_NAMES = frozenset(
    {
        "department-manager",
        "department-assistant-manager",
        "hr-supervisor",
        "hr-admin",
    }
)
REASON_MIN = 3
# A verified mailbox means the person can already be reached by code, so the link needs a real reason.
REASON_MIN_VERIFIED = 10

_INVALID_LINK = (
    "This sign-in link is no longer valid. Ask your administrator for a new link."
)
_ACCOUNT_NOT_FOUND = "Account not found"
_SUPERUSER_ONLY = "Only a superuser can set up sign-in for this account"
_ISSUE_NOTICE_SUBJECT = "A sign-in link was set up for your account"
_ISSUE_NOTICE_HTML = (
    "<p>An administrator set up a sign-in link for your account. "
    "If you did not expect this, contact your administrator.</p>"
)
_DONE_NOTICE_SUBJECT = "Your sign-in password was set up"
_DONE_NOTICE_HTML = (
    "<p>A sign-in password was set up for your account. "
    "If this was not you, contact your administrator straight away.</p>"
)


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


async def _live_permissions(
    session: AsyncSession, user: User
) -> tuple[set[str], set[str]]:
    """Role names and permission keys of the user's live (effective) roles."""
    from src.auth import access

    role_ids = {role.id for role in await access.effective_roles(session, user)}
    if not role_ids:
        return set(), set()
    roles = (
        (
            await session.execute(
                select(Role)
                .where(Role.id.in_(role_ids))
                .options(selectinload(Role.permissions))
            )
        )
        .scalars()
        .unique()
        .all()
    )
    names = {role.name for role in roles}
    keys = {perm.key.lower() for role in roles for perm in role.permissions}
    return names, keys


async def _privilege_ceiling(session: AsyncSession, actor: User, target: User) -> None:
    """Refuse a manager (not a superuser) who would set up a more privileged account."""
    if actor.is_superuser:
        return
    privileged = await privileged_mfa.is_privileged(session, target)
    if privileged and not (
        target.totp_enabled and totp.is_encrypted(target.totp_secret)
    ):
        # Blocks setting up a privileged password and then enrolling a new authenticator.
        raise AppException(
            "Privileged accounts without an authenticator can only be set up by a superuser",
            403,
        )
    target_names, target_keys = await _live_permissions(session, target)
    _, actor_keys = await _live_permissions(session, actor)
    if (
        privileged
        or MANAGE_PERMISSION in target_keys
        or target_names & MANAGER_ROLE_NAMES
        or target_keys - actor_keys
    ):
        raise AppException(_SUPERUSER_ONLY, 403)


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
    await _privilege_ceiling(session, actor, target)
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


def _has_delivery_problem(target: User) -> bool:
    return target.email_verified_at is None or bool(target.password_setup_pending)


async def _audit(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID,
    target_id: uuid.UUID,
    action: str,
    changes: dict[str, tuple[object, object]],
    sensitive: frozenset[str] = frozenset(),
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
        sensitive=sensitive,
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


async def _lock_in_id_order(session: AsyncSession, *user_ids: uuid.UUID) -> None:
    """Row-lock the given accounts one at a time, in ascending id order.

    Two administrators issuing links for each other take the same two locks in the
    same order, so neither waits on a lock the other already holds (#984). The
    issuer's row stays locked until commit, which serialises the hourly per-admin
    count so it cannot be raced.
    """
    for user_id in sorted(set(user_ids)):
        await session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
        )


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


def _notify(session: AsyncSession, target: User, subject: str, html: str) -> None:
    """Courtesy notice to the address on file. Carries no link."""
    notification_service.enqueue_email(
        session=session,
        to_email=target.email,
        subject=subject,
        transactional=True,
        html=html,
    )


async def issue(
    session: AsyncSession,
    actor: User,
    user_id: uuid.UUID,
    identity_confirmed: bool,
    reason: str | None = None,
) -> ActivationLink:
    """Issue a one-use link for ``user_id``, replacing any earlier sign-in link."""
    if not identity_confirmed:
        raise AppException("Confirm the person's identity before issuing a link", 400)
    await _lock_in_id_order(session, actor.id, user_id)
    target = await _in_scope(session, actor, user_id)
    await _check_eligible(session, actor, target)
    delivery_problem = _has_delivery_problem(target)
    if not delivery_problem and (reason is None or len(reason) < REASON_MIN_VERIFIED):
        raise AppException(
            f"Give a reason of at least {REASON_MIN_VERIFIED} characters: this "
            "person's email is verified, so sign-in setup needs one",
            422,
        )
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
    changes: dict[str, tuple[object, object]] = {
        "expires_at": (None, expires.isoformat() if expires else None),
        "delivery_problem": (None, delivery_problem),
    }
    if reason is not None:
        changes["reason"] = (None, reason)
    await _audit(
        session,
        actor_id=actor.id,
        target_id=target.id,
        action="issued",
        changes=changes,
        sensitive=frozenset({"reason"}),
    )
    _notify(session, target, _ISSUE_NOTICE_SUBJECT, _ISSUE_NOTICE_HTML)
    await session.commit()
    return ActivationLink(
        activation_url=(
            f"{auth_settings.AUTH_FRONTEND_URL.rstrip('/')}/activate"
            f"#{urlencode({'token': token, 'purpose': FRAGMENT_PURPOSE})}"
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
        # The issuer's authority, the privilege ceiling and the account's state are re-checked now.
        await _in_scope(session, issuer, user.id)
        await _check_eligible(session, issuer, user)
    except AppException:
        raise AppException(_INVALID_LINK, 400) from None
    user.hashed_password = await get_password_hash_async(body.new_password)
    user.password_changed_at = utc_now()
    user.password_setup_pending = False
    # Email verification flags, roles, memberships, app grants and the authenticator
    # are untouched. Sessions, Google links, remembered devices and API keys go, as in
    # the squatting retirement (#984).
    await session.execute(delete(AuthChallenge).where(AuthChallenge.user_id == user.id))
    await app_service.revoke_access_material(session, user)
    session.add(user)
    await _audit(
        session,
        actor_id=user.id,
        target_id=user.id,
        action="completed",
        changes={"completed": (None, True)},
    )
    _notify(session, user, _DONE_NOTICE_SUBJECT, _DONE_NOTICE_HTML)
    await session.commit()
