"""Superuser invitations and their one-visit acceptance (ADR-0059 rule 1).

Creating and revoking an invitation needs a superuser with an enrolled authenticator
and a two-step sign-in (``require_superuser_session``). Acceptance is open only to the
invited address: a six-digit code is emailed there through the existing email-code
store (purpose ``superuser-invite``, its own rate-limit bucket) and must be entered with
the token. The token alone grants nothing.

An invitation is only as good as its inviter: acceptance refuses one whose inviter is
no longer an active superuser, and offboarding closes the inviter's open invitations.
Every creation, acceptance and supersession is audited, and every active superuser is
told by email (no token and no reason in the mail). Removing superuser status is
``demote_superuser``; the generic user routes are the only other way to change it, and
they never grant it.
"""

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode

from fastapi import Request
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit
from src.auth import app_service, service
from src.auth.account_security import record_security
from src.auth.devices import remember_device, schedule_new_sign_in_alert
from src.auth.exceptions import LastSuperuserError
from src.auth.lockout import normalised_address
from src.auth.models import SuperuserInvitation, User
from src.auth.placeholders import is_placeholder_email
from src.auth.privileged_mfa import require_mfa_session
from src.auth.schemas import SessionLoginResponse, SessionPublic, SessionUserPublic
from src.auth.superuser_mfa import require_superuser_mfa
from src.auth.utils import get_password_hash_async
from src.config import settings
from src.email_config import email_settings
from src.exceptions import AppException
from src.notifications import service as notification_service
from src.rate_limit import request_ip
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

INVITE_TTL = timedelta(hours=24)
# Own bucket for the mailbox limits: an invitation code request never shares a
# cooldown or hourly cap with sign-in codes for the same address.
INVITE_PURPOSE = "superuser-invite"
INVITE_TEMPLATE = "superuser-invitation"
NOTICE_TEMPLATE = "notification"
ACCEPT_PATH = "/superuser-invite"
RETENTION = timedelta(days=90)
HOURLY_LIMIT = 5
DAILY_LIMIT = 20
GENERIC_SENT = "If that invitation is still open, a code has been sent to its address."
INVALID = "That invitation is no longer valid. Ask an administrator for a new one."
NOT_CONFIGURED = "Invitation email is not configured: FRONTEND_HOST must be set."


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalise(email: str) -> str:
    return email.strip().lower()


def accept_link(token: str) -> str:
    """The link keeps the token in the fragment, so it stays out of server access logs
    and referrers. The accept page reads it in the browser and posts it in a body."""
    base = (settings.FRONTEND_HOST or "").rstrip("/")
    if not base.startswith(("https://", "http://")):
        raise AppException(NOT_CONFIGURED, 503)
    return f"{base}{ACCEPT_PATH}#{urlencode({'token': token})}"


async def user_by_address(
    session: AsyncSession, email: str, *, lock: bool = False
) -> User | None:
    """Case-insensitive account lookup for an address. ``lock`` takes the row lock
    and refreshes the object, for a write."""
    statement = select(User).where(func.lower(User.email) == normalise(email))
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    return (await session.execute(statement)).scalars().first()


async def _refuse_address(session: AsyncSession, email: str) -> None:
    """Refuse an inactive or anonymised account, or a placeholder address. A new
    address is allowed: acceptance creates the account."""
    if is_placeholder_email(email):
        raise AppException("This address cannot be invited", 400)
    user = await user_by_address(session, email)
    if user is not None and (not user.is_active or service.is_anonymised(user)):
        raise AppException("This address cannot be invited", 400)


