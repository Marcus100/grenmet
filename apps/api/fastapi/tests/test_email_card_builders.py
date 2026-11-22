"""Every card builder in the four notice modules, checked against the render rule.

The React card template rejects a card without a subject, title or footer
(``packages/email-templates/src/render.ts``). These tests mirror that rule without the
render service, and fail when a new public builder is added without a case here.
They also pin escaping of visitor-controlled text and that a subject never carries a
line break.
"""

import inspect
from datetime import date
from types import ModuleType

import pytest

from src import email_layout as layout
from src.auth import email_cards as auth_cards
from src.billing import email_cards as billing_cards
from src.billing.models import ReminderStage
from src.contact import email_cards as contact_cards
from src.contact.models import ContactDataRequest
from src.webhooks_out import email_cards as webhook_cards
from tests.email_payload import card_html, payload_html, payload_text

HOSTILE = (
    '<img src=x onerror="alert(1)"> & "quoted" <a href="https://evil.example">x</a>'
)
PDF = "https://storage.example.com/billing/invoices/abc.pdf"


def _request(**overrides: object) -> ContactDataRequest:
    values: dict[str, object] = {
        "name": "Dr Ada Researcher",
        "email": "ada@example.com",
        "organisation": "Coastal Study",
        "purpose": "Flood risk study.",
        "parameters": ["rainfall", "temperature"],
        "stations": "Maurice Bishop International Airport",
        "period_start": date(2000, 1, 1),
        "period_end": date(2020, 12, 31),
        "data_format": "csv",
        "intended_use": "academic",
        "site": "gms-data-request",
    }
    values.update(overrides)
    return ContactDataRequest(**values)


def _invoice(stage: ReminderStage | None = None) -> layout.EmailCard:
    if stage is None:
        return billing_cards.invoice_issued(
            number="BG-2031-0001",
            entity="Barrels Grenada",
            total_minor=115_000,
            outstanding_minor=115_000,
            currency="XCD",
            due=date(2031, 3, 31),
            pdf_url=PDF,
        )
    return billing_cards.invoice_reminder(
        stage=stage,
        number="BG-2031-0001",
        entity="Barrels Grenada",
        total_minor=115_000,
        outstanding_minor=115_000,
        currency="XCD",
        due=date(2031, 3, 31),
        pdf_url=PDF,
    )


def _cases() -> dict[str, list[layout.EmailCard]]:
    """Every public builder in the four modules, with at least one real call."""
    return {
        "billing_cards.invoice_issued": [_invoice()],
        "billing_cards.invoice_reminder": [
            _invoice(ReminderStage.BEFORE_DUE_7),
            _invoice(ReminderStage.DUE_TODAY),
            _invoice(ReminderStage.OVERDUE_7),
        ],
        "contact_cards.website_message": [
            contact_cards.website_message(
                site="mbia",
                name="Jane Reader",
                email="jane@example.com",
                subject="Lost bag",
                message="I lost a bag on the 12th.",
            )
        ],
        "contact_cards.data_request_for_staff": [
            contact_cards.data_request_for_staff(_request())
        ],
        "contact_cards.data_request_received": [
            contact_cards.data_request_received("Dr Ada Researcher")
        ],
        "webhook_cards.endpoint_disabled": [
            webhook_cards.endpoint_disabled(
                endpoint_id="whe_123", host="hooks.example.com", reason="410 Gone"
            )
        ],
        "auth_cards.link_issued": [auth_cards.link_issued()],
        "auth_cards.setup_completed": [auth_cards.setup_completed()],
    }


def _public_builders(prefix: str, module: ModuleType) -> set[str]:
    return {
        f"{prefix}.{name}"
        for name, fn in inspect.getmembers(module, inspect.isfunction)
        if not name.startswith("_")
        and fn.__module__ == module.__name__
        and inspect.signature(fn).return_annotation is layout.EmailCard
    }


def test_every_public_builder_has_cases() -> None:
    modules = {
        "billing_cards": billing_cards,
        "contact_cards": contact_cards,
        "webhook_cards": webhook_cards,
        "auth_cards": auth_cards,
    }
    found = set().union(
        *(_public_builders(prefix, module) for prefix, module in modules.items())
    )
    covered = set(_cases())
    assert found == covered, found ^ covered


