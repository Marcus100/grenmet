"""Tests for utils router."""

from unittest.mock import patch

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


async def test_ready_database_error_is_503(async_client: httpx.AsyncClient) -> None:
    with patch(
        "src.utils.router._migration_heads",
        side_effect=OperationalError("select", {}, Exception("down")),
    ):
        response = await async_client.get(f"{settings.API_V1_STR}/utils/ready/")
    assert response.status_code == 503


async def test_ready_unexpected_exception_still_propagates(
    async_client: httpx.AsyncClient,
) -> None:
    """A genuine bug must stay an exception (reported 500), not hidden as 503."""
    with (
        patch("src.utils.router._migration_heads", side_effect=ValueError("bug")),
        pytest.raises(ValueError, match="bug"),
    ):
        await async_client.get(f"{settings.API_V1_STR}/utils/ready/")
