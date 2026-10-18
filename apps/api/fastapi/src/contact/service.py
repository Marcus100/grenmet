"""Public contact-form messages: store, then queue one notification email."""

import html
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppValidationError
from src.notifications import service as notification_service

from .config import contact_settings
from .models import ContactMessage
from .schemas import ContactMessageCreate

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

    recipient = contact_settings.MBIA_CONTACT_RECIPIENT
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
            "Contact message stored; MBIA_CONTACT_RECIPIENT unset, not emailed",
            extra={"message_id": str(message.id), "site": message.site},
        )
    await session.commit()
    return message
