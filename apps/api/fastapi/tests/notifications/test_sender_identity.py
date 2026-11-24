"""Business mail sends as "<Business> via Barrels" with Reply-To the business.

The From address is always the verified sending address; only the display name
changes. Business-controlled text (the name and the Reply-To) is cleaned in
``send_email``, so a hostile value can never add a recipient or a header.
"""

import smtplib
from email.utils import getaddresses
from types import SimpleNamespace
from typing import Any

import pytest
import resend

from src import email as email_module
from src import email_layout as layout
from src.email import (
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
    "Acme\u2028Bcc: victim@example.net",
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
    assert "\u2028" not in header and "\x00" not in header
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
        async def __aenter__(self) -> FakeClient:
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


# ── Encoded words, separators and edge names ─────────────────────────────────

ENCODED_WORD = "=?utf-8?b?PGNlb0BiYW5rLmV4YW1wbGU+?="


def test_an_encoded_word_name_cannot_decode_into_an_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    header = sender_header(ENCODED_WORD)
    assert "=?" not in header and "?=" not in header
    assert _addresses(header) == [_FROM]


def test_an_encoded_word_name_is_safe_on_resend_and_smtp(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    kwargs = {
        "email_to": "reader@example.com",
        "subject": "Hi",
        "html_content": _HTML,
        "from_name": ENCODED_WORD,
    }
    sent = _resend(monkeypatch)
    _real_send_email(**kwargs)
    messages = _smtp(monkeypatch)
    _real_send_email(**kwargs)
    for header in (sent[0]["from"], messages[0]["From"]):
        assert "=?" not in header
        assert _addresses(header) == [_FROM]


@pytest.mark.parametrize("separator", [" ", " ", "\u0085"])
def test_unicode_line_and_paragraph_separators_collapse_to_a_space(
    separator: str,
) -> None:
    assert business_sender_name(f"Acme{separator}Ltd") == "Acme Ltd via Barrels"


def test_a_name_that_is_only_at_signs_falls_back_to_the_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    assert sender_header("@@@") == sender_header(None)


def test_a_non_ascii_name_on_smtp_gives_one_valid_from_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from email.header import decode_header, make_header
    from email.utils import parseaddr

    messages = _smtp(monkeypatch)
    _real_send_email(
        email_to="reader@example.com",
        subject="Hi",
        html_content=_HTML,
        from_name="Café Bistro",
    )
    raw = messages[0]["From"]
    assert _addresses(raw) == [_FROM]
    encoded_name, address = parseaddr(raw)
    assert address == _FROM
    decoded = str(make_header(decode_header(encoded_name)))
    assert decoded == "Café Bistro"


# ── Reserved terms, pinned defaults and logging ──────────────────────────────


@pytest.mark.parametrize(
    "name",
    [
        "Barrels Salon",
        "GAA Spa",
        "Grenada Airports Spa",
        "GMS Salon",
        "Met Office Cafe",
        "Meteorological Shop",
        "Government Store",
        "Bank of Spa",
        "Support Desk",
        "Security Salon",
        "Admin Spa",
        "Visit www.spa.example",
        "http spa",
        "spa.com",
        "Spa.GD",
    ],
)
def test_a_name_with_a_reserved_term_falls_back_to_the_default(name: str) -> None:
    assert business_sender_name(name) == ""


def test_an_ordinary_name_is_not_caught_by_the_reserved_terms() -> None:
    assert (
        business_sender_name("Babydoll Beauty Bar") == "Babydoll Beauty Bar via Barrels"
    )


def test_the_default_header_is_the_literal_configured_pair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_NAME", "Sender Default")
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", _FROM)
    assert sender_header(None) == "Sender Default <noreply@example.com>"


def test_the_smtp_default_from_is_the_literal_configured_pair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_NAME", "Sender Default")
    messages = _smtp(monkeypatch)
    _real_send_email(email_to="reader@example.com", subject="Hi", html_content=_HTML)
    assert messages[0]["From"] == "Sender Default <noreply@example.com>"


def test_a_rejected_reply_to_is_logged_without_the_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logged: list[str] = []
    monkeypatch.setattr(
        email_module.logger, "warning", lambda msg, *args: logged.append(msg % args)
    )
    assert safe_reply_to("secret@example.com, other@example.net") is None
    assert logged and "Reply-To rejected" in logged[0]
    assert all("secret@" not in line for line in logged)


# ── Reserved-term bypasses (issue 1640) ──────────────────────────────────────
# Each name below is a way to pass as Barrels, a government body, a bank or a
# support desk while the plain substring list would miss it.

BYPASS_NAMES = [
    # zero-width and soft-hyphen characters inside a reserved word
    "Bar​rels Spa",
    "Bar­rels Spa",
    "Bar⁠rels Spa",
    # spaces inside a reserved word
    "G A A Spa",
    "Met  Office Spa",
    "B a r r e l s Spa",
    # Cyrillic lookalikes (a, e, o, p, c, and capital A)
    "Bаrrеls Spa",
    "GАA Spa",
    "Grеnаda Airport Authority",
    "Gоvеrnment Store",
    # fullwidth letters (folded by NFKC)
    "Ｂａｒｒｅｌｓ Spa",
    # digits standing in for letters: 1 as l or i, 0 as o, 3 as e, 5 as s
    "Barre1s Spa",
    "Adm1n Spa",
    "Met0ffice Spa",
    "Gov3rnment Store",
    "Support D3sk",
    # reserved phrases the list missed
    "Grenada Airport Authority",
    "Grenada Met Service",
    "Official Weather",
    "Weather Service Spa",
    "Spa.com",
    "spa . com",
    "Visit www.spa.example",
    # a word split across words, a capital I for l, a dotless i
    "Bar rels Spa",
    "BarreIs Spa",
    "Adm\u0131n Spa",
    "Supporters Desk",
    # a short term with letters or digits attached (security review of #1807)
    "GAAs Taxi",
    "GAA2 Tours",
    "GMS1 Weather",
    "2GAA Shuttle",
    "GAAOfficial",
    "GMSjam Events",
    "theGAA Desk",
    "MyGMS Alerts",
    "XGMS Weather",
    "GAAGMS",
]


@pytest.mark.parametrize("name", BYPASS_NAMES)
def test_a_reserved_name_bypass_falls_back_to_the_default_sender(name: str) -> None:
    assert business_sender_name(name) == ""


@pytest.mark.parametrize(
    "name",
    [
        "Sunset Bakery",
        "Caribbean Cafe",
        "Grenada Airbnb Rentals",
        "Island Hair Studio",
        # a reserved term only across two unrelated words, or a short term inside
        # a longer word (issue 1640)
        "Yoga Academy",
        "Mega Antiques",
        "Rad Minimart",
        "Studio 54",
        "Gaanesh Barber",
        "Pragmatic Gym",
    ],
)
def test_ordinary_names_with_similar_letters_still_work(name: str) -> None:
    assert business_sender_name(name) == f"{name} via Barrels"


def test_a_reserved_name_is_logged_without_the_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logged: list[str] = []
    monkeypatch.setattr(
        email_module.logger, "warning", lambda msg, *args: logged.append(msg % args)
    )
    assert business_sender_name("G A A Spa") == ""
    assert logged and all("G A A" not in line for line in logged)
