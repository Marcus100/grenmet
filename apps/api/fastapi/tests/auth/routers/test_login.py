from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
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


def test_create_persisted_session(client: TestClient) -> None:
    """Test session-backed login for web clients."""
    response = client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "admin-gms",
        },
    )
    payload = response.json()

    assert response.status_code == 200
    assert payload["session_token"]
    assert payload["access_token"]
    assert payload["session"]["app_name"] == "admin-gms"
    assert payload["session"]["client_type"] == "web"
    assert payload["user"]["email"] == settings.FIRST_SUPERUSER


def test_exchange_session_for_access_token(client: TestClient) -> None:
    """Test exchanging a persisted session for a short-lived access token."""
    login_response = client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "admin-gms",
        },
    )
    session_token = login_response.json()["session_token"]

    exchange_response = client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": session_token},
    )
    exchange_payload = exchange_response.json()

    assert exchange_response.status_code == 200
    assert exchange_payload["access_token"]

    me_response = client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers={"Authorization": f"Bearer {exchange_payload['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == settings.FIRST_SUPERUSER


def test_refresh_session_rotates_secret(client: TestClient) -> None:
    """Test refreshing a session rotates the opaque session secret."""
    login_response = client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    old_session_token = login_response.json()["session_token"]

    refresh_response = client.post(
        f"{settings.API_V1_STR}/login/session/refresh",
        json={"session_token": old_session_token},
    )
    refresh_payload = refresh_response.json()

    assert refresh_response.status_code == 200
    assert refresh_payload["session_token"]
    assert refresh_payload["session_token"] != old_session_token

    stale_exchange_response = client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": old_session_token},
    )
    assert stale_exchange_response.status_code == 401

    fresh_exchange_response = client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": refresh_payload["session_token"]},
    )
    assert fresh_exchange_response.status_code == 200


def test_logout_revokes_session(client: TestClient) -> None:
    """Test logging out revokes the supplied session."""
    login_response = client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    session_token = login_response.json()["session_token"]

    logout_response = client.post(
        f"{settings.API_V1_STR}/login/session/logout",
        json={"session_token": session_token},
    )
    assert logout_response.status_code == 200
    assert logout_response.json()["message"] == "Signed out successfully"

    exchange_response = client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": session_token},
    )
    assert exchange_response.status_code == 401


def test_logout_all_revokes_every_session(client: TestClient) -> None:
    """Test logging out all sessions invalidates multiple active sessions for the same user."""
    first_login = client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "admin-gms",
        },
    )
    second_login = client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "wxwatch",
        },
    )
    first_session_token = first_login.json()["session_token"]
    second_session_token = second_login.json()["session_token"]

    logout_all_response = client.post(
        f"{settings.API_V1_STR}/login/session/logout-all",
        json={"session_token": first_session_token},
    )
    assert logout_all_response.status_code == 200
    assert (
        logout_all_response.json()["message"]
        == "Signed out from all sessions successfully"
    )

    first_exchange = client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": first_session_token},
    )
    second_exchange = client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": second_session_token},
    )
    assert first_exchange.status_code == 401
    assert second_exchange.status_code == 401


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
