"""Payment reminders for open invoices (7 days before due, on the due date, 7 days after).

Idempotent: a unique ``(invoice, stage)`` row is inserted before the email is
queued, so a repeated or concurrent run never sends the same stage twice.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from . import calc, emails
from .config import billing_settings
from .invoices import OPEN_STATUSES, download_url, today_grenada
from .models import Customer, Invoice, InvoiceReminder

logger = logging.getLogger(__name__)


async def send_due_reminders(
    session: AsyncSession, *, today: date | None = None
) -> int:
    """Queue every reminder that is due today. Returns how many were queued."""
    day = today or today_grenada()
    grace = billing_settings.INVOICE_REMINDER_GRACE_DAYS
    earliest = day - timedelta(days=7 + grace)
    latest = day + timedelta(days=7)
    rows = (
        await session.execute(
            select(Invoice, Customer.billing_email)
            .join(Customer, Customer.id == Invoice.customer_id)
            .where(
                Invoice.status.in_(OPEN_STATUSES),
                Invoice.due_date.between(earliest, latest),
            )
            .order_by(Invoice.due_date, Invoice.number)
        )
    ).all()
    sent = 0
    for invoice, email in rows:
        assert invoice.due_date is not None
        stage = calc.due_reminder_stage(invoice.due_date, day, grace)
        if stage is None:
            continue
        inserted = await session.scalar(
            pg_insert(InvoiceReminder)
            .values(invoice_id=invoice.id, stage=stage.value)
            .on_conflict_do_nothing(constraint="uq_billing_reminder_stage")
            .returning(InvoiceReminder.id)
        )
        if inserted is None:
            continue
        emails.queue_reminder_email(
            session,
            invoice=invoice,
            stage=stage,
            to_email=email,
            pdf_url=download_url(invoice),
        )
        sent += 1
    await session.commit()
    logger.info("Invoice reminders queued", extra={"count": sent})
    return sent
