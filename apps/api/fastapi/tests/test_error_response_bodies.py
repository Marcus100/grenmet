"""Runtime error bodies, pinned so the OpenAPI error models stay truthful.

Most error responses are ``{"detail": "<string>"}`` (ApiError). Two shapes differ
and are documented as such: the rate limiter answers ``{"error": "..."}``
(ErrorMessage), and the public weather product feed answers ``{"error": "..."}``
(ProductFeedError). A 429 can come from either the rate limiter or an
application lockout, so its documented model is the union of both.
"""

import uuid

import httpx
import pytest

from src.config import settings
from src.rate_limit import limiter


def _detail_body(response: httpx.Response) -> None:
    body = response.json()
    assert set(body) == {"detail"}, body
    assert isinstance(body["detail"], str), body


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_missing_token_returns_detail_string(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(f"{settings.API_V1_STR}/auth/users/me")
    assert response.status_code == 401
    _detail_body(response)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_insufficient_privilege_returns_detail_string(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/users",
        headers=normal_user_token_headers_async,
    )
    assert response.status_code == 403
    _detail_body(response)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_unknown_resource_returns_detail_string(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/users/{uuid.uuid4()}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 404
    _detail_body(response)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_bad_credentials_return_detail_string(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.post(
        f"{settings.API_V1_STR}/auth/token",
        data={"username": "nobody@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 400
    _detail_body(response)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_conflicting_email_returns_detail_string(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    normal_user_token_headers_async: dict[str, str],
) -> None:
    # The normal user already exists; moving the superuser onto its email conflicts.
    me = await async_client.get(
        f"{settings.API_V1_STR}/auth/users/me",
        headers=normal_user_token_headers_async,
    )
    assert me.status_code == 200
    response = await async_client.patch(
        f"{settings.API_V1_STR}/auth/users/{me.json()['id']}",
        headers=superuser_token_headers_async,
        json={"email": str(settings.FIRST_SUPERUSER)},
    )
    assert response.status_code == 409
    _detail_body(response)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_rate_limiter_returns_error_key(async_client: httpx.AsyncClient) -> None:
    """slowapi answers 429 with ``{"error": ...}``, not ``detail``."""
    limiter.enabled = True
    try:
        limiter.reset()
        response: httpx.Response | None = None
        # Distinct usernames keep the per-account lockout out of the way; the
        # per-address limit (10/minute on /auth/token) is what trips.
        for index in range(11):
            response = await async_client.post(
                f"{settings.API_V1_STR}/auth/token",
                data={"username": f"ratelimit-{index}@example.com", "password": "x"},
            )
        assert response is not None
        assert response.status_code == 429
        body = response.json()
        assert set(body) == {"error"}, body
        assert isinstance(body["error"], str)
    finally:
        limiter.reset()
        limiter.enabled = False


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_weather_feed_rejects_unknown_kind_with_error_key(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(
        f"{settings.API_V1_STR}/wxproducts/public/products",
        params={"kind": "not-a-product"},
    )
    assert response.status_code == 400
    assert response.json() == {"error": "Unknown product type"}


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_account_lockout_429_returns_detail_string(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An application lockout is HTTPException 429 with ``detail``, not the limiter's ``error``."""
    from src.auth.lockout import login_lockout

    async def locked(_identifier: str) -> bool:
        return True

    monkeypatch.setattr(login_lockout, "is_locked", locked)
    response = await async_client.post(
        f"{settings.API_V1_STR}/auth/token",
        data={"username": "locked@example.com", "password": "x"},
    )
    assert response.status_code == 429
    _detail_body(response)
    assert response.json() == {
        "detail": "Account temporarily locked due to repeated failed logins"
    }
