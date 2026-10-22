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


def order_refunded(
    *,
    buyer_name: str,
    title: str,
    order_ref: str,
    refund_minor: int,
    currency: str,
    full: bool,
    card: bool,
    event_cancelled: bool,
) -> tuple[str, str]:
    """Receipt for one refund on an order. ``full`` means everything paid on the
    order is now refunded (the tickets are cancelled); otherwise the tickets stay
    valid. ``card`` is a provider (card) refund, which takes days to show."""
    amount = _e(_money(refund_minor, currency))
    subject = f"Refund for {title}"
    why = (
        f"<p>The organiser cancelled <strong>{_e(title)}</strong>.</p>"
        if event_cancelled
        else ""
    )
    scope = (
        "This refunds your whole order and its tickets are cancelled."
        if full
        else "This is a partial refund; your tickets stay valid."
    )
    timeline = (
        "<p>The money goes back to the card you paid with. Your bank usually "
        "shows it within 5 to 10 business days.</p>"
        if card
        else "<p>The organiser returns this to you directly.</p>"
    )
    body = (
        f"<p>Hello {_e(buyer_name)},</p>"
        f"{why}"
        f"<p>We refunded <strong>{amount}</strong> for "
        f"<strong>{_e(title)}</strong> (order {_e(order_ref)}). {scope}</p>"
        f"{timeline}"
    )
    return subject, body


def event_reminder(
    *,
    name: str,
    title: str,
    starts_at: datetime,
    venue: str,
    tickets_url: str,
) -> tuple[str, str]:
    """Reminder about an event starting in about a day (times in Grenada)."""
    subject = f"Reminder: {title} is coming up"
    body = (
        f"<p>Hello {_e(name)},</p>"
        f"<p><strong>{_e(title)}</strong> starts soon.</p>"
        f"<p>{_e(_when(starts_at))} (Grenada time)<br>{_e(venue)}</p>"
        f'<p><a href="{_e(tickets_url)}">Open My tickets</a> to show your QR '
        "code at the door.</p>"
    )
    return subject, body
