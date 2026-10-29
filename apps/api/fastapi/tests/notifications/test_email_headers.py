"""send_email passes list headers (List-Unsubscribe) to Resend and to SMTP."""

import smtplib
from typing import Any

import pytest
import resend

from src import email as email_module
from src.email_config import email_settings

# Captured before conftest swaps send_email for a recorder.
_real_send_email = email_module.send_email

_HEADERS = {
    "List-Unsubscribe": "<https://api.example.test/api/v1/subscriptions/unsubscribe?token=t>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
}


def test_resend_receives_the_list_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict[str, Any]] = []

    def capture(params: dict[str, Any]) -> dict[str, str]:
        sent.append(dict(params))
        return {"id": "re_1"}

    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(resend.Emails, "send", capture)

    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content="<p>hi</p>",
        headers=_HEADERS,
    )
    assert sent[0]["headers"] == _HEADERS
    assert sent[0]["to"] == ["reader@example.com"]


def test_resend_without_headers_sends_no_headers_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[dict[str, Any]] = []

    def capture(params: dict[str, Any]) -> dict[str, str]:
        sent.append(dict(params))
        return {"id": "re_2"}

    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(resend.Emails, "send", capture)

    _real_send_email(email_to="reader@example.com", subject="Hi", html_content="x")
    assert "headers" not in sent[0]


def test_smtp_fallback_adds_the_list_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    messages: list[Any] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int) -> None:
            self.host = host

        def starttls(self) -> None:
            return None

        def send_message(self, msg: Any) -> None:
            messages.append(msg)

        def quit(self) -> None:
            return None

    monkeypatch.setattr(email_settings, "RESEND_API_KEY", None)
    monkeypatch.setattr(email_settings, "SMTP_HOST", "localhost")
    monkeypatch.setattr(email_settings, "SMTP_PORT", 8025)
    monkeypatch.setattr(email_settings, "SMTP_TLS", False)
    monkeypatch.setattr(email_settings, "SMTP_SSL", False)
    monkeypatch.setattr(email_settings, "SMTP_USER", None)
    monkeypatch.setattr(email_settings, "SMTP_PASSWORD", None)
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)

    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content="<p>hi</p>",
        headers=_HEADERS,
    )
    assert messages[0]["List-Unsubscribe"] == _HEADERS["List-Unsubscribe"]
    assert messages[0]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
