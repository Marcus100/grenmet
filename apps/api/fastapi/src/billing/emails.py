"""Invoice emails, queued through the notifications outbox (``OutboundEmail``).

The outbox has no attachments, so the email carries the invoice summary and, when
object storage is configured, a time-limited link to the stored PDF. The content is
an ``EmailCard`` (``email_cards.py``), queued as the ``card`` template and rendered
at delivery.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.notifications import service as notifications_service

from . import email_cards
from .models import Invoice, ReminderStage


def queue_invoice_email(
    session: AsyncSession,
    *,
    invoice: Invoice,
    to_email: str,
    pdf_url: str | None,
) -> None:
    assert invoice.number is not None
    card = email_cards.invoice_issued(
        number=invoice.number,
        entity=invoice.legal_entity_name or "",
        total_minor=invoice.total_minor,
        outstanding_minor=invoice.total_minor - invoice.paid_minor,
        currency=invoice.currency,
        due=invoice.due_date,
        pdf_url=pdf_url,
    )
    _queue(session, card, to_email)


def queue_reminder_email(
    session: AsyncSession,
    *,
    invoice: Invoice,
    stage: ReminderStage,
    to_email: str,
    pdf_url: str | None,
) -> None:
    assert invoice.number is not None
    card = email_cards.invoice_reminder(
        stage=stage,
        number=invoice.number,
        entity=invoice.legal_entity_name or "",
        total_minor=invoice.total_minor,
        outstanding_minor=invoice.total_minor - invoice.paid_minor,
        currency=invoice.currency,
        due=invoice.due_date,
        pdf_url=pdf_url,
    )
    _queue(session, card, to_email)


def _queue(session: AsyncSession, card: layout.EmailCard, to_email: str) -> None:
    notifications_service.enqueue_email(
        session=session,
        to_email=to_email,
        subject=card.subject,
        transactional=True,
        template=layout.CARD_TEMPLATE,
        props=layout.to_props(card),
    )
