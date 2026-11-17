"""Wrong authenticator codes count on the factor key, never the password key (#1544).

Covers the sign-in authenticator step and recovery-code replacement. Both lockouts use
an in-memory fakeredis, so no Redis is needed.
"""

from datetime import timedelta

import pyotp
import pytest
from cryptography.fernet import Fernet
from fakeredis import FakeAsyncRedis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import account_security, totp
from src.auth import modern_service as modern
from src.auth.app_service import _require_totp
from src.auth.config import auth_settings
from src.auth.lockout import factor_lockout, login_lockout
from src.auth.models import User
from src.auth.utils import create_access_token
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


LOCKED = "Account temporarily locked due to repeated failed logins"
TWOFA = "/api/v1/auth/users/me/security/2fa"


def _headers(user: User) -> dict[str, str]:
    return {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }


async def test_sessions_route_locks_on_the_tenth_wrong_code(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _user(db_async)
    for _ in range(attempts):
        response = await async_client.post(
            SESSIONS,
            json={"email": user.email, "password": PASSWORD, "totp_code": "000000"},
        )
        assert response.status_code == 400
    assert await factor_lockout.is_locked(str(user.id)) is True
    assert await login_lockout.is_locked(user.email) is False
    right = await async_client.post(
        SESSIONS,
        json={
            "email": user.email,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert right.status_code == 429
    assert right.json()["detail"] == LOCKED
    assert len(await _factor_locked_rows(db_async, user)) == 1


async def test_google_finish_locks_and_audits_wrong_codes(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _user(db_async)

    async def finish(code: str):
        token = await modern.issue(
            db_async,
            "google-login",
            user_id=user.id,
            data={"subject": "sub-1544", "email": user.email},
        )
        await db_async.commit()
        return await async_client.post(
            "/api/v1/auth/google/finish", json={"challenge": token, "totp_code": code}
        )

    for _ in range(attempts):
        assert (await finish("000000")).status_code == 400
    assert await login_lockout.is_locked(user.email) is False
    locked = await finish(pyotp.TOTP(secret).now())
    assert locked.status_code == 429
    assert len(await _factor_locked_rows(db_async, user)) == 1


async def test_google_finish_right_code_clears_the_factor_count(
    async_client, db_async: AsyncSession
) -> None:
    user, secret = await _user(db_async)
    await factor_lockout.record_failure(str(user.id))
    token = await modern.issue(
        db_async,
        "google-login",
        user_id=user.id,
        data={"subject": "sub-1544b", "email": user.email},
    )
    await db_async.commit()
    response = await async_client.post(
        "/api/v1/auth/google/finish",
        json={"challenge": token, "totp_code": pyotp.TOTP(secret).now()},
    )
    assert response.status_code == 200
    assert (
        await factor_lockout._client.get(factor_lockout._fail_key(str(user.id))) is None
    )


async def test_disable_lock_writes_one_audit_row(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, _ = await _user(db_async)
    for _ in range(attempts + 2):
        await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": PASSWORD, "code": "000000"},
        )
    assert len(await _factor_locked_rows(db_async, user)) == 1


async def test_activate_lock_writes_one_audit_row(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, _ = await _user(db_async)
    user.totp_enabled = False
    db_async.add(user)
    await db_async.commit()
    for _ in range(attempts + 2):
        await async_client.post(
            f"{TWOFA}/activate", headers=_headers(user), json={"code": "000000"}
        )
    assert len(await _factor_locked_rows(db_async, user)) == 1


async def test_record_failure_reports_the_trip_only_once(attempts: int) -> None:
    results = [await factor_lockout.record_failure("acct") for _ in range(attempts + 2)]
    assert results.count(True) == 1
    assert results[attempts - 1] is True
