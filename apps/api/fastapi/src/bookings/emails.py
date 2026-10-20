"""Booking email subjects and bodies. Pure: each function returns ``(subject, html)``.

Every value is HTML-escaped. Times are shown in the profile's timezone. Links come
from the profile's ``manage_url_template``; nothing here knows a site's address.
"""

import html
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from src.utils.timezones import utc_to_local


@dataclass(frozen=True)
class BookingEmail:
    business: str
    customer_name: str
    service_name: str
    provider_name: str
    starts_at: datetime  # naive UTC
    tz: ZoneInfo
    manage_url: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    notes: str | None = None

    @property
    def when(self) -> str:
        local = utc_to_local(self.starts_at, self.tz)
        return local.strftime("%A %d %B %Y, %I:%M %p").replace(" 0", " ")


def _e(value: str) -> str:
    return html.escape(value, quote=True)


def _details(mail: BookingEmail) -> str:
    return (
        f"<p><strong>{_e(mail.service_name)}</strong> with {_e(mail.provider_name)}"
        f"<br>{_e(mail.when)}</p>"
    )


def _manage(mail: BookingEmail) -> str:
    if not mail.manage_url:
        return ""
    url = _e(mail.manage_url)
    return f'<p>Need to change or cancel? <a href="{url}">Manage your booking</a>.</p>'


def customer_received(mail: BookingEmail, *, confirmed: bool) -> tuple[str, str]:
    if confirmed:
        subject = f"Your booking at {mail.business} is confirmed"
        lead = "Your booking is confirmed."
    else:
        subject = f"We received your booking request at {mail.business}"
        lead = "We received your request. We will email you once it is confirmed."
    body = (
        f"<p>Hello {_e(mail.customer_name)},</p><p>{lead}</p>"
        f"{_details(mail)}{_manage(mail)}"
    )
    return subject, body


def customer_cancelled(mail: BookingEmail) -> tuple[str, str]:
    return (
        f"Your booking at {mail.business} was cancelled",
        f"<p>Hello {_e(mail.customer_name)},</p>"
        f"<p>Your booking was cancelled.</p>{_details(mail)}",
    )


def customer_rescheduled(mail: BookingEmail) -> tuple[str, str]:
    return (
        f"Your booking at {mail.business} has a new time",
        f"<p>Hello {_e(mail.customer_name)},</p>"
        f"<p>Your booking was moved.</p>{_details(mail)}{_manage(mail)}",
    )


def customer_reminder(mail: BookingEmail) -> tuple[str, str]:
    return (
        f"Reminder: your booking at {mail.business}",
        f"<p>Hello {_e(mail.customer_name)},</p>"
        f"<p>A reminder of your booking within the next day.</p>"
        f"{_details(mail)}{_manage(mail)}",
    )


def studio_notice(mail: BookingEmail, *, event: str) -> tuple[str, str]:
    """``event``: ``created``, ``requested``, ``cancelled`` or ``rescheduled``."""
    contact = ", ".join(
        _e(part) for part in (mail.customer_email, mail.customer_phone) if part
    )
    notes = f"<p>Notes: {_e(mail.notes)}</p>" if mail.notes else ""
    return (
        f"Booking {event}: {mail.customer_name} ({mail.service_name})"[:300],
        f"<p>Booking {_e(event)} by {_e(mail.customer_name)}"
        f"{f' ({contact})' if contact else ''}.</p>{_details(mail)}{notes}",
    )
