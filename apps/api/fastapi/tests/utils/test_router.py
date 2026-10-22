"""Tests for utils router."""

import logging
from unittest.mock import patch

import asyncpg
import httpx
import pytest
from sqlalchemy.exc import OperationalError

from src.config import settings


async def test_health_check_async(async_client: httpx.AsyncClient) -> None:
    """Async test for health check (pattern for future async integration tests)."""
    response = await async_client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert response.status_code == 200
    assert response.json() is True


@patch("src.utils.router.send_email")
async def test_test_email(
    mock_send_email,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test email testing endpoint."""
    mock_send_email.return_value = None

    email_to = "test@example.com"
    response = await async_client.post(
        f"{settings.API_V1_STR}/utils/test-email/?email_to={email_to}",
        headers=superuser_token_headers_async,
    )

    assert response.status_code == 201
    content = response.json()
    assert "message" in content

    mock_send_email.assert_called_once()
    call_args = mock_send_email.call_args
    assert call_args.kwargs["email_to"] == email_to
    assert "subject" in call_args.kwargs
    assert "html_content" in call_args.kwargs


async def test_ready_ok(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get(f"{settings.API_V1_STR}/utils/ready/")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_ready_schema_mismatch_is_503(async_client: httpx.AsyncClient) -> None:
    """Expected not-ready: same 503 body, returned (not raised) so Sentry is quiet."""
    with patch("src.utils.router._migration_heads", return_value=frozenset({"x"})):
        response = await async_client.get(f"{settings.API_V1_STR}/utils/ready/")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unreachable"}


@pytest.mark.parametrize(
    "error",
    [
        OperationalError("select 1", {}, Exception("postgresql://u:pw@db/x")),
        asyncpg.exceptions.CannotConnectNowError("starting up"),
        asyncpg.exceptions.TooManyConnectionsError("too many"),
        asyncpg.exceptions.InvalidPasswordError("bad password"),
        asyncpg.exceptions.InterfaceError("closed"),
        ConnectionRefusedError("refused"),
        TimeoutError("timed out"),
    ],
    ids=lambda e: type(e).__name__,
)
async def test_ready_expected_failures_are_503_and_not_reported(
    async_client: httpx.AsyncClient,
    caplog: pytest.LogCaptureFixture,
    error: Exception,
) -> None:
    """Expected outages answer 503, are not re-raised and never reach Sentry."""
    with (
        caplog.at_level(logging.WARNING, logger="src.utils.router"),
        patch("src.utils.router._migration_heads", side_effect=error),
        patch("sentry_sdk.capture_exception") as capture,
    ):
        response = await async_client.get(f"{settings.API_V1_STR}/utils/ready/")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unreachable"}
    capture.assert_not_called()
    messages = [r.getMessage() for r in caplog.records if r.name == "src.utils.router"]
    assert messages == [f"Readiness check failed: {type(error).__name__}"]
    assert "postgresql" not in messages[0]


async def test_ready_unexpected_exception_still_propagates(
    async_client: httpx.AsyncClient,
) -> None:
    """A genuine bug must stay an exception (reported 500), not hidden as 503."""
    with (
        patch("src.utils.router._migration_heads", side_effect=ValueError("bug")),
        pytest.raises(ValueError, match="bug"),
    ):
        await async_client.get(f"{settings.API_V1_STR}/utils/ready/")
