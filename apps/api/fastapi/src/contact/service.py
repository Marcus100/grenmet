"""Public contact-form messages: store, then queue one notification email."""

import html
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppValidationError
from src.notifications import service as notification_service
from src.utils.datetime import utc_now

from .config import contact_settings, recipient_for
from .models import ContactDataRequest, ContactMessage
from .schemas import ContactMessageCreate, DataRequestCreate

logger = logging.getLogger(__name__)


async def verify_turnstile(token: str | None) -> bool:  # noqa: ARG001
    """Seam for Cloudflare Turnstile (server-side Siteverify).

    Not enforced yet: the token is accepted and ignored. To enforce, POST the
    token to Siteverify here, return its ``success`` flag, and let
    ``submit_message`` raise ``AppValidationError`` on False.
    """
    return True


def _notification_html(message: ContactMessage) -> str:
    esc = html.escape
    body = esc(message.message).replace("\n", "<br>")
    return (
        f"<p><strong>From:</strong> {esc(message.name)} &lt;{esc(message.email)}&gt;"
        f"<br><strong>Site:</strong> {esc(message.site)}"
        f"<br><strong>Subject:</strong> {esc(message.subject)}</p><p>{body}</p>"
    )


async def submit_message(
    *, session: AsyncSession, payload: ContactMessageCreate
) -> ContactMessage:
    """Store the message; queue one email to the configured recipient."""
    if not await verify_turnstile(payload.turnstile_token):
        raise AppValidationError("Bot check failed")

    message = ContactMessage(
        site=payload.site.value,
        name=payload.name.strip(),
        email=str(payload.email).strip(),
        subject=payload.subject.strip(),
        message=payload.message.strip(),
    )
    session.add(message)
    await session.flush()

    recipient = recipient_for(message.site)
    if recipient:
        notification_service.enqueue_email(
            session=session,
            to_email=recipient,
            subject=f"Website message: {message.subject}"[:300],
            transactional=True,
            html=_notification_html(message),
        )
    else:
        logger.info(
            "Contact message stored; site recipient unset, not emailed",
            extra={"message_id": str(message.id), "site": message.site},
        )
    await session.commit()
    return message


GMS_SITE = "gms-data-request"


def _data_request_html(item: ContactDataRequest) -> str:
    esc = html.escape
    rows = [
        ("From", f"{item.name} <{item.email}>"),
        ("Organisation", item.organisation),
        ("Intended use", item.intended_use),
        ("Parameters", ", ".join(item.parameters)),
        ("Stations", item.stations),
        ("Period", f"{item.period_start} to {item.period_end}"),
        ("Format", item.data_format),
    ]
    lines = "".join(
        f"<br><strong>{label}:</strong> {esc(value)}" for label, value in rows
    )
    purpose = esc(item.purpose).replace("\n", "<br>")
    return f"<p>{lines[4:]}</p><p><strong>Purpose:</strong><br>{purpose}</p>"


async def submit_data_request(
    *, session: AsyncSession, payload: DataRequestCreate
) -> ContactDataRequest | None:
    """Store a GMS climate data request; mail the inbox and confirm to the requester.

    A filled honeypot field is dropped silently (the caller still sees success).
    """
    if payload.website:
        logger.info("Data request honeypot tripped; dropped")
        return None
    if not await verify_turnstile(payload.turnstile_token):
        raise AppValidationError("Bot check failed")

    item = ContactDataRequest(
        site=GMS_SITE,
        name=payload.name.strip(),
        email=str(payload.email).strip(),
        organisation=payload.organisation.strip(),
        purpose=payload.purpose.strip(),
        parameters=[p.value for p in payload.parameters],
        stations=payload.stations.strip(),
        period_start=payload.period_start,
        period_end=payload.period_end,
        data_format=payload.data_format.value,
        intended_use=payload.intended_use.value,
        consent_at=utc_now(),
    )
    session.add(item)
    await session.flush()

    recipient = contact_settings.GMS_DATA_REQUEST_RECIPIENT
    if recipient:
        notification_service.enqueue_email(
            session=session,
            to_email=recipient,
            subject=f"Climate data request: {item.organisation}"[:300],
            transactional=True,
            html=_data_request_html(item),
        )
    else:
        logger.info(
            "Data request stored; recipient unset, not emailed",
            extra={"request_id": str(item.id)},
        )
    notification_service.enqueue_email(
        session=session,
        to_email=item.email,
        subject="We received your climate data request",
        transactional=True,
        html=(
            f"<p>Hello {html.escape(item.name)},</p>"
            "<p>The Grenada Meteorological Service has received your climate "
            "data request. We will reply by email; typical turnaround is "
            "10 to 20 working days.</p>"
        ),
    )
    await session.commit()
    return item
