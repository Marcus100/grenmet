"""Invoice emails, queued through the notifications outbox (``OutboundEmail``).

The outbox has no attachments, so the email carries the invoice summary and, when
object storage is configured, a time-limited link to the stored PDF. Rows hold
pre-rendered HTML; every dynamic value is escaped.
"""

from datetime import date
from html import escape

from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import service as notifications_service

from .calc import format_money
from .models import Invoice, ReminderStage

_REMINDER_SUBJECT = {
    ReminderStage.BEFORE_DUE_7: "Reminder: invoice {number} is due in 7 days",
    ReminderStage.DUE_TODAY: "Reminder: invoice {number} is due today",
    ReminderStage.OVERDUE_7: "Overdue: invoice {number} was due 7 days ago",
}
_REMINDER_LEAD = {
    ReminderStage.BEFORE_DUE_7: "is due in 7 days",
    ReminderStage.DUE_TODAY: "is due today",
    ReminderStage.OVERDUE_7: "is now 7 days overdue",
}


def _body(
    *,
    entity: str,
    lead: str,
    number: str,
    total_minor: int,
    outstanding_minor: int,
    currency: str,
    due: date | None,
    pdf_url: str | None,
) -> str:
    link = (
        f'<p><a href="{escape(pdf_url, quote=True)}">Download the invoice (PDF)</a>'
        " - the link expires after seven days.</p>"
        if pdf_url
        else "<p>Reply to this email if you need another copy of the invoice.</p>"
    )
    return (
        f"<p>{lead}</p>"
        f"<p>Invoice <b>{escape(number)}</b><br>"
        f"Total {escape(format_money(total_minor, currency))}<br>"
        f"Balance due {escape(format_money(outstanding_minor, currency))}<br>"
        f"Due date {due.isoformat() if due else 'on receipt'}</p>"
        f"{link}"
        "<p>Pay by bank transfer, cash or cheque, quoting the invoice number.</p>"
        f"<p>{escape(entity)}</p>"
    )


def queue_invoice_email(
    session: AsyncSession,
    *,
    invoice: Invoice,
    to_email: str,
    pdf_url: str | None,
) -> None:
    assert invoice.number is not None
    entity = invoice.legal_entity_name or ""
    notifications_service.enqueue_email(
        session=session,
        to_email=to_email,
        subject=f"Invoice {invoice.number} from {entity}"[:300],
        transactional=True,
        html=_body(
            entity=entity,
            lead=f"Please find invoice {escape(invoice.number)} attached below.",
            number=invoice.number,
            total_minor=invoice.total_minor,
            outstanding_minor=invoice.total_minor - invoice.paid_minor,
            currency=invoice.currency,
            due=invoice.due_date,
            pdf_url=pdf_url,
        ),
    )


def queue_reminder_email(
    session: AsyncSession,
    *,
    invoice: Invoice,
    stage: ReminderStage,
    to_email: str,
    pdf_url: str | None,
) -> None:
    assert invoice.number is not None
    entity = invoice.legal_entity_name or ""
    notifications_service.enqueue_email(
        session=session,
        to_email=to_email,
        subject=_REMINDER_SUBJECT[stage].format(number=invoice.number),
        transactional=True,
        html=_body(
            entity=entity,
            lead=f"Invoice {escape(invoice.number)} {_REMINDER_LEAD[stage]}.",
            number=invoice.number,
            total_minor=invoice.total_minor,
            outstanding_minor=invoice.total_minor - invoice.paid_minor,
            currency=invoice.currency,
            due=invoice.due_date,
            pdf_url=pdf_url,
        ),
    )
