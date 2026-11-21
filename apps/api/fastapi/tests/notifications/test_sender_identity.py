"""Business mail sends as "<Business> via Barrels" with Reply-To the business.

The From address is always the verified sending address; only the display name
changes. Business-controlled text (the name and the Reply-To) is cleaned in
``send_email``, so a hostile value can never add a recipient or a header.
"""

import smtplib
from email.utils import formataddr, getaddresses
from types import SimpleNamespace
from typing import Any

import pytest
import resend

from src import email as email_module
from src import email_layout as layout
from src.email import (
    SenderIdentity,
    business_sender,
    business_sender_name,
    safe_reply_to,
    sender_header,
)
from src.email_config import email_settings
from src.notifications import dispatch

# Captured before conftest swaps send_email for a recorder.
_real_send_email = email_module.send_email

_HTML = "<p>Your booking is confirmed.</p>"
_FROM = "noreply@example.com"

HOSTILE_NAMES = [
    "Bank <ceo@bank.example>",
    "Bank\r\nBcc: victim@example.net",
    "Acme\nX-Injected: yes",
    'Acme "Ltd"',
    "Acme, Ltd",
    "Acme Bcc: victim@example.net",
    "Acme\x00\x1b[31m",
]

HOSTILE_REPLY_TO = [
    "owner@example.com\r\nBcc: victim@example.net",
    "Bank <ceo@bank.example>",
    "owner@example.com, victim@example.net",
    "owner name@example.com",
    "not-an-address",
    "owner@",
    "owner@example.com>",
    "a" * 250 + "@example.com",
    "",
    "   ",
]


def _addresses(header: str) -> list[str]:
    return [address for _, address in getaddresses([header])]


