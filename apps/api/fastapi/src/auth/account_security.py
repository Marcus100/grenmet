"""Sensitive account controls with ownership and fresh authentication checks."""

import hashlib
import secrets
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth import totp
from src.auth.models import Session as LoginSession
from src.auth.models import User
from src.auth.utils import verify_password_async
from src.exceptions import AppException
from src.utils.datetime import utc_now


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
    if totp.verify_code(secret=locked.totp_secret or "", code=code):
        return True
    digest = recovery_hash(code)
    if digest not in locked.mfa_recovery_hashes:
        return False
    locked.mfa_recovery_hashes = [
        item for item in locked.mfa_recovery_hashes if item != digest
    ]
    session.add(locked)
    await session.flush()
    return True


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
