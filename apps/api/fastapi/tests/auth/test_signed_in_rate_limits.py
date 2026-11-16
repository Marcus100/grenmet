"""Signed-in routes that check a password or code, or send mail, are rate limited.

Each limit counts the signed-in account (``rate_limit.account_address``), so one
person's attempts never use up another's. The numbers match the routes beside them:
codes 10 a minute (email-code verify), password or mail 5 a minute (recover and
reset password, recovery-code replacement, email-code start).
"""

from datetime import timedelta

import httpx
import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import totp
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import create_access_token
from src.rate_limit import limiter
from tests.factories import make_user

TWOFA = "/api/v1/auth/users/me/security/2fa"
PASSWORD = "/api/v1/auth/users/me/password"
WRONG_PASSWORD = "wrong-password-1"


@pytest.fixture(autouse=True)
def limits_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr(
        auth_settings,
        "AUTH_TOTP_ENCRYPTION_KEYS",
        [Fernet.generate_key().decode()],
    )


def _headers(user: User) -> dict[str, str]:
    return {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }


async def _with_authenticator(db: AsyncSession) -> tuple[User, str]:
    user = await make_user(db)
    secret = pyotp.random_base32()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = True
    db.add(user)
    await db.commit()
    return user, secret


async def test_setup_is_limited_per_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    statuses = [
        (await async_client.post(f"{TWOFA}/setup", headers=_headers(user))).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [200] * 5
    assert statuses[5] == 429


async def test_activate_is_limited_per_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    user.totp_secret = totp.encrypt_secret(pyotp.random_base32())
    db_async.add(user)
    await db_async.commit()
    statuses = [
        (
            await async_client.post(
                f"{TWOFA}/activate", headers=_headers(user), json={"code": "000000"}
            )
        ).status_code
        for _ in range(11)
    ]
    assert statuses[:10] == [400] * 10
    assert statuses[10] == 429


async def test_disable_is_limited_per_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, _ = await _with_authenticator(db_async)
    body = {"password": WRONG_PASSWORD, "code": "000000"}
    statuses = [
        (
            await async_client.post(
                f"{TWOFA}/disable", headers=_headers(user), json=body
            )
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [400] * 5
    assert statuses[5] == 429


async def test_disable_limit_does_not_block_another_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    alice, _ = await _with_authenticator(db_async)
    bob, _ = await _with_authenticator(db_async)
    body = {"password": WRONG_PASSWORD, "code": "000000"}
    for _ in range(5):
        await async_client.post(f"{TWOFA}/disable", headers=_headers(alice), json=body)
    assert (
        await async_client.post(f"{TWOFA}/disable", headers=_headers(alice), json=body)
    ).status_code == 429
    # Both accounts reach the connecting address through the same test client.
    bob_response = await async_client.post(
        f"{TWOFA}/disable", headers=_headers(bob), json=body
    )
    assert bob_response.status_code == 400


async def test_password_change_is_limited_per_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    body = {
        "current_password": WRONG_PASSWORD,
        "new_password": "a-brand-new-password-1",
    }
    statuses = [
        (
            await async_client.patch(PASSWORD, headers=_headers(user), json=body)
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [400] * 5
    assert statuses[5] == 429
