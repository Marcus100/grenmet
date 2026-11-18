"""Two-step (TOTP) enrolment: begin, activate and disable.

A privileged account (``privileged_mfa.is_privileged``) must also confirm its first
authenticator with a one-time code emailed to the account (issue #625). A stolen
password then cannot enrol an attacker's own authenticator. The code reuses the
email-code store in ``app_service`` (hashed, expiring, single use, locked after five
wrong guesses). Limits, all counted from the audit trail so no table or migration is
needed:

* three codes per account in 15 minutes and ten per 24 hours. Only a code that was
  sent successfully counts, so a failed send does not use up a try;
* five wrong codes lock the enrolment for 30 minutes. Setup must then start again.

A privileged account that has no authenticator also cannot change its email address
(``auth.service``), so the code always goes to the address the account signed in with.

ADR-0059 rule 2 skips that emailed code when the request's session was opened by an
emailed code less than ``EMAIL_PROOF_WINDOW`` ago (``email_code_verified_at``). Rule 4
then marks that session two-step verified once the authenticator code is checked. Any
other session keeps the emailed code and is never upgraded.
"""

import logging
import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.exceptions import AccountLockedError
from src.auth.lockout import factor_lockout
from src.auth.models import Session as AuthSession
from src.auth.models import (
    User,
)
from src.auth.modern_models import AuthChallenge
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

# Purpose key of the emailed enrolment code in the shared ``AuthChallenge`` store.
ENROLMENT_CODE_PURPOSE = "2fa-enrolment"
# Audit actions (``AuditEntry.action`` holds 20 characters at most).
ENROLMENT_CODE_SENT = "enrol_code_sent"
ENROLMENT_CODE_REJECTED = "enrol_code_bad"
# Rate limits on codes sent to one account.
ENROLMENT_CODES_PER_WINDOW = 3
ENROLMENT_CODE_WINDOW = timedelta(minutes=15)
ENROLMENT_CODES_PER_DAY = 10
ENROLMENT_DAY_WINDOW = timedelta(hours=24)
# How long a setup waits for the account lock before it answers 429 (see
# ``_lock_account_for_setup``). Postgres ``lock_not_available``.
ENROLMENT_LOCK_WAIT = "2s"
LOCK_NOT_AVAILABLE_SQLSTATE = "55P03"
# Wrong codes that lock the enrolment, and for how long.
ENROLMENT_BAD_CODE_LIMIT = 5
ENROLMENT_LOCKOUT = timedelta(minutes=30)
ENROLMENT_WRONG_CODE_MESSAGE = (
    "That code is wrong or has expired. After five wrong codes you must set up "
    "two-step verification again."
)
# ADR-0059 rule 2: a session opened by an emailed code this recently proves the mailbox,
# so the set-up of an authenticator on a privileged account needs no second emailed code.
EMAIL_PROOF_WINDOW = timedelta(minutes=10)
ENROLMENT_RESTART_MESSAGE = (
    "Start two-step verification set-up again. Your sign-in is more than 10 minutes "
    "old, so we need to email you a code."
)


async def begin_totp_setup(
    *, session: AsyncSession, user: User, keep_session_id: uuid.UUID | None = None
) -> str:
    """Generate and store a new (inactive) TOTP secret; return it for provisioning.

    For a privileged account a one-time code is also emailed to it, unless the request's
    session (``keep_session_id``) proves the mailbox (ADR-0059 rule 2). Setup is refused
    while the enrolment is locked or the rate limits are used up.

    The user row lock is held from the count to the commit, through the send, so
    parallel setup calls for one account run one after another and each sees the
    ``enrol_code_sent`` rows of the ones before it (issue #952). A failed send rolls
    the transaction back, which releases the lock and counts nothing."""
    from src.auth import totp
    from src.auth.account_security import record_security
    from src.exceptions import AppException

    await _lock_account_for_setup(session, user)
    if user.totp_enabled:
        raise AppException("Two-factor authentication is already enabled", 409)
    code_needed = await _email_code_needed(session, user, keep_session_id)
    if code_needed:
        await _ensure_may_send_code(session, user)
    secret = totp.generate_secret()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = False
    session.add(user)
    if not code_needed:
        await session.commit()
        await session.refresh(user)
        return secret
    code = await _issue_enrolment_code(session, user)
    try:
        await _send_enrolment_code(email=user.email, code=code)
    except AppException:
        await session.rollback()
        raise
    # Counted only once the email went out, still under the lock: a failed send
    # uses no try.
    await record_security(session, user, ENROLMENT_CODE_SENT)
    await session.commit()
    await session.refresh(user)
    return secret


