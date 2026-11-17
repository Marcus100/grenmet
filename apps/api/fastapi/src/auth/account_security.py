"""Sensitive account controls with ownership and fresh authentication checks."""

import hashlib
import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import totp
from src.auth.config import auth_settings
from src.auth.lockout import factor_lockout, login_lockout
from src.auth.models import Session as LoginSession
from src.auth.models import User
from src.auth.utils import verify_password_async
from src.exceptions import AppException
from src.utils.datetime import utc_now


async def record_security(session: AsyncSession, user: User, action: str) -> None:
    from src.audit import service as audit

    audit.set_actor(session, user.id)
    await audit.record_change(
        session,
        entity_type="account",
        entity_id=str(user.id),
        record_type="account_security",
        record_id=str(user.id),
        action=action,
        changes={"security": (None, action)},
    )


async def record_factor_failure(session: AsyncSession, user: User) -> None:
    """Count a wrong authenticator or recovery code on the per-account factor key.

    The count never touches the password sign-in key. When this failure trips the
    lock, an ``account_security`` audit entry ``factor_locked`` is written (#1544).
    """
    key = str(user.id)
    await factor_lockout.record_failure(key)
    if await factor_lockout.is_locked(key):
        await record_security(session, user, "factor_locked")
        await session.commit()


def recovery_hash(code: str) -> str:

    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


async def verify_factor(session: AsyncSession, user: User, code: str) -> bool:
    locked = (
        (
            await session.execute(
                select(User)
                .where(User.id == user.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .one()
    )
    if not locked.totp_enabled or not code.strip():
        return False
    digest = recovery_hash(code)
    if digest in locked.mfa_recovery_hashes:
        locked.mfa_recovery_hashes = [
            item for item in locked.mfa_recovery_hashes if item != digest
        ]
        session.add(locked)
        await session.flush()
        await record_security(session, locked, "recovery_code_used")
        return True
    if totp.verify_code(
        secret=totp.decrypt_secret(locked.totp_secret or ""), code=code
    ):
        if (
            not totp.is_encrypted(locked.totp_secret)
            and auth_settings.AUTH_TOTP_ENCRYPTION_KEYS
        ):
            locked.totp_secret = totp.encrypt_secret(locked.totp_secret or "")
            session.add(locked)
            await session.flush()
        return True
    return False


def has_usable_password(user: User) -> bool:
    """True when the account has a password it can sign in with.

    Email-code accounts carry a random hash that nobody knows and sit in
    ``password_setup_pending``; password sign-in refuses them (``login.py``). Any
    other account has a password, so the password is required for it.
    """
    return not user.password_setup_pending


async def new_recovery_codes(
    session: AsyncSession, user: User, password: str | None, code: str
) -> list[str]:
    """Replace the recovery codes (ADR-0059 rule 3).

    A live authenticator code (or an unused recovery code) is always required. The
    password is required only when the account has one; an email-code account has
    nothing to check, so a value sent for it is ignored.
    """
    if await login_lockout.is_locked(user.email) or await factor_lockout.is_locked(
        str(user.id)
    ):
        # A stolen email-code session must not get unlimited guesses at the code.
        raise AppException(
            "Account temporarily locked due to repeated failed logins", 429
        )
    if not user.totp_enabled:
        raise AppException("Confirm your password and authenticator code", 400)
    if has_usable_password(user) and (
        not password or not await verify_password_async(password, user.hashed_password)
    ):
        await login_lockout.record_failure(user.email)
        raise AppException("Confirm your password and authenticator code", 400)
    if not await verify_factor(session, user, code):
        await record_factor_failure(session, user)
        raise AppException("Authenticator or recovery code was not accepted", 400)
    await login_lockout.reset(user.email)
    await factor_lockout.reset(str(user.id))
    codes = [secrets.token_hex(12).upper() for _ in range(8)]
    user.mfa_recovery_hashes = [recovery_hash(item) for item in codes]
    await record_security(session, user, "recovery_replaced")
    session.add(user)
    await session.commit()
    return codes


async def revoke_owned_session(
    session: AsyncSession, user: User, session_id: uuid.UUID
) -> None:
    target = (
        (
            await session.execute(
                select(LoginSession)
                .where(LoginSession.id == session_id, LoginSession.user_id == user.id)
                .with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if target is None:
        raise AppException("Session not found", 404)
    target.revoked_at = utc_now()
    session.add(target)
    await session.commit()
