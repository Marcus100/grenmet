"""Signed-in proofs lock after repeated wrong guesses (issue #1533).

Activating an authenticator (a code), disabling two-step verification (a password and
a code) and changing the password (the current password) each count wrong proofs per
account, with the sign-in thresholds. A wrong password counts on the sign-in key for the
account email, as ``email_change`` does. A wrong authenticator code counts on its own key
(``lockout.factor_lockout``, by account id), so it never locks password sign-in.

Both keys are swapped for an in-memory fakeredis, so these tests need no Redis, like the
other lockout tests. The per-route limiter is off here, so the lock is the only limit.
"""

from datetime import timedelta

import pyotp
import pytest
from cryptography.fernet import Fernet
from fakeredis import FakeAsyncRedis
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import totp
from src.auth.config import auth_settings
from src.auth.lockout import LoginLockout, factor_lockout, login_lockout
from src.auth.models import User
from src.auth.utils import create_access_token
from src.rate_limit import limiter
from tests.factories import make_user

TWOFA = "/api/v1/auth/users/me/security/2fa"
PASSWORD = "/api/v1/auth/users/me/password"
SESSIONS = "/api/v1/auth/sessions"
CURRENT = "password123"
WRONG = "wrong-password-1"
NEW = "a-brand-new-password-1"
LATER = "another-new-password-2"
LOCKED = "Account temporarily locked due to repeated failed logins"


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
    """The number of wrong proofs that lock (the sign-in threshold)."""
    return auth_settings.LOGIN_MAX_FAILED_ATTEMPTS


def _headers(user: User) -> dict[str, str]:
    return {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }


async def _with_authenticator(
    db: AsyncSession, *, enabled: bool = True
) -> tuple[User, str]:
    user = await make_user(db)
    secret = pyotp.random_base32()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = enabled
    db.add(user)
    await db.commit()
    return user, secret


def _wrong_code(secret: str) -> str:
    right = pyotp.TOTP(secret).now()
    return "000000" if right != "000000" else "111111"


def _is_locked(response) -> bool:
    return response.status_code == 429 and response.json()["detail"] == LOCKED


# --- Activate (wrong authenticator code) -----------------------------------------


