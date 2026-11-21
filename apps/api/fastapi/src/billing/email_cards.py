"""Invoice and reminder emails as cards (``src.email_layout``). Pure: no database, no I/O.

The eyebrow is the legal entity name. The PDF button and its seven-day expiry line
appear only when a stored PDF link is given; otherwise the mail offers another copy.
Amounts are shown as money rows, the balance due last.
"""

from datetime import date

from src import email_layout as layout

from .calc import format_money
from .models import ReminderStage

_REMINDER_SUBJECT = {
    ReminderStage.BEFORE_DUE_7: "Reminder: invoice {number} is due in 7 days",
    ReminderStage.DUE_TODAY: "Reminder: invoice {number} is due today",
    ReminderStage.OVERDUE_7: "Overdue: invoice {number} was due 7 days ago",
}
_REMINDER_TITLE = {
    ReminderStage.BEFORE_DUE_7: "Invoice {number} is due in 7 days",
    ReminderStage.DUE_TODAY: "Invoice {number} is due today",
    ReminderStage.OVERDUE_7: "Invoice {number} is now 7 days overdue",
}
_PAY = "Pay by bank transfer, cash or cheque, quoting the invoice number."
_EXPIRY = "The download link expires after seven days."
_NO_LINK = "Reply to this email if you need another copy of the invoice."


def _card(
    *,
    entity: str,
    number: str,
    title: str,
    subject: str,
    total_minor: int,
    outstanding_minor: int,
    currency: str,
    due: date | None,
    pdf_url: str | None,
    paragraphs: tuple[str, ...] = (),
) -> layout.EmailCard:
    link = layout.safe_url(pdf_url)
    card = layout.EmailCard(
        eyebrow=entity,
        title=title,
        paragraphs=paragraphs,
        rows=(
            layout.Row("Invoice", number),
            layout.Row("Due date", due.isoformat() if due else "on receipt"),
        ),
        money=(
            layout.Row("Total", format_money(total_minor, currency)),
            layout.Row("Balance due", format_money(outstanding_minor, currency)),
        ),
        primary=layout.Action("Download invoice (PDF)", link) if link else None,
        policy=(_EXPIRY,) if link else (_NO_LINK,),
        quiet=_PAY,
    )
    return layout.with_subject(subject, card)


def invoice_issued(
    *,
    number: str,
    entity: str,
    total_minor: int,
    outstanding_minor: int,
    currency: str,
    due: date | None,
    pdf_url: str | None,
) -> layout.EmailCard:
    return _card(
        entity=entity,
        number=number,
        title=f"Invoice {number}",
        subject=f"Invoice {number} from {entity}",
        total_minor=total_minor,
        outstanding_minor=outstanding_minor,
        currency=currency,
        due=due,
        pdf_url=pdf_url,
        paragraphs=(f"Please find invoice {number} below.",),
    )


def invoice_reminder(
    *,
    stage: ReminderStage,
    number: str,
    entity: str,
    total_minor: int,
    outstanding_minor: int,
    currency: str,
    due: date | None,
    pdf_url: str | None,
) -> layout.EmailCard:
    return _card(
        entity=entity,
        number=number,
        title=_REMINDER_TITLE[stage].format(number=number),
        subject=_REMINDER_SUBJECT[stage].format(number=number),
        total_minor=total_minor,
        outstanding_minor=outstanding_minor,
        currency=currency,
        due=due,
        pdf_url=pdf_url,
    )
