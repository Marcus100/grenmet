"""Email bodies for paid ticket orders (N4b). Pure: each returns ``(subject, html)``.

Every value is HTML-escaped. They carry public listing details and the amount, no
ticket codes or QR tokens (those stay behind the buyer's sign-in).
"""

import html
from datetime import datetime

from src.utils.timezones import GRENADA, utc_to_local


def _e(value: str) -> str:
    return html.escape(value, quote=True)


def _money(minor: int, currency: str) -> str:
    return f"{currency} {minor / 100:,.2f}"


def _when(starts_at: datetime) -> str:
    local = utc_to_local(starts_at, GRENADA)
    return local.strftime("%A %d %B %Y, %I:%M %p").replace(" 0", " ")


def order_confirmation(
    *,
    buyer_name: str,
    title: str,
    starts_at: datetime,
    ticket_count: int,
    total_minor: int,
    currency: str,
) -> tuple[str, str]:
    """Receipt sent once the payment is captured and the tickets are issued."""
    noun = "ticket" if ticket_count == 1 else "tickets"
    subject = f"Your tickets for {title}"
    body = (
        f"<p>Hello {_e(buyer_name)},</p>"
        f"<p>Thank you. We received your payment of "
        f"<strong>{_e(_money(total_minor, currency))}</strong> and issued "
        f"{ticket_count} {noun} for <strong>{_e(title)}</strong>.</p>"
        f"<p>{_e(_when(starts_at))} (Grenada time)</p>"
        "<p>Sign in and open My tickets to show the QR code at the door.</p>"
    )
    return subject, body
