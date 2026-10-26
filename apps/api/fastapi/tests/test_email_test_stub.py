"""Regression coverage for the shared test email sender stub."""

import pytest

from src.auth import app_service
from src.email_config import email_settings


@pytest.mark.parametrize("configured", [True, False])
def test_imported_email_sender_is_stubbed_with_or_without_configuration(
    monkeypatch: pytest.MonkeyPatch,
    outbound_email_calls: list[dict[str, str]],
    configured: bool,
) -> None:
    monkeypatch.setattr(
        email_settings,
        "EMAILS_FROM_EMAIL",
        "noreply@example.com" if configured else None,
    )
    monkeypatch.setattr(
        email_settings, "RESEND_API_KEY", "re_test" if configured else None
    )
    monkeypatch.setattr(email_settings, "SMTP_HOST", None)

    app_service.send_email(
        email_to="recipient@example.com",
        subject="Test email",
        html_content="<p>Test</p>",
    )
    assert outbound_email_calls == [
        {
            "email_to": "recipient@example.com",
            "subject": "Test email",
            "html_content": "<p>Test</p>",
        }
    ]
