"""Wrong authenticator codes count on the factor key, never the password key (#1544).

Covers the sign-in authenticator step and recovery-code replacement. Both lockouts use
an in-memory fakeredis, so no Redis is needed.
"""

import pyotp
import pytest
from cryptography.fernet import Fernet
from fakeredis import FakeAsyncRedis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import account_security, totp
from src.auth.app_service import _require_totp
from src.auth.config import auth_settings
from src.auth.lockout import factor_lockout, login_lockout
from src.auth.models import User
from src.exceptions import AppException
from src.rate_limit import limiter
from tests.factories import make_user

SESSIONS = "/api/v1/auth/sessions"
PASSWORD = "password123"


@pytest.fixture(autouse=True)
def in_memory_lockouts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    for lock in (login_lockout, factor_lockout):
        monkeypatch.setattr(lock, "_client", FakeAsyncRedis(decode_responses=True))
        monkeypatch.setattr(lock, "_enabled", True)


@pytest.fixture
def attempts() -> int:
    return auth_settings.LOGIN_MAX_FAILED_ATTEMPTS


async def _user(db: AsyncSession) -> tuple[User, str]:
    user = await make_user(db)
    secret = pyotp.random_base32()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = True
    db.add(user)
    await db.commit()
    return user, secret


async def _factor_locked_rows(db: AsyncSession, user: User) -> list[AuditEntry]:
    return list(
        (
            await db.execute(
                select(AuditEntry).where(
                    AuditEntry.record_type == "account_security",
                    AuditEntry.record_id == str(user.id),
                    AuditEntry.action == "factor_locked",
                )
            )
        )
        .scalars()
        .all()
    )


async def test_right_password_wrong_code_leaves_password_counter_alone(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, _ = await _user(db_async)
    for _ in range(attempts - 1):
        response = await async_client.post(
            SESSIONS,
            json={"email": user.email, "password": PASSWORD, "totp_code": "000000"},
        )
        assert response.status_code == 400
    assert await login_lockout.is_locked(user.email) is False
    assert await login_lockout._client.get(login_lockout._fail_key(user.email)) is None


async def test_ten_wrong_codes_lock_the_factor_at_sign_in(
    db_async: AsyncSession, attempts: int
) -> None:
    user, _ = await _user(db_async)
    for _ in range(attempts):
        with pytest.raises(AppException) as error:
            await _require_totp(db_async, user, "000000")
        assert error.value.status_code == 400
    assert await factor_lockout.is_locked(str(user.id)) is True
    assert await login_lockout.is_locked(user.email) is False
    with pytest.raises(AppException) as locked:
        await _require_totp(db_async, user, "000000")
    assert locked.value.status_code == 429
    assert len(await _factor_locked_rows(db_async, user)) == 1


async def test_wrong_recovery_replacement_codes_cannot_lock_password_sign_in(
    db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _user(db_async)
    for _ in range(attempts):
        with pytest.raises(AppException) as error:
            await account_security.new_recovery_codes(
                db_async, user, PASSWORD, "000000"
            )
        assert error.value.status_code == 400
    assert await factor_lockout.is_locked(str(user.id)) is True
    assert await login_lockout.is_locked(user.email) is False
    assert len(await _factor_locked_rows(db_async, user)) == 1
    with pytest.raises(AppException) as locked:
        await account_security.new_recovery_codes(
            db_async, user, PASSWORD, pyotp.TOTP(secret).now()
        )
    assert locked.value.status_code == 429
