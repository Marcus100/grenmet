"""Invoice email cards: the facts a customer reads (rendered with the Python fallback)."""

from datetime import date

import pytest

from src import email_layout as layout
from src.billing import email_cards
from src.billing.models import ReminderStage
from tests.email_payload import card_html

PDF = "https://storage.example.com/billing/invoices/abc.pdf?X-Amz-Expires=604800"


def _issued(
    *,
    entity: str = "Barrels Grenada",
    total_minor: int = 115_000,
    outstanding_minor: int = 115_000,
    due: date | None = date(2031, 3, 31),
    pdf_url: str | None = PDF,
) -> layout.EmailCard:
    return email_cards.invoice_issued(
        number="BG-2031-0001",
        entity=entity,
        total_minor=total_minor,
        outstanding_minor=outstanding_minor,
        currency="XCD",
        due=due,
        pdf_url=pdf_url,
    )


def test_issued_card_states_number_amounts_and_due_date() -> None:
    card = _issued(total_minor=115_000, outstanding_minor=40_000)

    assert card.subject == "Invoice BG-2031-0001 from Barrels Grenada"
    assert card.eyebrow == "Barrels Grenada"
    assert card.title == "Invoice BG-2031-0001"
    assert ("Invoice", "BG-2031-0001") in [(r.label, r.value) for r in card.rows]
    assert ("Due date", "2031-03-31") in [(r.label, r.value) for r in card.rows]
    assert [(r.label, r.value) for r in card.money] == [
        ("Total", "XCD 1,150.00"),
        ("Balance due", "XCD 400.00"),
    ]
    html = card_html(card)
    assert "XCD 1,150.00" in html
    assert "XCD 400.00" in html


def test_pdf_link_is_a_button_that_expires_after_seven_days() -> None:
    card = _issued()

    assert card.primary == layout.Action("Download invoice (PDF)", PDF)
    assert "The download link expires after seven days." in card.policy
    assert "Reply to this email" not in card_html(card)
    assert "Download invoice (PDF)" in card_html(card)


def test_without_a_stored_pdf_there_is_no_link_and_an_offer_of_another_copy() -> None:
    card = _issued(pdf_url=None)

    assert card.primary is None
    assert "Reply to this email if you need another copy of the invoice." in card.policy
    html = card_html(card)
    assert "Download" not in html
    assert "expires after seven days" not in html
    assert "Reply to this email if you need another copy of the invoice." in html


def test_payment_instructions_are_always_shown() -> None:
    for pdf_url in (PDF, None):
        assert card_html(_issued(pdf_url=pdf_url)).count(
            "Pay by bank transfer, cash or cheque, quoting the invoice number."
        ) == 1


def test_missing_due_date_reads_on_receipt() -> None:
    card = _issued(due=None)

    assert ("Due date", "on receipt") in [(r.label, r.value) for r in card.rows]


@pytest.mark.parametrize(
    ("stage", "subject", "title"),
    [
        (
            ReminderStage.BEFORE_DUE_7,
            "Reminder: invoice BG-2031-0001 is due in 7 days",
            "Invoice BG-2031-0001 is due in 7 days",
        ),
        (
            ReminderStage.DUE_TODAY,
            "Reminder: invoice BG-2031-0001 is due today",
            "Invoice BG-2031-0001 is due today",
        ),
        (
            ReminderStage.OVERDUE_7,
            "Overdue: invoice BG-2031-0001 was due 7 days ago",
            "Invoice BG-2031-0001 is now 7 days overdue",
        ),
    ],
)
def test_each_reminder_stage_has_its_subject_and_lead(
    stage: ReminderStage, subject: str, title: str
) -> None:
    card = email_cards.invoice_reminder(
        stage=stage,
        number="BG-2031-0001",
        entity="Barrels Grenada",
        total_minor=115_000,
        outstanding_minor=115_000,
        currency="XCD",
        due=date(2031, 3, 31),
        pdf_url=PDF,
    )

    assert card.subject == subject
    assert card.title == title
    assert card.primary == layout.Action("Download invoice (PDF)", PDF)
    assert "XCD 1,150.00" in card_html(card)


def test_hostile_legal_entity_name_is_escaped() -> None:
    card = _issued(entity="<script>x</script>")
    html = card_html(card)

    assert "<script>" not in html
    assert "&lt;script&gt;x&lt;/script&gt;" in html
