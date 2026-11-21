"""Contact-form emails as cards (``src.email_layout``). Pure: no database, no I/O.

The mails to staff inboxes carry the visitor's text. The layout escapes every value,
and the text is shown as plain rows and paragraphs, never as a link.
"""

from src import email_layout as layout

from .models import ContactDataRequest


def _lines(text: str) -> tuple[str, ...]:
    """One paragraph per non-empty line of the visitor's message."""
    return tuple(line.strip() for line in text.splitlines() if line.strip())


def website_message(
    *, site: str, name: str, email: str, subject: str, message: str
) -> layout.EmailCard:
    card = layout.EmailCard(
        title="New website message",
        rows=(
            layout.Row("From", f"{name} <{email}>"),
            layout.Row("Site", site),
            layout.Row("Subject", subject),
        ),
        paragraphs=_lines(message),
        footer="This message came through the contact form on the website.",
    )
    return layout.with_subject(f"Website message: {subject}", card)


def data_request_for_staff(item: ContactDataRequest) -> layout.EmailCard:
    card = layout.EmailCard(
        title="New climate data request",
        rows=(
            layout.Row("From", f"{item.name} <{item.email}>"),
            layout.Row("Organisation", item.organisation),
            layout.Row("Intended use", item.intended_use),
            layout.Row("Parameters", ", ".join(item.parameters)),
            layout.Row("Stations", item.stations),
            layout.Row("Period", f"{item.period_start} to {item.period_end}"),
            layout.Row("Format", item.data_format),
        ),
        paragraphs=("Purpose:", *_lines(item.purpose)),
        footer="Automatic notice for the climate data request inbox.",
    )
    return layout.with_subject(f"Climate data request: {item.organisation}", card)


def data_request_received(name: str) -> layout.EmailCard:
    """The confirmation to the requester."""
    card = layout.EmailCard(
        eyebrow="Grenada Meteorological Service",
        title="We received your climate data request",
        greeting=f"Hello {name},",
        paragraphs=(
            "We will reply by email; typical turnaround is 10 to 20 working days.",
        ),
        footer=(
            "You are getting this email because this address was used on the climate "
            "data request form."
        ),
    )
    return layout.with_subject("We received your climate data request", card)
