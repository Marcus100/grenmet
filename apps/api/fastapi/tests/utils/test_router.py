"""Tests for utils router."""

from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from src.config import settings


def test_health_check(client: TestClient) -> None:
    """Test health check endpoint."""
    response = client.get(f"{settings.API_V1_STR}/utils/health-check/")

    assert response.status_code == 200
    content = response.json()
    assert content is True  # Health check returns boolean


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

    email_to = "test@weather.gd"
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
