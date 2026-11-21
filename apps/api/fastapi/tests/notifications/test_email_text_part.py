"""send_email sends an optional plain-text part (Resend ``text``, SMTP plain part)."""

import smtplib
from email.mime.multipart import MIMEMultipart
from typing import Any

import pytest
import resend

from src import email as email_module
from src.email_config import email_settings

# Captured before conftest swaps send_email for a recorder.
_real_send_email = email_module.send_email

_TEXT = "Your booking is confirmed.\nWhat: Haircut"
_HTML = "<p>Your booking is confirmed.</p>"


def _resend(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []

    def capture(params: dict[str, Any]) -> dict[str, str]:
        sent.append(dict(params))
        return {"id": "re_t"}

    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(resend.Emails, "send", capture)
    return sent


def test_resend_receives_the_text_part_when_given(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = _resend(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        text_content=_TEXT,
    )
    assert sent[0]["text"] == _TEXT
    assert sent[0]["html"] == _HTML


def test_resend_without_text_sends_no_text_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = _resend(monkeypatch)
    _real_send_email(email_to="reader@example.com", subject="Hi", html_content=_HTML)
    assert "text" not in sent[0]


def _smtp(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    messages: list[Any] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: float | None = None) -> None:
            assert timeout is not None

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
    return messages


def test_smtp_sends_a_plain_part_before_the_html_part(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    messages = _smtp(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        text_content=_TEXT,
    )
    msg = messages[0]
    assert isinstance(msg, MIMEMultipart)
    parts = msg.get_payload()
    assert [part.get_content_type() for part in parts] == [
        "text/plain",
        "text/html",
    ]
    assert parts[0].get_payload(decode=True).decode() == _TEXT
    assert parts[1].get_payload(decode=True).decode() == _HTML


def test_smtp_without_text_keeps_the_html_only_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    messages = _smtp(monkeypatch)
    _real_send_email(email_to="reader@example.com", subject="Hi", html_content=_HTML)
    parts = messages[0].get_payload()
    assert [part.get_content_type() for part in parts] == ["text/html"]


def test_resend_gets_the_sender_name_and_reply_to_when_given(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = _resend(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        from_name="Sample Studio via Barrels",
        reply_to="studio@example.com",
    )
    assert sent[0]["from"].startswith("Sample Studio via Barrels <")
    assert sent[0]["reply_to"] == "studio@example.com"


def test_send_email_defaults_are_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    sent = _resend(monkeypatch)
    _real_send_email(email_to="reader@example.com", subject="Hi", html_content=_HTML)
    assert "reply_to" not in sent[0]
    assert sent[0]["from"].startswith(f"{email_settings.EMAILS_FROM_NAME} <")
