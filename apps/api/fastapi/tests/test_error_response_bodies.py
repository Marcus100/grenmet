"""Runtime error bodies, pinned so the OpenAPI error models stay truthful.

Most error responses are ``{"detail": "<string>"}`` (ApiError). Two shapes differ
and are documented as such: the rate limiter answers ``{"error": "..."}``
(ErrorMessage), and the public weather product feed answers ``{"error": "..."}``
(ProductFeedError). A 429 can come from either the rate limiter or an
application lockout, so its documented model is the union of both.
"""

import uuid
from typing import Any, cast

import httpx
import pytest
from fastapi import Request

from src.config import settings
from src.exceptions import AppException, AuthenticationError, app_exception_handler
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
    assert response.headers["www-authenticate"] == "Bearer"


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
    """An application lockout is an AppException 429 with ``detail``, not the limiter's ``error``."""
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


SUBMITTED_SECRET = "private-reason-that-must-not-echo"


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
@pytest.mark.parametrize(
    ("method", "path", "request_kwargs"),
    [
        pytest.param(
            "POST",
            "/contact/messages",
            {
                "content": b'{"name": "Ada", "email": ',
                "headers": {"content-type": "application/json"},
            },
            id="json-decode-error",
        ),
        pytest.param(
            "GET",
            "/auth/users",
            {"params": {"page": "not-a-number"}},
            id="bad-query-parameter",
        ),
        pytest.param(
            "GET",
            "/auth/users/not-a-uuid",
            {},
            id="bad-path-parameter",
        ),
        pytest.param(
            "POST",
            "/contact/messages",
            {
                "json": {
                    "name": "Ada",
                    "email": SUBMITTED_SECRET,
                    "subject": "Hello",
                    "message": "A message long enough to pass its own rules.",
                }
            },
            id="validator-value-error",
        ),
    ],
)
async def test_malformed_request_returns_documented_validation_shape(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    method: str,
    path: str,
    request_kwargs: dict[str, Any],
) -> None:
    """A request-validation 422 is ``ValidationErrorResponse``, never FastAPI's list.

    The ``input`` and ``ctx`` fields are never returned, so the submitted value
    is not sent back as a field. A ``msg`` may still quote a fragment of it.
    """
    extra_headers = request_kwargs.pop("headers", {})
    response = await async_client.request(
        method,
        f"{settings.API_V1_STR}{path}",
        headers={**superuser_token_headers_async, **extra_headers},
        **request_kwargs,
    )
    assert response.status_code == 422, response.text
    body = response.json()
    assert set(body) == {"detail", "errors"}, body
    assert body["detail"] == "Validation error"
    assert body["errors"], body
    for item in body["errors"]:
        assert set(item) == {"type", "loc", "msg"}, item
    assert SUBMITTED_SECRET not in response.text


async def test_app_exception_handler_passes_headers_through() -> None:
    # Typed errors that carry protocol headers (WWW-Authenticate, Retry-After,
    # Location) must send them exactly as HTTPException did.
    exc = AuthenticationError("Sign in again", headers={"WWW-Authenticate": "Bearer"})
    response = await app_exception_handler(cast(Request, None), exc)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert bytes(response.body) == b'{"detail":"Sign in again"}'


async def test_app_exception_without_headers_adds_none() -> None:
    exc = AppException("Busy", 503)
    assert exc.headers is None
    response = await app_exception_handler(cast(Request, None), exc)
    assert response.status_code == 503
    assert "www-authenticate" not in response.headers
    assert bytes(response.body) == b'{"detail":"Busy"}'
