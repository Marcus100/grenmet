"""Recovery codes for accounts that sign in only with email codes (ADR-0059 rule 3).

An account with no usable password (``password_setup_pending``, a random hash nobody
knows) proves itself with a live authenticator code alone. An account that has a
password still needs the password as well. Codes are shown once and stored only as
hashes; no audit entry carries a code.
"""

import secrets
from datetime import timedelta

import httpx
import pyotp
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import account_security
from src.auth.models import User
from src.auth.utils import create_access_token, get_password_hash_async
from src.exceptions import AppException
from src.rate_limit import limiter
from tests.factories import make_user


async def make_email_only_user(db: AsyncSession) -> tuple[User, str]:
    """An email-code account: no password anyone knows, authenticator enrolled."""
    user = await make_user(db)
    secret = pyotp.random_base32()
    user.hashed_password = await get_password_hash_async(secrets.token_urlsafe(32))
    user.password_setup_pending = True
    user.totp_enabled = True
    user.totp_secret = secret
    db.add(user)
    await db.commit()
    return user, secret


async def make_password_user(db: AsyncSession) -> tuple[User, str]:
    """A password account with an enrolled authenticator."""
    user = await make_user(db)
    secret = pyotp.random_base32()
    user.totp_enabled = True
    user.totp_secret = secret
    db.add(user)
    await db.commit()
    return user, secret


async def recovery_audit_rows(db: AsyncSession, user: User) -> list[AuditEntry]:
    return list(
        (
            await db.execute(
                select(AuditEntry).where(
                    AuditEntry.record_type == "account_security",
                    AuditEntry.record_id == str(user.id),
                )
            )
        )
        .scalars()
        .all()
    )


async def test_email_only_account_creates_codes_with_authenticator_code_alone(
    db_async: AsyncSession,
) -> None:
    user, secret = await make_email_only_user(db_async)
    codes = await account_security.new_recovery_codes(
        db_async, user, None, pyotp.TOTP(secret).now()
    )
    assert len(codes) == 8
    assert len(user.mfa_recovery_hashes) == 8
    assert all(code not in user.mfa_recovery_hashes for code in codes)
    rows = await recovery_audit_rows(db_async, user)
    assert [row.action for row in rows] == ["recovery_replaced"]


async def test_email_only_account_ignores_a_password_value(
    db_async: AsyncSession,
) -> None:
    # No password exists to check, so a value sent for one changes nothing.
    user, secret = await make_email_only_user(db_async)
    codes = await account_security.new_recovery_codes(
        db_async, user, "anything at all", pyotp.TOTP(secret).now()
    )
    assert len(codes) == 8


async def test_email_only_account_refuses_a_wrong_authenticator_code(
    db_async: AsyncSession,
) -> None:
    user, _ = await make_email_only_user(db_async)
    with pytest.raises(AppException) as error:
        await account_security.new_recovery_codes(db_async, user, None, "000000")
    assert error.value.status_code == 400
    assert user.mfa_recovery_hashes == []
    assert await recovery_audit_rows(db_async, user) == []


async def test_email_only_account_without_authenticator_is_refused(
    db_async: AsyncSession,
) -> None:
    user, secret = await make_email_only_user(db_async)
    user.totp_enabled = False
    db_async.add(user)
    await db_async.commit()
    with pytest.raises(AppException) as error:
        await account_security.new_recovery_codes(
            db_async, user, None, pyotp.TOTP(secret).now()
        )
    assert error.value.status_code == 400
    assert user.mfa_recovery_hashes == []


async def test_password_account_still_needs_its_password(
    db_async: AsyncSession,
) -> None:
    user, secret = await make_password_user(db_async)
    with pytest.raises(AppException):
        await account_security.new_recovery_codes(
            db_async, user, None, pyotp.TOTP(secret).now()
        )
    with pytest.raises(AppException):
        await account_security.new_recovery_codes(
            db_async, user, "not-the-password", pyotp.TOTP(secret).now()
        )
    assert user.mfa_recovery_hashes == []
    codes = await account_security.new_recovery_codes(
        db_async, user, "password123", pyotp.TOTP(secret).now()
    )
    assert len(codes) == 8


async def test_replacing_codes_cancels_the_old_set(db_async: AsyncSession) -> None:
    user, secret = await make_email_only_user(db_async)
    first = await account_security.new_recovery_codes(
        db_async, user, None, pyotp.TOTP(secret).now()
    )
    second = await account_security.new_recovery_codes(
        db_async, user, None, pyotp.TOTP(secret).now()
    )
    assert not await account_security.verify_factor(db_async, user, first[0])
    assert await account_security.verify_factor(db_async, user, second[0])


