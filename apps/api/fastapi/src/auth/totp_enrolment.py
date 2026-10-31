"""Two-step (TOTP) enrolment: begin, activate and disable.

A privileged account (``privileged_mfa.is_privileged``) must also confirm its first
authenticator with a one-time code emailed to the account (issue #625). A stolen
password then cannot enrol an attacker's own authenticator. The code reuses the
email-code store in ``app_service`` (hashed, expiring, single use, locked after
repeated wrong guesses) and is issued when enrolment begins.
"""

import logging
import uuid
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Session as AuthSession
from src.auth.models import (
    User,
)
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

# Purpose key of the emailed enrolment code in the shared ``AuthChallenge`` store.
ENROLMENT_CODE_PURPOSE = "2fa-enrolment"
# Audit actions (``AuditEntry.action`` holds 20 characters at most).
ENROLMENT_CODE_SENT = "enrol_code_sent"
ENROLMENT_CODE_REJECTED = "enrol_code_bad"
# At most this many codes go to one account in each window (rate limit).
ENROLMENT_CODES_PER_WINDOW = 3
ENROLMENT_CODE_WINDOW = timedelta(minutes=15)


async def begin_totp_setup(*, session: AsyncSession, user: User) -> str:
    """Generate and store a new (inactive) TOTP secret; return it for provisioning.

    For a privileged account a one-time code is also emailed to it, and the rate
    limit on those codes applies."""
    from src.auth import totp
    from src.exceptions import AppException

    await session.refresh(user, with_for_update=True)
    if user.totp_enabled:
        raise AppException("Two-factor authentication is already enabled", 409)
    privileged = await _is_privileged(session, user)
    if privileged and (
        await _recent_enrolment_codes(session, user) >= ENROLMENT_CODES_PER_WINDOW
    ):
        raise AppException(
            "Too many codes were sent to your email. Wait a few minutes and try again.",
            429,
        )
    secret = totp.generate_secret()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = False
    session.add(user)
    code = await _issue_enrolment_code(session, user) if privileged else None
    await session.commit()
    await session.refresh(user)
    if code is not None:
        await _send_enrolment_code(email=user.email, code=code)
    return secret


async def enrolment_needs_email_code(*, session: AsyncSession, user: User) -> bool:
    """True when activating this account's first authenticator needs the emailed code."""
    return not user.totp_enabled and await _is_privileged(session, user)


async def activate_totp(
    *,
    session: AsyncSession,
    user: User,
    code: str,
    keep_session_id: uuid.UUID | None = None,
    email_code: str | None = None,
) -> bool:
    """Verify a code against the pending secret and enable 2FA on success.

    The first authenticator of a privileged account also needs ``email_code``, the
    one-time code emailed when enrolment began. A wrong or missing emailed code raises
    400 before the authenticator code is checked."""
    from src.auth import totp

    await session.refresh(user, with_for_update=True)
    challenge = (
        await _check_enrolment_code(session, user, email_code)
        if await enrolment_needs_email_code(session=session, user=user)
        else None
    )
    if not user.totp_secret or not totp.verify_code(
        secret=totp.decrypt_secret(user.totp_secret), code=code
    ):
        return False
    if challenge is not None:
        await session.delete(challenge)
        await session.flush()
    user.totp_enabled = True
    from src.auth.account_security import record_security

    await record_security(session, user, "totp_enabled")
    session.add(user)
    if await _is_privileged(session, user):
        # A fresh authenticator on a privileged account ends every other session, so a
        # session opened before enrolment cannot ride on the new factor.
        statement = update(AuthSession).where(
            AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)
        )
        if keep_session_id is not None:
            statement = statement.where(AuthSession.id != keep_session_id)
        await session.execute(statement.values(revoked_at=utc_now()))
        privileged = True
    else:
        privileged = False
    await session.commit()
    await session.refresh(user)
    if privileged:
        from src.auth import devices

        devices.schedule_authenticator_added_alert(email_to=user.email)
    return True


async def _is_privileged(session: AsyncSession, user: User) -> bool:
    from src.auth.privileged_mfa import is_privileged

    return await is_privileged(session, user)


async def _recent_enrolment_codes(session: AsyncSession, user: User) -> int:
    """Enrolment codes emailed to this account inside the rate-limit window.

    Counted from the audit trail, so no extra table or migration is needed."""
    from src.audit.models import AuditEntry

    count = await session.scalar(
        select(func.count())
        .select_from(AuditEntry)
        .where(
            AuditEntry.record_type == "account_security",
            AuditEntry.record_id == str(user.id),
            AuditEntry.action == ENROLMENT_CODE_SENT,
            AuditEntry.created_at >= utc_now() - ENROLMENT_CODE_WINDOW,
        )
    )
    return int(count or 0)


async def _issue_enrolment_code(session: AsyncSession, user: User) -> str:
    """Store a new one-time code for this account, replacing any outstanding one."""
    from src.auth import app_service
    from src.auth.account_security import record_security

    code = await app_service._issue_code(
        session,
        purpose=ENROLMENT_CODE_PURPOSE,
        target=user.email,
        user_id=user.id,
    )
    await record_security(session, user, ENROLMENT_CODE_SENT)
    return code


async def _check_enrolment_code(
    session: AsyncSession, user: User, email_code: str | None
):
    """Return the stored code, not yet consumed, when ``email_code`` matches it.

    A wrong, missing, expired or used code raises 400 and is audited. The shared store
    counts wrong guesses and locks a code after five of them."""
    from src.auth import app_service
    from src.auth.account_security import record_security
    from src.exceptions import AppException

    try:
        if not email_code or not email_code.strip():
            raise AppException(
                "Enter the 6-digit code we emailed you to turn on two-step verification.",
                400,
            )
        return await app_service._verify_code(
            session,
            purpose=ENROLMENT_CODE_PURPOSE,
            target=user.email,
            code=email_code.strip(),
            consume=False,
        )
    except AppException:
        await record_security(session, user, ENROLMENT_CODE_REJECTED)
        await session.commit()
        raise


async def _send_enrolment_code(*, email: str, code: str) -> None:
    from starlette.concurrency import run_in_threadpool

    from src.auth import app_service
    from src.auth.config import auth_settings
    from src.email import send_email
    from src.email_config import email_settings
    from src.exceptions import AppException

    if email_settings.EMAILS_ENABLED:
        try:
            await run_in_threadpool(
                send_email,
                email_to=email,
                subject=f"Your two-step verification code: {code}",
                html_content=(
                    "<p>Use this code to finish turning on two-step verification</p>"
                    f'<p style="font-size:28px;font-weight:700;letter-spacing:4px">{code}</p>'
                    f"<p>It expires in {app_service.CODE_TTL_MINUTES} minutes. If you did "
                    "not start this, change your password and sign out other sessions "
                    "straight away.</p>"
                ),
            )
        except Exception as exc:
            raise AppException(
                "We couldn't send the code. Try again shortly.", 503
            ) from exc
    elif auth_settings.ENVIRONMENT == "local":
        logger.warning("Two-step enrolment code for %s: %s", email, code)


async def disable_totp(*, session: AsyncSession, user: User) -> None:
    """Disable 2FA and clear the stored secret."""
    from src.auth.account_security import record_security

    await session.flush()
    await session.refresh(user, with_for_update=True)
    await record_security(session, user, "totp_disabled")
    user.totp_secret = None
    user.totp_enabled = False
    user.mfa_recovery_hashes = []
    from sqlalchemy import update

    await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id)
        .values(mfa_verified_at=None)
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
