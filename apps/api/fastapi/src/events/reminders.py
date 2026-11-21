"""24-hour event reminders (hourly job ``enqueue_event_reminders``).

Holders of a valid ticket for a published event that starts within the next 24
hours (``now < starts_at <= now + 24h``) get one reminder email on the platform
outbox. The window is deliberately wider than one cron interval: a late or skipped
run, or an event published or booked less than a day before it starts, is still
caught by the next run. The dedupe key
``events-reminder:<listing id>:<user id>:<start timestamp>`` makes every later run
queue nothing for the same event time, while an event moved to a new time
reminds again.

Cancelled events are not published, so they are skipped; a postponed event is a
published one with a new ``starts_at`` and is reminded for the new time. Refunded
or cancelled tickets do not count. Filtering, the join to the member and paging are
done in SQL (keyset pages, no per-row queries).

The email goes straight to ``enqueue_email`` (not ``notifications.notify``): the
reminder carries the venue and a My tickets link to the Events app, whereas notify
links to the staff portal and has no Events reminder preference to honour. The
``NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS`` guard is applied here because the
``email.send`` handler does not apply it.

TODO(ADR-0047): listings will get occurrences; this query then moves from
``Listing.starts_at`` to the occurrence start and keys on the occurrence id.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import literal, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from src import email_layout as layout
from src.auth.models import User
from src.email import business_sender_name
from src.notifications.config import notification_settings
from src.notifications.outbox_handlers import enqueue_email
from src.utils.datetime import utc_now

from . import emails
from .models import Listing, Organiser, Ticket
from .order_fulfilment import my_tickets_url

HORIZON = timedelta(hours=24)
PAGE_SIZE = 500
MAX_PAGES = 20

logger = logging.getLogger(__name__)


def reminder_key(listing_id: uuid.UUID, user_id: uuid.UUID, starts_at: datetime) -> str:
    return f"events-reminder:{listing_id}:{user_id}:{starts_at.isoformat()}"


async def enqueue_due_reminders(
    db: AsyncSession, *, now: datetime | None = None
) -> int:
    """Queue reminders for events starting in (now, now+24h]. The caller commits.

    Returns how many reminders were newly queued."""
    moment = now or utc_now()
    audience = (
        select(Ticket.listing_id, Ticket.user_id)
        .where(Ticket.status == "valid", Ticket.user_id.is_not(None))
        .distinct()
        .subquery()
    )
    base = (
        select(Listing, User, Organiser)
        .join(audience, audience.c.listing_id == Listing.id)
        .join(User, User.id == audience.c.user_id)
        .join(Organiser, Organiser.id == Listing.organiser_id)
        .where(
            Listing.status == "published",
            Listing.starts_at > moment,
            Listing.starts_at <= moment + HORIZON,
            User.is_active.is_(True),
            User.email.is_not(None),
        )
        .order_by(Listing.id, User.id)
        .limit(PAGE_SIZE)
    )
    tickets_url = my_tickets_url()
    queued = 0
    after: tuple[uuid.UUID, uuid.UUID] | None = None
    for page in range(MAX_PAGES):
        query = base
        if after is not None:
            query = query.where(
                tuple_(Listing.id, User.id)
                > tuple_(literal(after[0]), literal(after[1]))
            )
        rows = (await db.execute(query)).all()
        for listing, user, organiser in rows:
            if not user.email or not notification_settings.email_allowed(user.email):
                continue
            message = emails.event_reminder(
                name=user.first_name,
                title=listing.title,
                starts_at=listing.starts_at,
                ends_at=listing.ends_at,
                venue=listing.venue,
                tickets_url=tickets_url,
            )
            if await enqueue_email(
                db,
                to_email=user.email,
                subject=message.subject,
                template=layout.CARD_TEMPLATE,
                props=layout.to_props(message),
                transactional=False,  # a reminder: skips suppressed addresses
                dedupe_key=reminder_key(listing.id, user.id, listing.starts_at),
                from_name=business_sender_name(organiser.name) or None,
            ):
                queued += 1
        if len(rows) < PAGE_SIZE:
            break
        if page == MAX_PAGES - 1:
            logger.warning(
                "event reminders stopped at the paging cap (%s rows); the rest "
                "are queued by the next hourly run",
                PAGE_SIZE * MAX_PAGES,
            )
        last_listing, last_user, _ = rows[-1]
        after = (last_listing.id, last_user.id)
    return queued