async def _lock_account_for_setup(session: AsyncSession, user: User) -> None:
    """Lock the account row for a setup, waiting at most ``ENROLMENT_LOCK_WAIT``.

    The lock is held through the emailed send (#952), so a slow or hung mail server
    would otherwise queue every other setup, and each waiting request would hold a
    database connection (#952 review, M1). A waiter that cannot get the lock in time
    gets 429 and releases its connection. The timeout applies to this transaction
    only (``is_local``)."""
    from src.exceptions import AppException

    await session.execute(
        text("SELECT set_config('lock_timeout', :value, true)"),
        {"value": ENROLMENT_LOCK_WAIT},
    )
    try:
        await session.refresh(user, with_for_update=True)
    except DBAPIError as error:
        orig = error.orig
        sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
        if sqlstate != LOCK_NOT_AVAILABLE_SQLSTATE:
            raise
        await session.rollback()
        raise AppException(
            "A two-step verification set-up is already in progress. Try again in a minute.",
            429,
        ) from error


async def enrolment_needs_email_code(
    *,
    session: AsyncSession,
    user: User,
    keep_session_id: uuid.UUID | None = None,
) -> bool:
    """True when activating this account's first authenticator needs the emailed code.

    ``keep_session_id`` is the request's session: a recent emailed-code sign-in on it
    proves the mailbox instead (ADR-0059 rule 2). Without it the code is always needed,
    which is what the email-change guard relies on."""
    return await _email_code_needed(session, user, keep_session_id)


async def _email_code_needed(
    session: AsyncSession, user: User, keep_session_id: uuid.UUID | None
) -> bool:
    if user.totp_enabled or not await _is_privileged(session, user):
        return False
    return await _proving_session(session, user, keep_session_id) is None


async def _proving_session(
    session: AsyncSession, user: User, session_id: uuid.UUID | None
) -> AuthSession | None:
    """The request's session when it proves the mailbox for this set-up (rule 2).

    It must belong to this account, be active, and have been opened by an emailed code
    no more than ``EMAIL_PROOF_WINDOW`` ago. A password or Google session, an older
    emailed-code session, or another account's session id gives None."""
    if session_id is None:
        return None
    login_session = await session.get(AuthSession, session_id)
    if login_session is None or login_session.user_id != user.id:
        return None
    now = utc_now()
    proved_at = login_session.email_code_verified_at
    if proved_at is None or now - proved_at > EMAIL_PROOF_WINDOW:
        return None
    if login_session.revoked_at is not None or login_session.expires_at <= now:
        return None
    return login_session


async def _has_outstanding_code(session: AsyncSession, user: User) -> bool:
    found = await session.scalar(
        select(AuthChallenge.user_id).where(
            AuthChallenge.user_id == user.id,
            AuthChallenge.purpose == ENROLMENT_CODE_PURPOSE,
        )
    )
    return found is not None