async def _check_rate(session: AsyncSession, inviter: User) -> None:
    """At most HOURLY_LIMIT and DAILY_LIMIT invitations per inviter, counted from the
    invitation rows. The inviter's row is locked so two requests cannot both pass."""
    await session.execute(
        select(User.id).where(User.id == inviter.id).with_for_update()
    )
    now = utc_now()
    hourly = await session.scalar(
        select(func.count(SuperuserInvitation.id)).where(
            SuperuserInvitation.invited_by_user_id == inviter.id,
            SuperuserInvitation.created_at > now - timedelta(hours=1),
        )
    )
    daily = await session.scalar(
        select(func.count(SuperuserInvitation.id)).where(
            SuperuserInvitation.invited_by_user_id == inviter.id,
            SuperuserInvitation.created_at > now - timedelta(hours=24),
        )
    )
    if (hourly or 0) >= HOURLY_LIMIT or (daily or 0) >= DAILY_LIMIT:
        raise AppException("Too many invitations. Try again later.", 429)


async def _active_superusers(session: AsyncSession) -> list[User]:
    return list(
        (
            await session.execute(
                select(User).where(
                    User.is_superuser.is_(True), User.is_active.is_(True)
                )
            )
        )
        .scalars()
        .all()
    )


NOTICE_FOOTER = "This is an administration notice sent to superusers. It is not a preference-controlled email."


def _notice(session: AsyncSession, admin: User, title: str, body: str) -> None:
    """One email to an active superuser through the outbox. The props carry both the
    React names and the fallback names, so either renderer fills the mail. The footer
    says this notice bypasses preferences."""
    notification_service.enqueue_email(
        session=session,
        to_email=admin.email,
        subject=title,
        transactional=True,
        template=NOTICE_TEMPLATE,
        props={
            "projectName": email_settings.PROJECT_NAME,
            "project_name": email_settings.PROJECT_NAME,
            "title": title,
            "body": body,
            "footer": NOTICE_FOOTER,
            "linkUrl": None,
            "link_url": None,
        },
    )


async def _notify_superusers(
    session: AsyncSession,
    *,
    title: str,
    body: str,
    exclude: frozenset[uuid.UUID] = frozenset(),
) -> None:
    """Notify every active superuser who can receive mail. The placeholder first
    superuser (its address cannot receive mail) and unverified addresses are skipped,
    so the outbox does not bounce. ``exclude`` names accounts that already know."""
    for admin in await _active_superusers(session):
        if admin.id in exclude:
            continue
        if is_placeholder_email(admin.email) or admin.email_verified_at is None:
            continue
        _notice(session, admin, title, body)


REVOKED_NOTICE_TITLE = "Superuser access removed"


