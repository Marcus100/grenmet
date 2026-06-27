import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.auth.utils import verify_password
from src.config import settings
from src.email import generate_password_reset_token
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


async def test_create_persisted_session(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Test session-backed login for web clients."""
    _ = db_async
    response = await async_client.post(
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


async def test_exchange_session_for_access_token(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Test exchanging a persisted session for a short-lived access token."""
    _ = db_async
    login_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "admin-gms",
        },
    )
    session_token = login_response.json()["session_token"]

    exchange_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": session_token},
    )
    exchange_payload = exchange_response.json()

    assert exchange_response.status_code == 200
    assert exchange_payload["access_token"]

    me_response = await async_client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers={"Authorization": f"Bearer {exchange_payload['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == settings.FIRST_SUPERUSER


async def test_refresh_session_rotates_secret(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Test refreshing a session rotates the opaque session secret."""
    _ = db_async
    login_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    old_session_token = login_response.json()["session_token"]

    refresh_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session/refresh",
        json={"session_token": old_session_token},
    )
    refresh_payload = refresh_response.json()

    assert refresh_response.status_code == 200
    assert refresh_payload["session_token"]
    assert refresh_payload["session_token"] != old_session_token

    stale_exchange = await async_client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": old_session_token},
    )
    assert stale_exchange.status_code == 401

    fresh_exchange = await async_client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": refresh_payload["session_token"]},
    )
    assert fresh_exchange.status_code == 200


async def test_logout_revokes_session(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Test logging out revokes the supplied session."""
    _ = db_async
    login_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    session_token = login_response.json()["session_token"]

    logout_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session/logout",
        json={"session_token": session_token},
    )
    assert logout_response.status_code == 200
    assert logout_response.json()["message"] == "Signed out successfully"

    exchange_response = await async_client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": session_token},
    )
    assert exchange_response.status_code == 401


async def test_logout_all_revokes_every_session(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Test logging out all sessions invalidates multiple active sessions."""
    _ = db_async
    first_login = await async_client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "admin-gms",
        },
    )
    second_login = await async_client.post(
        f"{settings.API_V1_STR}/login/session",
        json={
            "email": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
            "app_name": "wxwatch",
        },
    )
    first_token = first_login.json()["session_token"]
    second_token = second_login.json()["session_token"]

    logout_all = await async_client.post(
        f"{settings.API_V1_STR}/login/session/logout-all",
        json={"session_token": first_token},
    )
    assert logout_all.status_code == 200
    assert logout_all.json()["message"] == "Signed out from all sessions successfully"

    first_exchange = await async_client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": first_token},
    )
    second_exchange = await async_client.post(
        f"{settings.API_V1_STR}/login/session/access-token",
        json={"session_token": second_token},
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
    r = await async_client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers=superuser_token_headers_async,
    )
    result = r.json()
    assert r.status_code == 200
    assert result["email"] == settings.FIRST_SUPERUSER


async def test_recover_password_returns_success_for_unknown_email(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Password recovery should not leak whether an email exists."""
    r = await async_client.post(
        f"{settings.API_V1_STR}/password-recovery/nonexistent@example.com",
        headers=superuser_token_headers_async,
    )
    assert r.status_code == 200


async def test_reset_password_invalid_token(
    async_client: httpx.AsyncClient,
) -> None:
    """Reset with an invalid token returns 400."""
    r = await async_client.post(
        f"{settings.API_V1_STR}/reset-password/",
        json={"new_password": "changethis", "token": "invalid"},
    )
    assert r.status_code == 400


async def test_reset_password(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Valid reset token changes the password."""
    email = random_email()
    user = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=email,
            username=f"reset_{random_lower_string()}",
            password="oldpassword1",
            first_name="Reset",
            last_name="Test",
        ),
    )
    token = generate_password_reset_token(email=email)
    r = await async_client.post(
        f"{settings.API_V1_STR}/reset-password/",
        json={"new_password": "newpassword1", "token": token},
    )
    assert r.status_code == 200
    await db_async.refresh(user)
    assert verify_password("newpassword1", user.hashed_password)
