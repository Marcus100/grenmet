"""Two-step (TOTP) enrolment: begin, activate and disable."""

import uuid

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Session as AuthSession
from src.auth.models import (
    User,
)
from src.utils.datetime import utc_now


async def begin_totp_setup(*, session: AsyncSession, user: User) -> str:
    """Generate and store a new (inactive) TOTP secret; return it for provisioning."""
    from src.auth import totp

    await session.refresh(user, with_for_update=True)
    if user.totp_enabled:
        from src.exceptions import AppException

        raise AppException("Two-factor authentication is already enabled", 409)
    secret = totp.generate_secret()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = False
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return secret


async def activate_totp(
    *,
    session: AsyncSession,
    user: User,
    code: str,
    keep_session_id: uuid.UUID | None = None,
) -> bool:
    """Verify a code against the pending secret and enable 2FA on success."""
    from src.auth import totp

    await session.refresh(user, with_for_update=True)
    if not user.totp_secret or not totp.verify_code(
        secret=totp.decrypt_secret(user.totp_secret), code=code
    ):
        return False
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
    await session.commit()
    await session.refresh(user)
    return True


async def _is_privileged(session: AsyncSession, user: User) -> bool:
    from src.auth.privileged_mfa import is_privileged

    return await is_privileged(session, user)


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
