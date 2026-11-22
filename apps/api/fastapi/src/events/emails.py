"""Email for ticket orders and events (N4b, refund receipts, reminders). Pure: each
builder returns an ``EmailCard`` (``src.email_layout``): subject and the card data.

Every value is escaped by the layout. The mails carry public listing details and
amounts; no ticket codes or QR tokens (those stay behind the buyer's sign-in).
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from src import email_layout as layout
from src.email_colour import safe_accent
from src.storage.public_url import public_file_url
from src.utils.timezones import GRENADA, utc_to_local

GRENADA_TIME = "Grenada time"


@dataclass(frozen=True)
class Brand:
    """The organiser's name, accent and logo for its mail. The defaults are the
    Barrels look with no organiser named."""

    name: str | None = None
    accent: str | None = None
    logo: layout.Logo | None = None


def brand(
    name: str | None, brand_color: str | None, logo_file_id: uuid.UUID | None
) -> Brand:
    """The organiser's brand. The logo needs a public API address and the name (alt text)."""
    url = public_file_url(logo_file_id)
    logo = layout.Logo(url, alt=name) if url and name else None
    return Brand(name=name or None, accent=brand_color, logo=logo)


def _money(minor: int, currency: str) -> str:
    return f"{currency} {minor / 100:,.2f}"


def _when(starts_at: datetime, ends_at: datetime | None = None) -> str:
    local = utc_to_local(starts_at, GRENADA)
    value = (
        f"{local.strftime('%A %d %B %Y, %I:%M %p').replace(' 0', ' ')} ({GRENADA_TIME})"
    )
    if ends_at is not None and ends_at > starts_at:
        value += f" · {layout.duration_label(int((ends_at - starts_at) / timedelta(minutes=1)))}"
    return value


def _eyebrow(organiser: str | None) -> str:
    return f"{organiser} · Barrels Events" if organiser else "Barrels Events"


def _calendar(
    title: str,
    starts_at: datetime,
    ends_at: datetime | None,
    venue: str,
) -> tuple[layout.Action, ...]:
    if ends_at is None:
        return ()
    url = layout.google_calendar_url(
        title=title, starts_at=starts_at, ends_at=ends_at, location=venue or None
    )
    return (layout.Action("Add to Google Calendar", url),)


def refund_policy_line(policy: str, cutoff_hours: int) -> str:
    """The refund terms the buyer sees on a paid order (``refund_policy`` is
    ``refundable`` or ``no_refunds``)."""
    if policy == "no_refunds":
        return (
            "Tickets for this event cannot be refunded, except when the organiser "
            "cancels the event."
        )
    return (
        f"Refunds are available up to {cutoff_hours} hours before the start, less any "
        "cancellation fee. If the organiser cancels the event, you get a full refund."
    )


