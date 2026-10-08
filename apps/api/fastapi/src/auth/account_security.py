"""Sensitive account controls with ownership and fresh authentication checks."""

import hashlib
import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import totp
from src.auth.config import auth_settings
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


async def new_recovery_codes(
    session: AsyncSession, user: User, password: str, code: str
) -> list[str]:
    if not user.totp_enabled or not await verify_password_async(
        password, user.hashed_password
    ):
        raise AppException("Confirm your password and authenticator code", 400)
    if not await verify_factor(session, user, code):
        raise AppException("Authenticator or recovery code was not accepted", 400)
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