async def demote_superuser(session: AsyncSession, *, actor: User, target: User) -> bool:
    """Remove superuser status from ``target`` (ADR-0059 rule 1). The caller has already
    checked the actor's authenticator and two-step sign-in, and commits.

    Returns False when the target is not a superuser (nothing changes). Otherwise the
    grant is removed, one audit row names the actor and the target, the account's open
    invitations are closed, and every other active superuser who can receive mail is
    told. Refused when no other active superuser would remain. The active superusers
    are locked in id order first, so two demotions cannot each see the other still
    there."""
    locked = (
        await session.scalars(
            select(User)
            .where(User.is_superuser.is_(True), User.is_active.is_(True))
            .order_by(User.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).all()
    if not target.is_superuser:
        return False
    if not any(row.id != target.id for row in locked):
        raise LastSuperuserError()
    target.is_superuser = False
    session.add(target)
    audit.set_actor(session, actor.id)
    await audit.record_change(
        session,
        entity_type="account",
        entity_id=str(target.id),
        record_type="account",
        record_id=str(target.id),
        action="superuser_revoked",
        changes={
            "actor_user_id": (None, str(actor.id)),
            "target_user_id": (None, str(target.id)),
            "is_superuser": (True, False),
        },
    )
    await close_for_inviter(session, target.id)
    actor_name = actor.full_name or actor.email
    await _notify_superusers(
        session,
        title=REVOKED_NOTICE_TITLE,
        body=(
            f"{actor_name} removed superuser access from {target.email}. If you did "
            "not expect this, review the superuser list in the admin app."
        ),
        exclude=frozenset({actor.id, target.id}),
    )
    return True


async def create_invitation(
    session: AsyncSession, *, inviter: User, email: str, reason: str
) -> SuperuserInvitation:
    """Create a one-time invitation and queue its email. The caller commits."""
    clean_email = normalise(email)
    accept_link("probe")  # fails loudly before any row is written if unconfigured
    await _refuse_address(session, clean_email)
    await _check_rate(session, inviter)
    now = utc_now()
    audit.set_actor(session, inviter.id)
    # One open invitation per address: an older one stops working, and the audit
    # trail shows it was superseded.
    stale = await session.scalars(
        select(SuperuserInvitation).where(
            SuperuserInvitation.email == clean_email,
            SuperuserInvitation.accepted_at.is_(None),
            SuperuserInvitation.revoked_at.is_(None),
        )
    )
    for old in stale.all():
        old.revoked_at = now
        session.add(old)
        await audit.record_change(
            session,
            entity_type="superuser_invitation",
            entity_id=str(old.id),
            record_type="superuser_invitation",
            record_id=str(old.id),
            action="superseded",
            changes={},
        )
    await session.flush()

    token = secrets.token_urlsafe(32)
    invitation = SuperuserInvitation(
        id=uuid.uuid4(),
        email=clean_email,
        token_hash=hash_token(token),
        reason=reason,
        invited_by_user_id=inviter.id,
        expires_at=now + INVITE_TTL,
        created_at=now,
    )
    session.add(invitation)
    try:
        await session.flush()
    except IntegrityError:
        # A concurrent invitation for the same address won the open-invitation index.
        raise AppException(
            "An invitation for this address is being sent. Try again in a moment.", 409
        ) from None
    await audit.record_change(
        session,
        entity_type="superuser_invitation",
        entity_id=str(invitation.id),
        record_type="superuser_invitation",
        record_id=str(invitation.id),
        action="invited",
        changes={"reason": (None, reason)},
        sensitive=frozenset({"reason"}),
    )
    notification_service.enqueue_email(
        session=session,
        to_email=clean_email,
        subject=f"You are invited to sign in to {email_settings.PROJECT_NAME}",
        transactional=True,
        template=INVITE_TEMPLATE,
        props={
            "projectName": email_settings.PROJECT_NAME,
            "inviterName": inviter.full_name or inviter.email,
            "acceptLink": accept_link(token),
            "validHours": int(INVITE_TTL.total_seconds() // 3600),
        },
    )
    await _notify_superusers(
        session,
        title="Superuser invitation sent",
        body=(
            f"{inviter.full_name or inviter.email} invited {clean_email} to be a "
            "superuser. The invitation expires in 24 hours. If you did not expect "
            "this, revoke it in the admin app."
        ),
    )
    return invitation


async def list_pending(session: AsyncSession) -> list[SuperuserInvitation]:
    now = utc_now()
    rows = await session.scalars(
        select(SuperuserInvitation)
        .where(
            SuperuserInvitation.accepted_at.is_(None),
            SuperuserInvitation.revoked_at.is_(None),
            SuperuserInvitation.expires_at > now,
        )
        .order_by(SuperuserInvitation.created_at.desc(), SuperuserInvitation.id)
        .limit(100)
    )
    return list(rows.all())


async def revoke_invitation(
    session: AsyncSession, *, actor: User, invitation_id: uuid.UUID
) -> SuperuserInvitation:
    row = (
        await session.execute(
            select(SuperuserInvitation)
            .where(SuperuserInvitation.id == invitation_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise AppException("Invitation not found", 404)
    if row.accepted_at is not None or row.revoked_at is not None:
        raise AppException("This invitation is already closed", 409)
    row.revoked_at = utc_now()
    session.add(row)
    audit.set_actor(session, actor.id)
    await audit.record_change(
        session,
        entity_type="superuser_invitation",
        entity_id=str(row.id),
        record_type="superuser_invitation",
        record_id=str(row.id),
        action="revoked",
        changes={},
    )
    return row


async def close_for_inviter(session: AsyncSession, inviter_id: uuid.UUID) -> int:
    """Revoke the open invitations an account sent. Called when that account is
    deactivated, demoted or anonymised (offboarding). Acceptance also refuses them."""
    now = utc_now()
    rows = (
        await session.scalars(
            select(SuperuserInvitation)
            .where(
                SuperuserInvitation.invited_by_user_id == inviter_id,
                SuperuserInvitation.accepted_at.is_(None),
                SuperuserInvitation.revoked_at.is_(None),
            )
            .with_for_update()
        )
    ).all()
    for row in rows:
        row.revoked_at = now
        session.add(row)
        await audit.record_change(
            session,
            entity_type="superuser_invitation",
            entity_id=str(row.id),
            record_type="superuser_invitation",
            record_id=str(row.id),
            action="revoked",
            changes={"cause": (None, "inviter_offboarded")},
        )
    return len(rows)


async def purge_closed_invitations(
    session: AsyncSession, *, now: datetime | None = None
) -> int:
    """Delete invitations that ended more than RETENTION ago (accepted, revoked or
    expired). The audit rows they wrote remain. The caller commits."""
    cutoff = (now or utc_now()) - RETENTION
    result = await session.execute(
        delete(SuperuserInvitation).where(
            or_(
                and_(
                    SuperuserInvitation.accepted_at.is_not(None),
                    SuperuserInvitation.accepted_at < cutoff,
                ),
                and_(
                    SuperuserInvitation.revoked_at.is_not(None),
                    SuperuserInvitation.revoked_at < cutoff,
                ),
                and_(
                    SuperuserInvitation.accepted_at.is_(None),
                    SuperuserInvitation.revoked_at.is_(None),
                    SuperuserInvitation.expires_at < cutoff,
                ),
            )
        )
    )
    rowcount = getattr(result, "rowcount", 0)
    return int(rowcount or 0)


async def _open_invitation(
    session: AsyncSession, token: str, *, lock: bool = False
) -> SuperuserInvitation | None:
    """The invitation for this token if it is still open, else None. A locked read
    refreshes the row, so the re-check sees what a concurrent request committed."""
    statement = select(SuperuserInvitation).where(
        SuperuserInvitation.token_hash == hash_token(token)
    )
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    row = (await session.execute(statement)).scalar_one_or_none()
    if (
        row is None
        or row.accepted_at is not None
        or row.revoked_at is not None
        or row.expires_at <= utc_now()
    ):
        return None
    return row


async def request_code(
    session: AsyncSession, *, token: str, client_ip: str | None
) -> str:
    """Email a code to the invited address. The reply never says whether the token was
    valid or a send happened."""
    invitation = await _open_invitation(session, token)
    if invitation is None:
        return GENERIC_SENT
    mailbox_key = f"{INVITE_PURPOSE}:{normalised_address(invitation.email)}"
    if not await app_service._code_request_allowed(client_ip, mailbox_key):
        return GENERIC_SENT
    code = await app_service._issue_code(
        session, purpose=INVITE_PURPOSE, target=invitation.email
    )
    await session.commit()
    if email_settings.EMAILS_ENABLED:
        app_service._schedule_code_email(
            email=invitation.email, app_label="Barrels", code=code
        )
    return GENERIC_SENT


async def _clear_unverified_account(session: AsyncSession, user: User) -> None:
    """Whatever an unverified account holds was set by someone who has not proven the
    mailbox. Clear it before the grant: password, authenticator, recovery codes,
    sessions, devices, Google links and API keys. Writes its own ``pw_retired`` row."""
    user.hashed_password = await get_password_hash_async(secrets.token_urlsafe(32))
    user.password_setup_pending = True
    user.totp_enabled = False
    user.totp_secret = None
    user.mfa_recovery_hashes = []
    await app_service.revoke_access_material(session, user)
    await record_security(session, user, "pw_retired")


async def accept_invitation(
    session: AsyncSession,
    request: Request,
    *,
    token: str,
    code: str,
    totp_code: str | None,
) -> SessionLoginResponse:
    """Verify the emailed code, grant superuser and sign the invitee in.

    The grant, the audit row and the notices are one commit. The account is created if
    the address has none. An existing unverified account is cleared first. A verified
    account with an authenticator must also pass it (as the emailed-code sign-in does)."""
    # Lock order: read unlocked, lock the inviter, lock the invitation and re-check,
    # then lock the user before any write. Invite and offboarding use the same order.
    candidate = await _open_invitation(session, token)
    if candidate is None or candidate.invited_by_user_id is None:
        raise AppException(INVALID, 400)
    inviter = (
        await session.execute(
            select(User)
            .where(User.id == candidate.invited_by_user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if inviter is None or not inviter.is_active or not inviter.is_superuser:
        raise AppException(INVALID, 400)
    invitation = await _open_invitation(session, token, lock=True)
    if invitation is None:
        raise AppException(INVALID, 400)
    # Not consumed yet: a mistyped authenticator code must not burn the emailed code
    # (the sign-in path deletes its code only after the authenticator check passes).
    challenge = await app_service._verify_code(
        session,
        purpose=INVITE_PURPOSE,
        target=invitation.email,
        code=code,
        consume=False,
    )
    user = await user_by_address(session, invitation.email, lock=True)
    retired = False
    if user is None:
        user = await app_service._create_member(
            session, email=invitation.email, first_name=None, last_name=None
        )
    elif not user.is_active or service.is_anonymised(user):
        raise AppException(INVALID, 400)
    elif user.email_verified_at is None:
        retired = True
        await _clear_unverified_account(session, user)
    await app_service._require_totp(session, user, totp_code)
    await session.delete(challenge)

    now = utc_now()
    user.is_superuser = True
    user.registration_pending = False
    if user.email_verified_at is None:
        user.email_verified_at = now
    session.add(user)
    invitation.accepted_at = now
    session.add(invitation)
    inviter_name = inviter.full_name or inviter.email
    audit.set_actor(session, user.id)
    await audit.record_change(
        session,
        entity_type="superuser_invitation",
        entity_id=str(invitation.id),
        record_type="account",
        record_id=str(user.id),
        action="superuser_granted",
        changes={
            "inviter_user_id": (None, str(inviter.id)),
            "invitee_user_id": (None, str(user.id)),
            "reason": (None, invitation.reason),
            "retired_unverified": (None, retired),
        },
        sensitive=frozenset({"reason"}),
    )
    await _notify_superusers(
        session,
        title="Superuser invitation accepted",
        body=(
            f"{user.email} accepted a superuser invitation sent by {inviter_name}. "
            "They now have superuser access. If you did not expect this, review the "
            "superuser list in the admin app."
        ),
    )
    await session.commit()
    logger.info(
        "Superuser invitation accepted",
        extra={"user_id": str(user.id), "actor_id": str(inviter.id)},
    )
    # The same account session an emailed-code sign-in opens (app "auth", no app
    # claim). No MFA evidence: the proof was an emailed code, so superuser routes
    # still need an authenticator sign-in before they work.
    user_agent = request.headers.get("user-agent")
    ip_address = request_ip(request)
    new_device = remember_device(user, user_agent)
    db_session, session_token = await service.create_session(
        session=session,
        user=user,
        client_type="web",
        app_name="auth",
        user_agent=user_agent,
        ip_address=ip_address,
        enforce_approval=False,
        mfa_verified_at=None,
    )
    if new_device:
        schedule_new_sign_in_alert(
            email_to=user.email,
            device=new_device,
            ip_address=ip_address,
            signed_in_at=db_session.created_at,
        )
    access_token, expires = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return SessionLoginResponse(
        access_token=access_token,
        access_token_expires_at=expires,
        session_token=session_token,
        session_expires_at=db_session.expires_at,
        session=SessionPublic.model_validate(db_session, from_attributes=True),
        user=SessionUserPublic.model_validate(user, from_attributes=True),
    )


async def require_superuser_session(
    session: AsyncSession, user: User, *, token: str
) -> None:
    """Superuser admin powers over invitations: an active superuser, an enrolled
    authenticator, and a session that passed two-step sign-in (ADR-0059 rule 1)."""
    require_superuser_mfa(user)
    await require_mfa_session(session, user, token=token)