def _resend(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []

    def capture(params: dict[str, Any]) -> dict[str, str]:
        sent.append(dict(params))
        return {"id": "re_t"}

    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    monkeypatch.setattr(resend.Emails, "send", capture)
    return sent


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
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    return messages


# ── Header building ──────────────────────────────────────────────────────────


def test_business_sender_name_is_the_business_via_barrels() -> None:
    assert (
        business_sender_name("Babydoll Beauty Bar") == "Babydoll Beauty Bar via Barrels"
    )


def test_sample_header_for_a_business_is_name_then_the_barrels_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    assert (
        sender_header(business_sender_name("Babydoll Beauty Bar"))
        == f"Babydoll Beauty Bar via Barrels <{_FROM}>"
    )


@pytest.mark.parametrize("name", HOSTILE_NAMES)
def test_a_hostile_display_name_never_makes_a_second_address_or_header(
    name: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    header = sender_header(business_sender_name(name))
    assert "\r" not in header and "\n" not in header
    assert " " not in header and "\x00" not in header
    assert _addresses(header) == [_FROM]


@pytest.mark.parametrize("name", HOSTILE_NAMES)
def test_send_email_header_for_a_hostile_name_is_one_safe_sender(
    name: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = _resend(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        from_name=name,
    )
    assert _addresses(sent[0]["from"]) == [_FROM]
    assert "\r" not in sent[0]["from"] and "\n" not in sent[0]["from"]


def test_a_long_business_name_is_capped_and_keeps_the_suffix() -> None:
    name = business_sender_name("A" * 200)
    assert len(name) <= 60
    assert name.endswith(" via Barrels")


@pytest.mark.parametrize("name", ["", "   ", '<>"', "\r\n"])
def test_an_empty_name_falls_back_to_the_default_sender(
    name: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    assert sender_header(name) == sender_header(None)


def test_a_business_name_with_a_comma_is_quoted_not_split(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    header = sender_header("Acme, Ltd")
    assert _addresses(header) == [_FROM]


# ── Reply-To ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("value", ["owner@example.com", " owner@example.com "])
def test_a_valid_reply_to_is_kept(value: str) -> None:
    assert safe_reply_to(value) == value.strip()


@pytest.mark.parametrize("value", HOSTILE_REPLY_TO + [None])
def test_an_invalid_reply_to_is_dropped(value: str | None) -> None:
    assert safe_reply_to(value) is None


def test_business_sender_uses_the_business_and_its_contact_email() -> None:
    assert business_sender(
        "Babydoll Beauty Bar", "owner@example.com"
    ) == SenderIdentity("Babydoll Beauty Bar via Barrels", "owner@example.com")


@pytest.mark.parametrize("contact", [None, "", "not-an-address"])
def test_a_business_without_a_valid_contact_email_keeps_the_default_sender(
    contact: str | None,
) -> None:
    assert business_sender("Babydoll Beauty Bar", contact) == SenderIdentity(None, None)


# ── Resend and SMTP both get the same safe values ───────────────────────────


@pytest.mark.parametrize("reply", HOSTILE_REPLY_TO)
def test_resend_drops_a_hostile_reply_to(
    reply: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = _resend(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        from_name="Sample Studio via Barrels",
        reply_to=reply,
    )
    assert "reply_to" not in sent[0]
    assert _addresses(sent[0]["from"]) == [_FROM]


def test_resend_and_smtp_get_the_same_name_and_reply_to(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    kwargs = {
        "email_to": "reader@example.com",
        "subject": "Hi",
        "html_content": _HTML,
        "from_name": "Sample Studio via Barrels",
        "reply_to": "studio@example.com",
    }
    sent = _resend(monkeypatch)
    _real_send_email(**kwargs)
    messages = _smtp(monkeypatch)
    _real_send_email(**kwargs)

    assert sent[0]["from"] == messages[0]["From"]
    assert sent[0]["from"] == "Sample Studio via Barrels <noreply@example.com>"
    assert sent[0]["reply_to"] == messages[0]["Reply-To"] == "studio@example.com"


def test_smtp_drops_a_hostile_reply_to_and_keeps_one_from(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    messages = _smtp(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        from_name="Bank <ceo@bank.example>",
        reply_to="owner@example.com\r\nBcc: victim@example.net",
    )
    msg = messages[0]
    assert msg["Reply-To"] is None
    assert _addresses(msg["From"]) == [_FROM]
    assert msg["Bcc"] is None


# ── Delivery passes the identity through ─────────────────────────────────────


def _row() -> Any:
    card = layout.with_subject(
        "Your booking is confirmed",
        layout.EmailCard(title="Your booking is confirmed", footer="Footer."),
    )
    return SimpleNamespace(
        attempts=0,
        transactional=True,
        to_email="ann@example.test",
        subject=card.subject,
        html=None,
        template=layout.CARD_TEMPLATE,
        props=layout.to_props(card),
        status="queued",
        sent_at=None,
        last_error=None,
        next_retry_at=None,
    )


async def test_outbound_row_passes_the_identity_to_the_sender(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    sent: list[dict[str, Any]] = []
    await dispatch.send_outbound_row(
        None,
        _row(),
        attempts=1,
        sender=lambda **kw: sent.append(kw),
        from_name="Sample Studio via Barrels",
        reply_to="studio@example.com",
    )
    assert sent[0]["from_name"] == "Sample Studio via Barrels"
    assert sent[0]["reply_to"] == "studio@example.com"


async def test_outbound_row_without_an_identity_sends_the_old_arguments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    sent: list[dict[str, Any]] = []
    await dispatch.send_outbound_row(
        None, _row(), attempts=1, sender=lambda **kw: sent.append(kw)
    )
    assert "from_name" not in sent[0]
    assert "reply_to" not in sent[0]


# ── Card render timeout ──────────────────────────────────────────────────────


class _Response:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, str]:
        return {"html": "<p>x</p>", "subject": "S", "text": "t"}


def _record_timeouts(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    seen: list[float] = []

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *exc: object) -> None:
            return None

        async def post(self, url: str, **kwargs: Any) -> _Response:
            seen.append(kwargs["timeout"])
            return _Response()

    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", "http://render.test")
    monkeypatch.setattr(email_module.httpx, "AsyncClient", FakeClient)
    return seen


async def test_a_card_render_waits_three_seconds_for_the_render_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = _record_timeouts(monkeypatch)
    await layout.render_card(layout.EmailCard(title="T"))
    assert seen == [3.0]


async def test_other_renders_keep_the_ten_second_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = _record_timeouts(monkeypatch)
    await email_module.render_remote("welcome", {})
    assert seen == [10.0]
