"""Tests for utils router."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from src.config import settings


def test_health_check(client: TestClient) -> None:
    """Test health check endpoint."""
    response = client.get(f"{settings.API_V1_STR}/utils/health-check/")

    assert response.status_code == 200
    content = response.json()
    assert content is True  # Health check returns boolean


@patch("src.utils.router.send_email")
def test_test_email(
    mock_send_email, client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test email testing endpoint.."""
    # Mock the send_email function to avoid actual email sending
    mock_send_email.return_value = None

    email_to = "test@barrels.gd"
    response = client.post(
        f"{settings.API_V1_STR}/utils/test-email/?email_to={email_to}",
        headers=superuser_token_headers,
    )

    assert response.status_code == 201
    content = response.json()
    assert "message" in content

    # Verify that send_email was called with correct parameters
    mock_send_email.assert_called_once()
    call_args = mock_send_email.call_args
    assert call_args.kwargs["email_to"] == email_to
    assert "subject" in call_args.kwargs
    assert "html_content" in call_args.kwargs
