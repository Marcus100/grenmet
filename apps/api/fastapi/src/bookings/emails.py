"""Booking emails: subject, HTML and plain text. Pure: each builder returns an
``EmailCard`` (``src.email_layout``): the card data, rendered at delivery.

Every value is escaped by the layout. Times are shown in the profile's timezone and
named ("Grenada time"). Links come from the profile's ``manage_url_template``;
nothing here knows a site's address. No ticket codes or QR tokens appear here; the signed manage link is the one token a mail carries.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from src import email_layout as layout
from src.email_colour import safe_accent
from src.storage.public_url import public_file_url
from src.utils.timezones import utc_to_local


def business_logo(name: str, file_id: uuid.UUID | None) -> layout.Logo | None:
    """The business logo for the card header, alt text being the business name.
    None when the business has no logo, or no public API address is configured."""
    url = public_file_url(file_id)
    return layout.Logo(url, alt=name) if url and name else None


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
    #: Where to create a free account (ADR-0058). Set only for a customer whose
    #: booking is not linked to an account; the mail then invites, never insists.
    account_invite_url: str | None = None
    #: Service length in minutes (the calendar end and "duration" in the When row).
    duration_min: int | None = None
    #: Short booking reference (the first eight characters of the booking id).
    reference: str | None = None
    #: Changes inside this many hours of the start are arranged with the business.
    cancel_cutoff_hours: int | None = None
    #: The business's own contact details, shown in the footer when set.
    business_email: str | None = None
    business_phone: str | None = None
    #: The business's brand: accent (falls back to navy when too pale) and logo.
    accent: str | None = None
    logo: layout.Logo | None = None
    #: "Deposit paid XCD x, remaining XCD y at the salon." once a deposit is paid.
    payment_line: str | None = None

    @property
    def when(self) -> str:
        local = utc_to_local(self.starts_at, self.tz)
        return local.strftime("%A %d %B %Y, %I:%M %p").replace(" 0", " ")


def zone_label(tz: ZoneInfo) -> str:
    """How a mail names the business's clock: "Grenada time", else the IANA name."""
    if tz.key == "America/Grenada":
        return "Grenada time"
    return f"{tz.key} time"


def _when_line(mail: BookingEmail) -> str:
    value = f"{mail.when} ({zone_label(mail.tz)})"
    if mail.duration_min:
        value += f" · {layout.duration_label(mail.duration_min)}"
    return value


def _rows(mail: BookingEmail, *extra: layout.Row) -> tuple[layout.Row, ...]:
    rows = [
        layout.Row("What", f"{mail.service_name} with {mail.provider_name}"),
        layout.Row("When", _when_line(mail)),
    ]
    if mail.reference:
        rows.append(layout.Row("Reference", mail.reference))
    if mail.payment_line:
        rows.append(layout.Row("Payment", mail.payment_line))
    return (*rows, *extra)


def _manage(mail: BookingEmail) -> layout.Action | None:
    return layout.Action("Manage booking", mail.manage_url) if mail.manage_url else None


def _calendar(mail: BookingEmail) -> tuple[layout.Action, ...]:
    """Add-to-calendar (Google). Apple and Outlook need an .ics URL, which the mail
    does not have, so no button is offered for them."""
    if not mail.duration_min:
        return ()
    ends = mail.starts_at + timedelta(minutes=mail.duration_min)
    url = layout.google_calendar_url(
        title=f"{mail.service_name} with {mail.business}",
        starts_at=mail.starts_at,
        ends_at=ends,
        details=f"Booking reference {mail.reference}" if mail.reference else None,
    )
    return (layout.Action("Add to Google Calendar", url),)


def _policy(mail: BookingEmail) -> tuple[str, ...]:
    hours = mail.cancel_cutoff_hours
    if not hours or hours <= 0:
        return ()
    noun = "hour" if hours == 1 else "hours"
    return (
        f"Changes made less than {hours} {noun} before the start are arranged "
        f"with {mail.business}.",
    )


def _invite(mail: BookingEmail) -> dict[str, object]:
    """The optional invitation, as a quiet paragraph with one link. It promises
    only what the code does: the customer's bookings with this business are listed
    under My bookings once they are signed in with the same email and book again."""
    if not mail.account_invite_url:
        return {}
    return {
        "quiet": (
            "Booking never needs an account. If you would like one, it is free. "
            "Once you are signed in with this email address and book with "
            f"{mail.business}, your bookings with them, including this one, are "
            "listed under My bookings."
        ),
        "quiet_link": layout.Action(
            "Create a free account or sign in", mail.account_invite_url
        ),
    }


