"""Two-step (TOTP) enrolment: begin, activate and disable."""

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Session as AuthSession
from src.auth.models import (
    User,
)


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


async def activate_totp(*, session: AsyncSession, user: User, code: str) -> bool:
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
    await session.commit()
    await session.refresh(user)
    return True


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
