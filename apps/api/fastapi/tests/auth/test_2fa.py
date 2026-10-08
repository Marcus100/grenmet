"""Two-factor authentication tests: TOTP helpers, enrollment service, login enforcement."""

import httpx
import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service, totp
from src.auth.config import auth_settings
from src.auth.totp import generate_secret, verify_code
from tests.factories import make_user


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


def test_verify_code_accepts_valid_and_rejects_invalid() -> None:
    secret = generate_secret()
    assert verify_code(secret=secret, code=pyotp.TOTP(secret).now()) is True
    assert verify_code(secret=secret, code="000000") is False
    assert verify_code(secret=secret, code="") is False
    assert verify_code(secret="", code="123456") is False


async def test_enrollment_flow(db_async: AsyncSession) -> None:
    user = await make_user(db_async)

    secret = await service.begin_totp_setup(session=db_async, user=user)
    assert user.totp_secret != secret
    assert totp.is_encrypted(user.totp_secret)
    assert totp.decrypt_secret(user.totp_secret) == secret
    assert user.totp_enabled is False

    # Wrong code does not activate.
    assert (
        await service.activate_totp(session=db_async, user=user, code="000000") is False
    )
    assert user.totp_enabled is False

    # Correct code activates.
    code = pyotp.TOTP(secret).now()
    assert await service.activate_totp(session=db_async, user=user, code=code) is True
    assert user.totp_enabled is True

    await service.disable_totp(session=db_async, user=user)
    assert user.totp_enabled is False
    assert user.totp_secret is None


async def test_login_requires_totp_when_enabled(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled = True
    db_async.add(user)
    await db_async.commit()

    no_code = await async_client.post(
        "/api/v1/login/session",
        json={"email": user.email, "password": "password123"},
    )
    assert no_code.status_code == 400

    with_code = await async_client.post(
        "/api/v1/login/session",
        json={
            "email": user.email,
            "password": "password123",
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert with_code.status_code == 200
