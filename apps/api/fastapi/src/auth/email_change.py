"""Proof for changing the account email (issue #1535).

Changing ``User.email`` moves every later password reset and code sign-in to a new
address, so the change must prove the current sign-in in the same request:

* an account with a password proves it with ``current_password``;
* an account with no password (``password_setup_pending``, code sign-in only) proves
  it with ``email_code``, a six-digit code emailed to the CURRENT address by
  ``POST /auth/users/me/email-change/code`` (the code store and mail of sign-in).

Wrong guesses count against the sign-in lockout (``lockout.login_lockout``, so five
wrong guesses lock both). Every attempt to change the email counts against
``ATTEMPT_LIMIT`` for the account. Once the change is saved, the old address is told
through the notifications outbox (``notify_old_address``), in the same transaction.
"""

import logging

from fastapi.concurrency import run_in_threadpool
from limits import parse
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import app_service
from src.auth.account_security import has_usable_password
from src.auth.exceptions import (
    AccountLockedError,
    CurrentPasswordIncorrectError,
    EmailChangeProofRequiredError,
    EmailChangeRateLimitedError,
    EmailChangeUsesPasswordError,
)
from src.auth.lockout import (
    email_code_cooldown,
    email_code_send_limit,
    login_lockout,
    normalised_address,
)
from src.auth.models import User
from src.auth.utils import verify_password_async
from src.email_config import email_settings
from src.exceptions import AppException
from src.notifications import service as notification_service
from src.rate_limit import limiter

logger = logging.getLogger(__name__)

CODE_PURPOSE = "email-change"
CODE_SUBJECT = "Your email change code"
CODE_APP_LABEL = "account"
CODE_SENT_MESSAGE = "We sent a 6-digit code to your current email address."
# Attempts to change the email, per account. Counted before the proof is checked.
ATTEMPT_LIMIT = "10/hour"
ATTEMPT_BUCKET = "email-change"
NOTICE_SUBJECT = "Your email address was changed"
NOTICE_TEMPLATE = "notification"
NOTICE_BODY = (
    "The email address on your account was changed. If you made this change, there is "
    "nothing to do. If you did not, contact a Barrels administrator straight away."
)


async def _within_attempt_limit(user: User) -> bool:
    """Count one attempt for this account; False once the limit is used up.

    Fails open when the limiter's store is down, like the other limits here."""
    if not limiter.enabled:
        return True
    try:
        return bool(
            await run_in_threadpool(
                limiter.limiter.hit,
                parse(ATTEMPT_LIMIT),
                ATTEMPT_BUCKET,
                str(user.id),
            )
        )
    except Exception:  # the limiter's store (Redis) is down: serve, but say so
        logger.warning("Email change limiter unavailable; allowing the attempt")
        return True


async def require_proof(
    *,
    session: AsyncSession,
    user: User,
    current_password: str | None,
    email_code: str | None,
) -> None:
    """Raise unless this request proves the current sign-in (see the module docstring).

    The caller changes the email only when this returns. A password proof is checked
    with the password hash; a code proof consumes the code, so the caller must commit."""
    if await login_lockout.is_locked(user.email):
        raise AccountLockedError()
    if not await _within_attempt_limit(user):
        raise EmailChangeRateLimitedError()
    if has_usable_password(user):
        if not current_password:
            raise EmailChangeProofRequiredError(by_code=False)
        if not await verify_password_async(current_password, user.hashed_password):
            await login_lockout.record_failure(user.email)
            raise CurrentPasswordIncorrectError()
    else:
        if not email_code:
            raise EmailChangeProofRequiredError(by_code=True)
        try:
            await app_service._verify_code(
                session,
                purpose=CODE_PURPOSE,
                target=user.email,
                code=email_code,
            )
        except AppException:
            await login_lockout.record_failure(user.email)
            raise
    await login_lockout.reset(user.email)


async def start_code(*, session: AsyncSession, user: User) -> None:
    """Email a code to the account's current address, for a change of email.

    Only for an account with no password: a password account proves with its password.
    Limited per mailbox by the same cooldown and hourly cap as sign-in codes."""
    if has_usable_password(user):
        raise EmailChangeUsesPasswordError()
    key = normalised_address(user.email)
    if not await email_code_cooldown.allow(key):
        raise EmailChangeRateLimitedError(
            "Wait a minute before asking for another code."
        )
    if not await email_code_send_limit.allow(key):
        raise EmailChangeRateLimitedError(
            "Too many codes were requested. Try again later."
        )
    code = await app_service._issue_code(
        session, purpose=CODE_PURPOSE, target=user.email, user_id=user.id
    )
    await session.commit()
    # Sent after the commit, in the background, like the sign-in code: the code is
    # held only in memory and in its hash, never in the outbox.
    app_service._schedule_code_email(
        email=user.email,
        app_label=CODE_APP_LABEL,
        code=code,
        subject=CODE_SUBJECT,
    )


def notify_old_address(session: AsyncSession, *, old_email: str) -> None:
    """Queue the notice to the address the account has just left.

    Written in the caller's transaction; the worker sends it. Transactional, so it is
    not held back by marketing preferences or suppression of the address."""
    notification_service.enqueue_email(
        session=session,
        to_email=old_email,
        subject=NOTICE_SUBJECT,
        transactional=True,
        template=NOTICE_TEMPLATE,
        props={
            "projectName": email_settings.PROJECT_NAME,
            "project_name": email_settings.PROJECT_NAME,
            "title": NOTICE_SUBJECT,
            "body": NOTICE_BODY,
            "linkUrl": None,
            "link_url": None,
        },
    )