def _footer(mail: BookingEmail, why: str) -> str:
    contact = [part for part in (mail.business_email, mail.business_phone) if part]
    if contact:
        return f"{why} Contact {mail.business} at {' or '.join(contact)}."
    return f"{why} Contact {mail.business} about this booking."


def _card(mail: BookingEmail, **fields: Any) -> layout.EmailCard:
    """A customer card for this booking; ``fields`` override the defaults."""
    base: dict[str, Any] = {
        "eyebrow": mail.business,
        "accent": safe_accent(mail.accent),
        "logo": mail.logo,
        "greeting": f"Hello {layout.first_name(mail.customer_name)},",
        "rows": _rows(mail),
        "footer": _footer(
            mail, f"You are getting this email because you booked with {mail.business}."
        ),
    }
    base.update(fields)
    return layout.EmailCard(**base)


def verification_code(*, business: str, code: str, minutes: int) -> layout.EmailCard:
    """The code that proves a visitor controls the booking email (deposit step)."""
    card = layout.EmailCard(
        eyebrow=business,
        title="Your booking code",
        paragraphs=(
            "Enter this code on the booking page to confirm your email address.",
            f"It expires in {minutes} minutes.",
        ),
        code=code,
        footer=(
            "If you did not ask for this code, you can ignore this email. "
            f"You are getting it because someone used this address to book with {business}."
        ),
    )
    return layout.with_subject(f"Your {business} booking code", card)


def customer_received(mail: BookingEmail, *, confirmed: bool) -> layout.EmailCard:
    if confirmed:
        return layout.with_subject(
            f"Your booking at {mail.business} is confirmed",
            _card(
                mail,
                chip=layout.Chip("Confirmed"),
                title="Your booking is confirmed",
                paragraphs=(f"Thank you for booking with {mail.business}.",),
                primary=_manage(mail),
                secondary=_calendar(mail),
                policy=_policy(mail),
                **_invite(mail),
            ),
        )
    return layout.with_subject(
        f"We received your booking request at {mail.business}",
        _card(
            mail,
            chip=layout.Chip("Request received"),
            title="We received your booking request",
            paragraphs=(f"We will email you once {mail.business} confirms it.",),
            primary=_manage(mail),
            **_invite(mail),
        ),
    )


def customer_cancelled(mail: BookingEmail) -> layout.EmailCard:
    return layout.with_subject(
        f"Your booking at {mail.business} was cancelled",
        _card(
            mail,
            chip=layout.Chip("Cancelled", layout.ChipTone.MUTED),
            title="Your booking was cancelled",
            paragraphs=("This booking will not go ahead.",),
        ),
    )


def _reason_row(reason: str | None) -> tuple[layout.Row, ...]:
    return (layout.Row("Reason", reason),) if reason else ()


def customer_confirmed(mail: BookingEmail) -> layout.EmailCard:
    """The business accepted a booking request."""
    return layout.with_subject(
        f"Your booking at {mail.business} is confirmed",
        _card(
            mail,
            chip=layout.Chip("Confirmed"),
            title="Your booking is confirmed",
            paragraphs=(f"{mail.business} has confirmed your booking request.",),
            primary=_manage(mail),
            secondary=_calendar(mail),
            policy=_policy(mail),
            **_invite(mail),
        ),
    )


def customer_declined(mail: BookingEmail, reason: str | None) -> layout.EmailCard:
    """The business could not accept a booking request."""
    return layout.with_subject(
        f"Your booking request at {mail.business} could not be accepted",
        _card(
            mail,
            chip=layout.Chip("Not accepted", layout.ChipTone.MUTED),
            title="We could not accept your booking request",
            paragraphs=(
                f"Sorry, {mail.business} could not accept your booking request.",
            ),
            rows=_rows(mail, *_reason_row(reason)),
        ),
    )


def customer_cancelled_by_studio(
    mail: BookingEmail, reason: str | None
) -> layout.EmailCard:
    """The business cancelled a booking."""
    return layout.with_subject(
        f"Your booking at {mail.business} was cancelled",
        _card(
            mail,
            chip=layout.Chip("Cancelled", layout.ChipTone.MUTED),
            title="Your booking was cancelled",
            paragraphs=(f"{mail.business} had to cancel your booking.",),
            rows=_rows(mail, *_reason_row(reason)),
        ),
    )