async def test_audit_rows_never_carry_a_code(db_async: AsyncSession) -> None:
    user, secret = await make_email_only_user(db_async)
    codes = await account_security.new_recovery_codes(
        db_async, user, None, pyotp.TOTP(secret).now()
    )
    await db_async.commit()
    rows = await recovery_audit_rows(db_async, user)
    rendered = repr([(row.action, row.changes) for row in rows])
    assert all(code not in rendered for code in codes)


async def test_api_email_only_account_gets_codes_without_password(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user, secret = await make_email_only_user(db_async)
    headers = {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }
    response = await async_client.post(
        "/api/v1/auth/users/me/security/recovery-codes",
        headers=headers,
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert response.status_code == 200
    assert len(response.json()["codes"]) == 8


async def test_api_email_only_account_wrong_code_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user, _ = await make_email_only_user(db_async)
    headers = {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }
    response = await async_client.post(
        "/api/v1/auth/users/me/security/recovery-codes",
        headers=headers,
        json={"code": "000000"},
    )
    assert response.status_code == 400
    assert "codes" not in response.json()


async def test_api_password_account_needs_password_in_request(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user, secret = await make_password_user(db_async)
    headers = {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }
    response = await async_client.post(
        "/api/v1/auth/users/me/security/recovery-codes",
        headers=headers,
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert response.status_code == 400
    response = await async_client.post(
        "/api/v1/auth/users/me/security/recovery-codes",
        headers=headers,
        json={"password": "password123", "code": pyotp.TOTP(secret).now()},
    )
    assert response.status_code == 200


async def test_api_recovery_codes_route_keeps_its_rate_limit(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, _ = await make_email_only_user(db_async)
    headers = {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }
    monkeypatch.setattr(limiter, "enabled", True)
    statuses = []
    for _ in range(6):
        response = await async_client.post(
            "/api/v1/auth/users/me/security/recovery-codes",
            headers=headers,
            json={"code": "000000"},
        )
        statuses.append(response.status_code)
    assert statuses[-1] == 429


class CountingLockout:
    """In-memory stand-in for ``login_lockout`` (the real one needs Redis)."""

    def __init__(self, max_attempts: int) -> None:
        self.max_attempts = max_attempts
        self.failures: dict[str, int] = {}

    async def is_locked(self, identifier: str) -> bool:
        return self.failures.get(identifier, 0) >= self.max_attempts

    async def record_failure(self, identifier: str) -> None:
        self.failures[identifier] = self.failures.get(identifier, 0) + 1

    async def reset(self, identifier: str) -> None:
        self.failures.pop(identifier, None)


async def test_wrong_codes_lock_recovery_code_replacement(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A stolen email-code session gets only a few TOTP guesses (ADR-0059 rule 3)."""
    lockout = CountingLockout(max_attempts=3)
    monkeypatch.setattr(account_security, "login_lockout", lockout)
    user, secret = await make_email_only_user(db_async)
    for _ in range(3):
        with pytest.raises(AppException) as refused:
            await account_security.new_recovery_codes(db_async, user, None, "000000")
        assert refused.value.status_code == 400
    with pytest.raises(AppException) as locked:
        await account_security.new_recovery_codes(
            db_async, user, None, pyotp.TOTP(secret).now()
        )
    assert locked.value.status_code == 429
    assert user.mfa_recovery_hashes == []


async def test_successful_replacement_clears_the_failure_count(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    lockout = CountingLockout(max_attempts=3)
    monkeypatch.setattr(account_security, "login_lockout", lockout)
    user, secret = await make_email_only_user(db_async)
    for _ in range(2):
        with pytest.raises(AppException):
            await account_security.new_recovery_codes(db_async, user, None, "000000")
    codes = await account_security.new_recovery_codes(
        db_async, user, None, pyotp.TOTP(secret).now()
    )
    assert len(codes) == 8
    assert lockout.failures.get(user.email, 0) == 0


async def test_wrong_password_counts_as_a_failure_too(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    lockout = CountingLockout(max_attempts=2)
    monkeypatch.setattr(account_security, "login_lockout", lockout)
    user, secret = await make_password_user(db_async)
    for _ in range(2):
        with pytest.raises(AppException):
            await account_security.new_recovery_codes(
                db_async, user, "wrong", pyotp.TOTP(secret).now()
            )
    with pytest.raises(AppException) as locked:
        await account_security.new_recovery_codes(
            db_async, user, "password123", pyotp.TOTP(secret).now()
        )
    assert locked.value.status_code == 429
