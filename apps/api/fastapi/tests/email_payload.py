"""Queued customer mail is stored as card props and rendered at delivery.

Tests read what the customer would get by rendering the stored props with the
Python fallback (the React render service is not configured under test).
"""

from typing import Any

from src import email_layout


def _rendered(payload: dict[str, Any]) -> email_layout.RenderedEmail:
    card = email_layout.from_props(payload["props"])
    return email_layout.render_fallback(card)


def payload_html(payload: dict[str, Any]) -> str:
    return _rendered(payload).html


def payload_text(payload: dict[str, Any]) -> str:
    return _rendered(payload).text


def card_html(card: email_layout.EmailCard) -> str:
    """The HTML of a builder's card (the Python fallback rendering)."""
    return email_layout.render_fallback(card).html