def customer_rescheduled(
    mail: BookingEmail, *, confirmed: bool = True
) -> layout.EmailCard:
    """The customer moved their own booking. ``confirmed`` false is a request the
    business has not accepted yet: no calendar button, and the mail says so."""
    waiting: tuple[str, ...] = (
        ()
        if confirmed
        else (
            f"{mail.business} has not confirmed this booking yet. "
            "We will email you as soon as they do.",
        )
    )
    return layout.with_subject(
        f"Your booking at {mail.business} has a new time",
        _card(
            mail,
            chip=layout.Chip("Rescheduled"),
            title="Your booking has a new time",
            paragraphs=("Your booking was moved.", *waiting),
            primary=_manage(mail),
            secondary=_calendar(mail) if confirmed else (),
            policy=_policy(mail),
        ),
    )


def customer_rescheduled_by_studio(
    mail: BookingEmail, *, confirmed: bool = True
) -> layout.EmailCard:
    """The business moved a booking. It carries a signed manage link (the stored
    token is only a hash) but no account invitation: moves carry none.

    ``confirmed`` false is a request the business has not accepted yet; the mail
    says it is still waiting and promises only an email once they decide."""
    waiting: tuple[str, ...] = (
        ()
        if confirmed
        else (
            f"{mail.business} has not confirmed this booking yet. "
            "We will email you as soon as they do.",
        )
    )
    return layout.with_subject(
        f"Your booking at {mail.business} has a new time",
        _card(
            mail,
            chip=layout.Chip("Rescheduled"),
            title="Your booking has a new time",
            paragraphs=(
                f"{mail.business} has moved your booking to a new time.",
                *waiting,
            ),
            primary=_manage(mail),
            secondary=_calendar(mail) if confirmed else (),
            policy=(
                f"If this time does not suit you, please contact {mail.business}.",
            ),
        ),
    )


def customer_reminder(
    mail: BookingEmail, *, confirmed: bool = True
) -> layout.EmailCard:
    """A reminder within a day of the start: the manage link and, for a guest,
    the account invitation (ADR-0058).

    ``confirmed`` false is a request the business has not accepted yet: the
    wording says so and promises only what happens (an email once they decide).
    """
    if confirmed:
        return layout.with_subject(
            f"Reminder: your booking at {mail.business}",
            _card(
                mail,
                chip=layout.Chip("Reminder"),
                title="Your booking is coming up",
                paragraphs=("A reminder of your booking within the next day.",),
                primary=_manage(mail),
                secondary=_calendar(mail),
                policy=_policy(mail),
                **_invite(mail),
            ),
        )
    return layout.with_subject(
        f"Reminder: your booking request at {mail.business}",
        _card(
            mail,
            chip=layout.Chip("Reminder"),
            title="Your booking request is coming up",
            paragraphs=(
                "A reminder of your booking request for the next day. "
                f"{mail.business} has not confirmed it yet. "
                "We will email you as soon as they do.",
            ),
            primary=_manage(mail),
            **_invite(mail),
        ),
    )


_STUDIO_HEADLINES = {
    "created": ("New booking", layout.Chip("New booking")),
    "requested": ("New booking request", layout.Chip("Request")),
    "cancelled": ("Booking cancelled", layout.Chip("Cancelled", layout.ChipTone.MUTED)),
    "rescheduled": ("Booking moved", layout.Chip("Rescheduled")),
}


def studio_notice(mail: BookingEmail, *, event: str) -> layout.EmailCard:
    """``event``: ``created``, ``requested``, ``cancelled`` or ``rescheduled``."""
    headline, chip = _STUDIO_HEADLINES[event]
    contact = ", ".join(
        part for part in (mail.customer_email, mail.customer_phone) if part
    )
    rows = _rows(
        mail,
        layout.Row("Customer", mail.customer_name),
        layout.Row("Contact", contact),
        layout.Row("Notes", mail.notes or ""),
    )
    card = layout.EmailCard(
        accent=safe_accent(mail.accent),
        logo=mail.logo,
        eyebrow=mail.business,
        chip=chip,
        title=f"{headline} from {mail.customer_name}",
        rows=rows,
        footer=f"Automatic notice for {mail.business} staff, sent to the booking notice address.",
    )
    return layout.with_subject(
        f"Booking {event}: {mail.customer_name} ({mail.service_name})", card
    )
