"""Public contact-form messages: store, then queue one notification email."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.notifications import service as notification_service
from src.organisations.sites import ResolvedSite
from src.utils.datetime import utc_now

from . import email_cards
from .config import contact_settings, recipient_for
from .models import ContactDataRequest, ContactMessage
from .schemas import ContactMessageBody, DataRequestCreate

logger = logging.getLogger(__name__)


def site_recipient(site_key: str, site: ResolvedSite | None) -> str | None:
    """The site's own inbox, else the deprecated environment setting."""
    if site is not None and site.contact_recipient:
        return site.contact_recipient
    return recipient_for(site_key)


def _queue(
    session: AsyncSession,
    to_email: str,
    card: layout.EmailCard,
    organisation_id: str | None = None,
) -> None:
    notification_service.enqueue_email(
        session=session,
        to_email=to_email,
        subject=card.subject,
        transactional=True,
        template=layout.CARD_TEMPLATE,
        props=layout.to_props(card),
        organisation_id=organisation_id,
    )


async def submit_message(
    *,
    session: AsyncSession,
    payload: ContactMessageBody,
    site_key: str,
    site: ResolvedSite | None,
) -> ContactMessage:
    """Store the message; queue one email to the site's recipient."""
    message = ContactMessage(
        site=site_key,
        name=payload.name.strip(),
        email=str(payload.email).strip(),
        subject=payload.subject.strip(),
        message=payload.message.strip(),
    )
    session.add(message)
    await session.flush()

    recipient = site_recipient(site_key, site)
    if recipient:
        _queue(
            session,
            recipient,
            email_cards.website_message(
                site=message.site,
                name=message.name,
                email=message.email,
                subject=message.subject,
                message=message.message,
            ),
            # Only the site's own inbox belongs to the business; the deprecated
            # environment recipient is a platform address.
            organisation_id=(
                site.organisation_id
                if site is not None and site.contact_recipient
                else None
            ),
        )
    else:
        logger.info(
            "Contact message stored; site recipient unset, not emailed",
            extra={"message_id": str(message.id), "site": message.site},
        )
    await session.commit()
    return message


GMS_SITE = "gms-data-request"


async def submit_data_request(
    *, session: AsyncSession, payload: DataRequestCreate
) -> ContactDataRequest | None:
    """Store a GMS climate data request; mail the inbox and confirm to the requester.

    A filled honeypot field is dropped silently (the caller still sees success).
    """
    if payload.website:
        logger.info("Data request honeypot tripped; dropped")
        return None
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
        _queue(session, recipient, email_cards.data_request_for_staff(item))
    else:
        logger.info(
            "Data request stored; recipient unset, not emailed",
            extra={"request_id": str(item.id)},
        )
    _queue(session, item.email, email_cards.data_request_received(item.name))
    await session.commit()
    return item
