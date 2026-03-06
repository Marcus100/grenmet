from unittest.mock import patch

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.auth.utils import verify_password
from src.config import settings
from src.email import generate_password_reset_token
from tests.utils.user import user_authentication_headers_async
from tests.utils.utils import random_email, random_lower_string


async def test_get_access_token(async_client: httpx.AsyncClient) -> None:
    """Test successful login with correct credentials."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = await async_client.post(
        f"{settings.API_V1_STR}/login/access-token", data=login_data
    )
    tokens = r.json()
    assert r.status_code == 200
    assert "access_token" in tokens
    assert tokens["access_token"]


async def test_get_access_token_incorrect_password(
    async_client: httpx.AsyncClient,
) -> None:
    """Test login failure with incorrect password."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": "incorrect",
    }
    r = await async_client.post(
        f"{settings.API_V1_STR}/login/access-token", data=login_data
    )
    assert r.status_code == 400


async def test_use_access_token(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test token validation endpoint."""
    r = await async_client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers=superuser_token_headers_async,
    )
    result = r.json()
    assert r.status_code == 200
    assert "email" in result


async def test_recovery_password(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    """Test password recovery email sending."""
    with (
        patch("src.email.send_email", return_value=None),
        patch("smtplib.SMTP") as mock_smtp,
        patch("src.email_config.email_settings.SMTP_HOST", "smtp.weather.gd"),
        patch("src.email_config.email_settings.SMTP_USER", "admin@weather.gd"),
    ):
        mock_server = mock_smtp.return_value
        mock_server.send_message.return_value = {}

        email = "test@weather.gd"
        r = await async_client.post(
            f"{settings.API_V1_STR}/password-recovery/{email}",
            headers=normal_user_token_headers_async,
        )
        assert r.status_code == 200
        assert r.json() == {"message": "Password recovery email sent"}


async def test_recovery_password_user_not_exists(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    """Test password recovery for non-existent user."""
    email = "jVgQr@weather.gd"
    r = await async_client.post(
        f"{settings.API_V1_STR}/password-recovery/{email}",
        headers=normal_user_token_headers_async,
    )
    assert r.status_code == 404


async def test_reset_password(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Test password reset with valid token."""
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()

    user_create = UserCreate(
        email=email,
        username=email.split("@")[0],
        password=password,
        first_name="Test",
        last_name="User",
        is_active=True,
        is_superuser=False,
    )
    user = await create_user(session=db_async, user_create=user_create)
    token = generate_password_reset_token(email=email)
    headers = await user_authentication_headers_async(
        client=async_client, email=email, password=password
    )
    data = {"new_password": new_password, "token": token}

    r = await async_client.post(
        f"{settings.API_V1_STR}/reset-password/",
        headers=headers,
        json=data,
    )

    assert r.status_code == 200
    assert r.json() == {"message": "Password updated successfully"}

    await db_async.refresh(user)
    assert verify_password(new_password, user.hashed_password)


async def test_reset_password_invalid_token(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test password reset with invalid token."""
    data = {"new_password": "changethis", "token": "invalid"}
    r = await async_client.post(
        f"{settings.API_V1_STR}/reset-password/",
        headers=superuser_token_headers_async,
        json=data,
    )
    response = r.json()

    assert "detail" in response
    assert r.status_code == 400
    assert response["detail"] == "Invalid token"
