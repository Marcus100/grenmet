"""Delivery of a structured ``card`` mail: render at send time, text part, fallback.

No database: a transactional row skips the suppression lookup, and the sender is a
recorder, so nothing is sent.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from src import email as email_module
from src import email_layout as layout
from src.email_config import email_settings
from src.notifications import dispatch

# A transactional row never reads the session (no suppression lookup).
NO_SESSION: Any = None


def _row() -> Any:
    card = layout.with_subject(
        "Your booking is confirmed",
        layout.EmailCard(
            eyebrow="Sample Studio",
            title="Your booking is confirmed",
            paragraphs=("Thank you for booking.",),
            rows=(layout.Row("What", "Haircut"),),
            primary=layout.Action("Manage booking", "https://example.test/manage"),
            footer="You are getting this email because you booked.",
        ),
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


def _enable_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.test")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")


async def test_card_row_is_sent_once_with_html_and_text_when_render_service_is_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_email(monkeypatch)
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", "http://render.test")

    async def boom(
        _template: str, _props: dict[str, object], *, timeout_seconds: float = 10.0
    ) -> object:
        raise RuntimeError("render service down")

    monkeypatch.setattr(email_module, "render_remote", boom)
    sent: list[dict[str, Any]] = []

    def record(**kwargs: Any) -> None:
        sent.append(kwargs)

    row = _row()
    await dispatch.send_outbound_row(NO_SESSION, row, attempts=1, sender=record)

    assert len(sent) == 1
    mail = sent[0]
    assert mail["email_to"] == "ann@example.test"
    assert mail["subject"] == "Your booking is confirmed"
    assert "Manage booking" in mail["html_content"]
    assert "Manage booking" in mail["text_content"]
    assert row.status == "sent"
    # The signed links in props are cleared once the mail is final.
    assert row.props == {}
    assert row.html is None


async def test_card_row_uses_the_render_service_result_and_passes_its_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_email(monkeypatch)
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", "http://render.test")

    async def fake_render(
        template: str, props: dict[str, object], *, timeout_seconds: float = 10.0
    ) -> object:
        assert template == layout.CARD_TEMPLATE
        assert props["title"] == "Your booking is confirmed"
        return SimpleNamespace(
            subject="Rendered subject",
            html_content="<p>rendered by the service</p>",
            text_content="rendered by the service",
        )

    monkeypatch.setattr(email_module, "render_remote", fake_render)
    sent: list[dict[str, Any]] = []

    def record(**kwargs: Any) -> None:
        sent.append(kwargs)

    await dispatch.send_outbound_row(NO_SESSION, _row(), attempts=1, sender=record)

    assert len(sent) == 1
    assert sent[0]["subject"] == "Rendered subject"
    assert sent[0]["html_content"] == "<p>rendered by the service</p>"
    assert sent[0]["text_content"] == "rendered by the service"