@pytest.mark.parametrize("key", sorted(_cases()))
def test_subject_title_and_footer_are_set(key: str) -> None:
    for card in _cases()[key]:
        assert card.subject.strip(), key
        assert card.title.strip(), key
        assert card.footer.strip(), key
        assert "\r" not in card.subject and "\n" not in card.subject, key


@pytest.mark.parametrize("key", sorted(_cases()))
def test_every_card_renders_to_html_and_text(key: str) -> None:
    for card in _cases()[key]:
        rendered = card_html(card)
        assert rendered.startswith("<!DOCTYPE html>"), key
        assert payload_text({"props": layout.to_props(card)}).strip(), key


def test_invoice_footer_names_the_issuer_and_falls_back_without_a_name() -> None:
    named = billing_cards.invoice_issued(
        number="BG-2031-0001",
        entity="Barrels Grenada",
        total_minor=100,
        outstanding_minor=100,
        currency="XCD",
        due=None,
        pdf_url=None,
    )
    assert named.footer == (
        "You are getting this email because Barrels Grenada issued an invoice to this "
        "address. Reply to this email with any question."
    )
    unnamed = billing_cards.invoice_issued(
        number="BG-2031-0001",
        entity="",
        total_minor=100,
        outstanding_minor=100,
        currency="XCD",
        due=None,
        pdf_url=None,
    )
    assert unnamed.footer == (
        "You are getting this email because the sender issued an invoice to this "
        "address. Reply to this email with any question."
    )


def test_notice_footers_say_why_the_reader_got_the_mail() -> None:
    assert auth_cards.link_issued().footer == (
        "You are getting this email because a sign-in was set up for your account. "
        "If this was not you, contact your administrator."
    )
    assert webhook_cards.endpoint_disabled(
        endpoint_id="whe_1", host="h.example.com", reason="x"
    ).footer == (
        "You are getting this email because you manage webhooks for this organisation."
    )
    assert contact_cards.data_request_received("Ann").footer == (
        "You are getting this email because this address was used on the climate "
        "data request form."
    )


# --- visitor-controlled text is escaped, never a link or an attribute ----------------


def _no_live_markup(html: str) -> None:
    """No element from the visitor's text: it arrives as escaped characters."""
    assert "<img" not in html
    assert "<a " not in html
    assert "&lt;img src=x" in html


def test_contact_name_subject_and_message_are_escaped_text() -> None:
    card = contact_cards.website_message(
        site="mbia",
        name=HOSTILE,
        email="jane@example.com",
        subject=HOSTILE,
        message=HOSTILE,
    )
    html = payload_html({"props": layout.to_props(card)})
    _no_live_markup(html)
    assert "&amp;" in html
    assert "&lt;a href=" in html


def test_organisation_and_purpose_are_escaped_text() -> None:
    card = contact_cards.data_request_for_staff(
        _request(organisation=HOSTILE, purpose=HOSTILE, name=HOSTILE)
    )
    html = payload_html({"props": layout.to_props(card)})
    _no_live_markup(html)
    assert "&lt;img src=x" in html
    assert "&amp;" in html


def test_requester_name_in_the_confirmation_is_escaped_text() -> None:
    card = contact_cards.data_request_received(HOSTILE)
    html = payload_html({"props": layout.to_props(card)})
    _no_live_markup(html)
    assert "&lt;img src=x" in html


def test_webhook_reason_is_escaped_text() -> None:
    card = webhook_cards.endpoint_disabled(
        endpoint_id="whe_1", host="hooks.example.com", reason=HOSTILE
    )
    html = payload_html({"props": layout.to_props(card)})
    _no_live_markup(html)
    assert "&amp;" in html


def test_contact_subject_with_line_breaks_is_one_line() -> None:
    card = contact_cards.website_message(
        site="mbia",
        name="Jane Reader",
        email="jane@example.com",
        subject="Lost\r\nBcc: x@y.example",
        message="I lost a bag on the 12th.",
    )
    assert "\r" not in card.subject and "\n" not in card.subject
    assert card.subject == "Website message: Lost Bcc: x@y.example"
