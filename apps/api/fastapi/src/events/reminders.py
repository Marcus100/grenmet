"""24-hour event reminders (hourly job ``enqueue_event_reminders``).

Ticket holders (valid tickets) and RSVP "going" members of a published event that
starts in ``[now + 23h, now + 24h)`` get one reminder email on the platform outbox.
The window is one cron interval wide, so each event falls in exactly one hourly
run. The dedupe key ``events-reminder:<listing id>:<user id>:<start timestamp>``
makes a rerun queue nothing, while an event moved to a new time reminds again.

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

import uuid
from datetime import datetime, timedelta

from sqlalchemy import literal, select, tuple_, union
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.notifications.config import notification_settings
from src.notifications.outbox_handlers import enqueue_email
from src.utils.datetime import utc_now

from . import emails
from .models import Listing, Rsvp, Ticket

WINDOW_START = timedelta(hours=23)
WINDOW_END = timedelta(hours=24)
PAGE_SIZE = 500
MAX_PAGES = 20


def reminder_key(listing_id: uuid.UUID, user_id: uuid.UUID, starts_at: datetime) -> str:
    return f"events-reminder:{listing_id}:{user_id}:{starts_at.isoformat()}"


async def enqueue_due_reminders(
    db: AsyncSession, *, now: datetime | None = None
) -> int:
    """Queue reminders for events starting in [now+23h, now+24h). The caller commits.

    Returns how many reminders were newly queued."""
    moment = now or utc_now()
    audience = union(
        select(Ticket.listing_id, Ticket.user_id).where(
            Ticket.status == "valid", Ticket.user_id.is_not(None)
        ),
        select(Rsvp.listing_id, Rsvp.user_id),
    ).subquery()
    base = (
        select(Listing, User)
        .join(audience, audience.c.listing_id == Listing.id)
        .join(User, User.id == audience.c.user_id)
        .where(
            Listing.status == "published",
            Listing.starts_at >= moment + WINDOW_START,
            Listing.starts_at < moment + WINDOW_END,
            User.is_active.is_(True),
            User.email.is_not(None),
        )
        .order_by(Listing.id, User.id)
        .limit(PAGE_SIZE)
    )
    tickets_url = f"{auth_settings.EVENTS_APP_URL.rstrip('/')}/me/tickets"
    queued = 0
    after: tuple[uuid.UUID, uuid.UUID] | None = None
    for _ in range(MAX_PAGES):
        query = base
        if after is not None:
            query = query.where(
                tuple_(Listing.id, User.id)
                > tuple_(literal(after[0]), literal(after[1]))
            )
        rows = (await db.execute(query)).all()
        for listing, user in rows:
            if not user.email or not notification_settings.email_allowed(user.email):
                continue
            subject, body = emails.event_reminder(
                name=user.first_name,
                title=listing.title,
                starts_at=listing.starts_at,
                venue=listing.venue,
                tickets_url=tickets_url,
            )
            if await enqueue_email(
                db,
                to_email=user.email,
                subject=subject,
                html=body,
                transactional=True,
                dedupe_key=reminder_key(listing.id, user.id, listing.starts_at),
            ):
                queued += 1
        if len(rows) < PAGE_SIZE:
            break
        last_listing, last_user = rows[-1]
        after = (last_listing.id, last_user.id)
    return queued