async def ensure_email_change_allowed(*, session: AsyncSession, user: User) -> None:
    """Refuse an email change while a privileged account has no authenticator.

    The emailed enrolment code goes to the account's address. Changing that address
    first would let a stolen password redirect the code, so it waits for two-step
    verification (issue #625). Used by every path that writes ``user.email``."""
    from src.exceptions import AppException

    if await enrolment_needs_email_code(session=session, user=user):
        raise AppException(
            "Turn on two-step verification before changing the email address of a "
            "privileged account (email_change_blocked)",
            403,
        )


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
    400 before the authenticator code is checked. A locked enrolment raises 429.

    A wrong authenticator code counts on ``lockout.factor_lockout`` (#1533). That key is
    checked first, so a locked account gets 429 even with the right code, and a right
    code clears the count."""
    from src.auth import totp
    from src.auth.account_security import record_factor_failure
    from src.exceptions import AppException

    if await factor_lockout.is_locked(str(user.id)):
        raise AccountLockedError()
    await session.refresh(user, with_for_update=True)
    # A privileged first authenticator needs the mailbox proven in this visit: either the
    # request's session was opened by an emailed code less than 10 minutes ago (rule 2),
    # or the emailed code is checked here (issue #625).
    setup_for_privileged = not user.totp_enabled and await _is_privileged(session, user)
    proving = (
        await _proving_session(session, user, keep_session_id)
        if setup_for_privileged
        else None
    )
    if setup_for_privileged and proving is None:
        await _ensure_not_locked(session, user)
        if not await _has_outstanding_code(session, user):
            # The set-up skipped the emailed code while the sign-in was recent, and the
            # sign-in has aged out since. Nothing was sent, so start again (not counted).
            raise AppException(ENROLMENT_RESTART_MESSAGE, 400)
        await _check_enrolment_code(session, user, email_code)
    if not user.totp_secret or not totp.verify_code(
        secret=totp.decrypt_secret(user.totp_secret), code=code
    ):
        await record_factor_failure(session, user)
        return False
    await factor_lockout.reset(str(user.id))
    if setup_for_privileged:
        await session.execute(
            delete(AuthChallenge).where(
                AuthChallenge.user_id == user.id,
                AuthChallenge.purpose == ENROLMENT_CODE_PURPOSE,
            )
        )
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
        if proving is not None:
            # ADR-0059 rule 4: the mailbox was proven in this visit and the authenticator
            # code was just verified, so the request's session completes two-step sign-in.
            proving.mfa_verified_at = utc_now()
            session.add(proving)
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
    # Enrolment rules also cover holders of an app with ``privileged_members`` (ADR-0061).
    from src.auth.privileged_mfa import is_enrolment_privileged

    return await is_enrolment_privileged(session, user)


async def _count_audit(
    session: AsyncSession, user: User, action: str, since: timedelta
) -> int:
    """Audit rows of ``action`` for this account in the last ``since``."""
    from src.audit.models import AuditEntry

    count = await session.scalar(
        select(func.count())
        .select_from(AuditEntry)
        .where(
            AuditEntry.record_type == "account_security",
            AuditEntry.record_id == str(user.id),
            AuditEntry.action == action,
            AuditEntry.created_at >= utc_now() - since,
        )
    )
    return int(count or 0)


async def _ensure_may_send_code(session: AsyncSession, user: User) -> None:
    from src.exceptions import AppException

    await _ensure_not_locked(session, user)
    if (
        await _count_audit(session, user, ENROLMENT_CODE_SENT, ENROLMENT_CODE_WINDOW)
        >= ENROLMENT_CODES_PER_WINDOW
    ):
        raise AppException(
            "Too many codes were sent to your email. Wait a few minutes and try again.",
            429,
        )
    if (
        await _count_audit(session, user, ENROLMENT_CODE_SENT, ENROLMENT_DAY_WINDOW)
        >= ENROLMENT_CODES_PER_DAY
    ):
        raise AppException(
            "You have used today's two-step verification set-ups. Try again tomorrow.",
            429,
        )


async def _ensure_not_locked(session: AsyncSession, user: User) -> None:
    from src.exceptions import AppException

    if (
        await _count_audit(session, user, ENROLMENT_CODE_REJECTED, ENROLMENT_LOCKOUT)
        >= ENROLMENT_BAD_CODE_LIMIT
    ):
        raise AppException(
            "Too many wrong codes. Wait 30 minutes, then set up two-step verification "
            "again.",
            429,
        )


async def _issue_enrolment_code(session: AsyncSession, user: User) -> str:
    """Store a new one-time code for this account, replacing any outstanding one.

    Not counted here: ``begin_totp_setup`` counts it once the email has gone out."""
    from src.auth import app_service

    return await app_service._issue_code(
        session,
        purpose=ENROLMENT_CODE_PURPOSE,
        target=user.email,
        user_id=user.id,
    )


async def _check_enrolment_code(
    session: AsyncSession, user: User, email_code: str | None
) -> AuthChallenge:
    """Return the stored code, not yet consumed, when ``email_code`` matches it.

    A wrong, missing, expired or used code raises 400 and is audited. The shared store
    counts wrong guesses and drops a code after five of them."""
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
    except AppException as error:
        await record_security(session, user, ENROLMENT_CODE_REJECTED)
        await session.commit()
        if error.status_code == 400 and "emailed you" not in error.message:
            raise AppException(ENROLMENT_WRONG_CODE_MESSAGE, 400) from error
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