def order_confirmation(
    *,
    buyer_name: str,
    title: str,
    starts_at: datetime,
    ticket_count: int,
    total_minor: int,
    currency: str,
    venue: str = "",
    tickets_url: str | None = None,
    ends_at: datetime | None = None,
    organiser: str | None = None,
    refund_policy: str | None = None,
    refund_cutoff_hours: int = 48,
    brand: Brand | None = None,
) -> layout.EmailCard:
    """Receipt sent once the payment is captured and the tickets are issued."""
    noun = "ticket" if ticket_count == 1 else "tickets"
    policy = (
        (refund_policy_line(refund_policy, refund_cutoff_hours),)
        if refund_policy
        else ()
    )
    look = brand or Brand()
    card = layout.EmailCard(
        accent=safe_accent(look.accent),
        logo=look.logo,
        eyebrow=_eyebrow(organiser),
        chip=layout.Chip("Confirmed"),
        title=f"You're going to {title}",
        greeting=f"Hello {layout.first_name(buyer_name)},",
        paragraphs=(
            f"Thank you. We received your payment and issued {ticket_count} {noun} "
            f"for {title}.",
            "Sign in and open My tickets to show the QR code at the door.",
        ),
        rows=(
            layout.Row("What", f"{title} · {ticket_count} {noun}"),
            layout.Row("When", _when(starts_at, ends_at)),
            layout.Row("Where", venue),
        ),
        money=(layout.Row("Paid", _money(total_minor, currency)),),
        primary=layout.Action("View tickets", tickets_url),
        secondary=_calendar(title, starts_at, ends_at, venue),
        policy=policy,
        footer=(
            "You are getting this email because you bought tickets on Barrels Events. "
            f"Questions about this event: contact {organiser or 'the organiser'} through "
            "Barrels Events."
        ),
    )
    return layout.with_subject(f"Your tickets for {title}", card)


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
    tickets_valid: bool = True,
    fee_kept_minor: int = 0,
    brand: Brand | None = None,
) -> layout.EmailCard:
    """Receipt for one refund on an order. ``full`` means everything paid on the
    order is now refunded (the tickets are cancelled). Otherwise it is partial:
    ``tickets_valid`` says whether the order's tickets still work (a partial refund
    on an organiser cancel leaves them cancelled, with a fee kept). ``fee_kept_minor``
    is what the policy kept as a cancellation fee, named in the receipt when above
    zero. ``card`` is a provider (card) refund, which takes days to show."""
    if full:
        scope = "This refunds your whole order and its tickets are cancelled."
    elif tickets_valid:
        scope = "This is a partial refund; your tickets stay valid."
    else:
        scope = "This is a partial refund; the tickets on this order are cancelled."
    paragraphs = [
        f"We refunded {_money(refund_minor, currency)} for {title} "
        f"(order {order_ref}). {scope}"
    ]
    if event_cancelled:
        paragraphs.insert(0, f"The organiser cancelled {title}.")
    policy = [
        "The money goes back to the card you paid with. Your bank usually shows it "
        "within 5 to 10 business days."
        if card
        else "The organiser returns this to you directly."
    ]
    if fee_kept_minor > 0 and not full:
        policy.insert(
            0,
            f"{_money(fee_kept_minor, currency)} was kept as the cancellation fee "
            "under the event's refund policy.",
        )
    look = brand or Brand()
    card_model = layout.EmailCard(
        accent=safe_accent(look.accent),
        logo=look.logo,
        eyebrow=_eyebrow(look.name),
        chip=layout.Chip("Refunded", layout.ChipTone.MUTED),
        title="You have been refunded" if full else "Part of your order was refunded",
        greeting=f"Hello {layout.first_name(buyer_name)},",
        paragraphs=tuple(paragraphs),
        rows=(
            layout.Row("Event", title),
            layout.Row("Reference", order_ref),
        ),
        money=(layout.Row("Refunded", _money(refund_minor, currency)),),
        policy=tuple(policy),
        footer=(
            "You are getting this email because you bought tickets on Barrels Events."
        ),
    )
    return layout.with_subject(f"Refund for {title}", card_model)


def event_reminder(
    *,
    name: str,
    title: str,
    starts_at: datetime,
    venue: str,
    tickets_url: str,
    ends_at: datetime | None = None,
    brand: Brand | None = None,
) -> layout.EmailCard:
    """Reminder about an event starting in about a day (times in Grenada)."""
    look = brand or Brand()
    card = layout.EmailCard(
        accent=safe_accent(look.accent),
        logo=look.logo,
        eyebrow=_eyebrow(look.name),
        chip=layout.Chip("Reminder"),
        title=f"{title} is coming up",
        greeting=f"Hello {layout.first_name(name)},",
        paragraphs=(f"{title} starts soon.",),
        rows=(
            layout.Row("When", _when(starts_at, ends_at)),
            layout.Row("Where", venue),
        ),
        primary=layout.Action("View tickets", tickets_url),
        secondary=_calendar(title, starts_at, ends_at, venue),
        policy=("Show your QR code at the door from My tickets.",),
        footer="You are getting this email because you hold a ticket for this event.",
    )
    return layout.with_subject(f"Reminder: {title} is coming up", card)