async def test_wrong_codes_lock_activation_even_with_the_right_code(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _with_authenticator(db_async, enabled=False)
    body = {"code": _wrong_code(secret)}
    for _ in range(attempts):
        response = await async_client.post(
            f"{TWOFA}/activate", headers=_headers(user), json=body
        )
        assert response.status_code == 400
    right = {"code": pyotp.TOTP(secret).now()}
    locked = await async_client.post(
        f"{TWOFA}/activate", headers=_headers(user), json=right
    )
    assert _is_locked(locked)
    await db_async.refresh(user)
    assert user.totp_enabled is False


async def test_a_right_code_before_the_limit_clears_the_count(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _with_authenticator(db_async, enabled=False)
    for _ in range(attempts - 1):
        await async_client.post(
            f"{TWOFA}/activate",
            headers=_headers(user),
            json={"code": _wrong_code(secret)},
        )
    right = await async_client.post(
        f"{TWOFA}/activate",
        headers=_headers(user),
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert right.status_code == 200
    # Back to a pending setup: the earlier wrong guesses must not count again.
    await db_async.refresh(user)
    user.totp_enabled = False
    db_async.add(user)
    await db_async.commit()
    for _ in range(attempts - 1):
        response = await async_client.post(
            f"{TWOFA}/activate",
            headers=_headers(user),
            json={"code": _wrong_code(secret)},
        )
        assert response.status_code == 400


async def test_activation_lock_does_not_block_another_account(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    alice, alice_secret = await _with_authenticator(db_async, enabled=False)
    bob, bob_secret = await _with_authenticator(db_async, enabled=False)
    for _ in range(attempts):
        await async_client.post(
            f"{TWOFA}/activate",
            headers=_headers(alice),
            json={"code": _wrong_code(alice_secret)},
        )
    bob_response = await async_client.post(
        f"{TWOFA}/activate",
        headers=_headers(bob),
        json={"code": pyotp.TOTP(bob_secret).now()},
    )
    assert bob_response.status_code == 200


async def test_wrong_authenticator_codes_do_not_lock_password_sign_in(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _with_authenticator(db_async, enabled=False)
    for _ in range(attempts):
        await async_client.post(
            f"{TWOFA}/activate",
            headers=_headers(user),
            json={"code": _wrong_code(secret)},
        )
    assert await login_lockout.is_locked(user.email) is False
    sign_in = await async_client.post(
        SESSIONS, json={"email": user.email, "password": CURRENT}
    )
    assert sign_in.status_code == 200


# --- Disable (password and authenticator code) -----------------------------------


async def test_wrong_passwords_lock_disable_even_with_the_right_proof(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _with_authenticator(db_async)
    for _ in range(attempts):
        response = await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": WRONG, "code": _wrong_code(secret)},
        )
        assert response.status_code == 400
    right = await async_client.post(
        f"{TWOFA}/disable",
        headers=_headers(user),
        json={"password": CURRENT, "code": pyotp.TOTP(secret).now()},
    )
    assert _is_locked(right)
    await db_async.refresh(user)
    assert user.totp_enabled is True


async def test_wrong_codes_lock_disable_even_with_the_right_proof(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _with_authenticator(db_async)
    for _ in range(attempts):
        response = await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": CURRENT, "code": _wrong_code(secret)},
        )
        assert response.status_code == 400
    right = await async_client.post(
        f"{TWOFA}/disable",
        headers=_headers(user),
        json={"password": CURRENT, "code": pyotp.TOTP(secret).now()},
    )
    assert _is_locked(right)
    await db_async.refresh(user)
    assert user.totp_enabled is True


async def test_wrong_disable_codes_spend_the_code_budget_not_the_password_counter(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    """Wrong codes leave the password counter alone but spend the one code budget.

    Accepted trade-off (#1544): each account has a single code budget, so wrong codes
    on signed-in routes also pause authenticator sign-in for the lock period (15
    minutes). A stolen session is already revocable, and password sign-in is not
    counted.
    """
    user, secret = await _with_authenticator(db_async)
    for _ in range(attempts):
        await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": CURRENT, "code": _wrong_code(secret)},
        )
    assert await login_lockout.is_locked(user.email) is False
    sign_in = await async_client.post(
        SESSIONS,
        json={
            "email": user.email,
            "password": CURRENT,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert _is_locked(sign_in)


async def test_wrong_passwords_on_disable_lock_password_sign_in(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    """The password key is the sign-in key: a stolen session cannot guess freely."""
    user, secret = await _with_authenticator(db_async)
    for _ in range(attempts):
        await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": WRONG, "code": _wrong_code(secret)},
        )
    sign_in = await async_client.post(
        SESSIONS,
        json={
            "email": user.email,
            "password": CURRENT,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert _is_locked(sign_in)


async def test_a_right_proof_before_the_limit_clears_the_count_on_disable(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user, secret = await _with_authenticator(db_async)
    for _ in range(attempts - 1):
        await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": CURRENT, "code": _wrong_code(secret)},
        )
    right = await async_client.post(
        f"{TWOFA}/disable",
        headers=_headers(user),
        json={"password": CURRENT, "code": pyotp.TOTP(secret).now()},
    )
    assert right.status_code == 200
    # Enrol again: the earlier wrong codes must not count toward a new lock.
    secret = pyotp.random_base32()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = True
    db_async.add(user)
    await db_async.commit()
    for _ in range(attempts - 1):
        response = await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(user),
            json={"password": CURRENT, "code": _wrong_code(secret)},
        )
        assert response.status_code == 400


async def test_disable_lock_does_not_block_another_account(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    alice, alice_secret = await _with_authenticator(db_async)
    bob, bob_secret = await _with_authenticator(db_async)
    for _ in range(attempts):
        await async_client.post(
            f"{TWOFA}/disable",
            headers=_headers(alice),
            json={"password": CURRENT, "code": _wrong_code(alice_secret)},
        )
    bob_response = await async_client.post(
        f"{TWOFA}/disable",
        headers=_headers(bob),
        json={"password": CURRENT, "code": pyotp.TOTP(bob_secret).now()},
    )
    assert bob_response.status_code == 200


# --- Password change (current password) ------------------------------------------


async def test_wrong_passwords_lock_password_change_even_with_the_right_one(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    user = await make_user(db_async)
    before = user.hashed_password
    for _ in range(attempts):
        response = await async_client.patch(
            PASSWORD,
            headers=_headers(user),
            json={"current_password": WRONG, "new_password": NEW},
        )
        assert response.status_code == 400
    right = await async_client.patch(
        PASSWORD,
        headers=_headers(user),
        json={"current_password": CURRENT, "new_password": NEW},
    )
    assert _is_locked(right)
    await db_async.refresh(user)
    assert user.hashed_password == before


async def test_wrong_passwords_lock_password_sign_in_too(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    """A wrong current password counts on the same key password sign-in uses."""
    user = await make_user(db_async)
    for _ in range(attempts):
        await async_client.patch(
            PASSWORD,
            headers=_headers(user),
            json={"current_password": WRONG, "new_password": NEW},
        )
    sign_in = await async_client.post(
        SESSIONS, json={"email": user.email, "password": CURRENT}
    )
    assert _is_locked(sign_in)


async def test_a_right_password_does_not_clear_the_count(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    """The sign-in key also counts wrong authenticator codes elsewhere, so a
    session holder who knows the password must not be able to reset it here,
    whether the change goes through or is refused as unchanged."""
    user = await make_user(db_async)
    for _ in range(attempts - 1):
        await async_client.patch(
            PASSWORD,
            headers=_headers(user),
            json={"current_password": WRONG, "new_password": NEW},
        )
    unchanged = await async_client.patch(
        PASSWORD,
        headers=_headers(user),
        json={"current_password": CURRENT, "new_password": CURRENT},
    )
    # Refused as unchanged (400), or earlier by the new-password rules (422).
    assert unchanged.status_code in {400, 422}
    changed = await async_client.patch(
        PASSWORD,
        headers=_headers(user),
        json={"current_password": CURRENT, "new_password": NEW},
    )
    assert changed.status_code == 200
    # One more wrong guess reaches the limit: the earlier ones still count.
    await async_client.patch(
        PASSWORD,
        headers=_headers(user),
        json={"current_password": WRONG, "new_password": LATER},
    )
    locked = await async_client.patch(
        PASSWORD,
        headers=_headers(user),
        json={"current_password": NEW, "new_password": LATER},
    )
    assert _is_locked(locked)


async def test_password_change_lock_does_not_block_another_account(
    async_client, db_async: AsyncSession, attempts: int
) -> None:
    alice = await make_user(db_async)
    bob = await make_user(db_async)
    for _ in range(attempts):
        await async_client.patch(
            PASSWORD,
            headers=_headers(alice),
            json={"current_password": WRONG, "new_password": NEW},
        )
    bob_response = await async_client.patch(
        PASSWORD,
        headers=_headers(bob),
        json={"current_password": CURRENT, "new_password": NEW},
    )
    assert bob_response.status_code == 200


@pytest.mark.asyncio
async def test_record_failure_sets_the_ttl_with_the_count() -> None:
    """The counter and its TTL are written in one transaction (never a key without a TTL)."""
    client = FakeAsyncRedis(decode_responses=True)
    lockout = LoginLockout(
        redis_url=None,
        client=client,
        max_attempts=2,
        lockout_seconds=60,
        window_seconds=30,
    )
    assert await lockout.record_failure("a@x.test") is False
    assert 0 < await client.ttl("login:fail:a@x.test") <= 30
    assert await lockout.record_failure("a@x.test") is True
    assert await lockout.record_failure("a@x.test") is False
    assert await client.get("login:fail:a@x.test") == "3"


@pytest.mark.asyncio
async def test_record_failure_sets_the_ttl_with_the_count() -> None:
    """The counter and its TTL are written in one transaction (no key without a TTL)."""
    from fakeredis import FakeAsyncRedis

    client = FakeAsyncRedis(decode_responses=True)
    lockout = LoginLockout(
        redis_url=None,
        client=client,
        max_attempts=2,
        lockout_seconds=60,
        window_seconds=30,
    )
    assert await lockout.record_failure("a@x.test") is False
    assert 0 < await client.ttl("login:fail:a@x.test") <= 30
    assert await lockout.record_failure("a@x.test") is True
    assert await lockout.record_failure("a@x.test") is False
    assert await client.get("login:fail:a@x.test") == "3"
