"""Bookings: the private calendar feed a business subscribes to on its phone.

One subscribed URL per organisation (``webcal://`` on iPhone, "From URL" in
Google Calendar). The studio creates it once (the full URL is returned only
then) and can rotate it, which ends the old URL. Only the SHA-256 of the token
is stored; the token is never logged.

The public feed lists the organisation's bookings from ``LOOKBACK_DAYS`` ago to
the profile's booking horizon. Pending, confirmed, completed and no-show
bookings are live events; a cancelled booking is sent as ``STATUS:CANCELLED``
for ``CANCELLED_KEEP_DAYS`` after it was cancelled, so subscribers remove it, and
then drops out. Each event carries the service, the provider, the customer's
first name only, and the profile's city. Phone, e-mail, notes and the manage
link never leave the database through this feed.

Unknown, malformed, rotated, disabled and unentitled feeds answer the same 404.
"""

import hashlib
import hmac
import logging
import re
import secrets
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.contacts.models import Contact
from src.utils.datetime import utc_now

from . import ics, service
from .exceptions import BookingConflictError, BookingNotFoundError
from .models import (
    Booking,
    BookingEvent,
    BookingProfile,
    BookingStatus,
    CalendarFeed,
    Customer,
    Provider,
    Service,
)

logger = logging.getLogger(__name__)

TOKEN_BYTES = 32
LOOKBACK_DAYS = 7
CANCELLED_KEEP_DAYS = 14
#: Safety cap on one feed. A busier business would need paging; the cap is far
#: above a year of a small studio's bookings inside the window.
MAX_EVENTS = 2000
#: Longest first name shown in an event title.
NAME_MAX_CHARS = 24
#: The limiter scope of the public feed. Without a scope slowapi keys the route's
#: limit by the request path, which carries the token; this scope keeps the token
#: out of Redis and the in-memory fallback.
RATE_LIMIT_SCOPE = "bookings-public-calendar"
_TOKEN_SHAPE = re.compile(r"[A-Za-z0-9_-]{16,100}")
_LIVE_STATUSES = (
    BookingStatus.PENDING.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.COMPLETED.value,
    BookingStatus.NO_SHOW.value,
)
_DEFAULT_API_BASE = {
    "staging": "https://api.staging.barrels.gd",
    "production": "https://api.barrels.gd",
}


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def token_matches(token: str, stored_hash: str) -> bool:
    """Constant-time check of a presented token against its stored hash."""
    return hmac.compare_digest(hash_token(token).encode(), stored_hash.encode())


def first_name(name: str | None) -> str | None:
    """The customer's first word, capped at ``NAME_MAX_CHARS``, or None.

    None when there is no name, or when the first word is not a name: an e-mail
    address (contains "@") or a number such as a phone number (no letters). Such
    a value was typed into the name field by mistake, so the event shows no name
    rather than a contact detail."""
    if not name:
        return None
    words = name.split()
    if not words:
        return None
    word = words[0]
    if "@" in word or not any(char.isalpha() for char in word):
        return None
    return word[:NAME_MAX_CHARS]


def feed_url(token: str) -> str:
    """The absolute https address of the feed for ``token`` (served by the API)."""
    base = (
        str(settings.API_BASE_URL)
        if settings.API_BASE_URL
        else _DEFAULT_API_BASE.get(settings.ENVIRONMENT, "http://localhost:8000")
    )
    return (
        f"{base.rstrip('/')}{settings.API_V1_STR}/bookings/public/calendar/{token}.ics"
    )


# --- studio: create, show, rotate ----------------------------------------------------------


async def get_feed(session: AsyncSession, organisation_id: str) -> CalendarFeed | None:
    row: CalendarFeed | None = await session.scalar(
        select(CalendarFeed).where(CalendarFeed.organisation_id == organisation_id)
    )
    return row


async def create_feed(
    session: AsyncSession, organisation_id: str
) -> tuple[str, CalendarFeed]:
    """Create the organisation's feed; the token is returned once, here.

    ``ON CONFLICT DO NOTHING`` makes two racing creates answer one 409 instead
    of an integrity error."""
    token = new_token()
    row_id = (
        await session.execute(
            insert(CalendarFeed)
            .values(
                id=uuid.uuid4(),
                organisation_id=organisation_id,
                token_hash=hash_token(token),
                created_at=utc_now(),
            )
            .on_conflict_do_nothing(index_elements=["organisation_id"])
            .returning(CalendarFeed.id)
        )
    ).scalar_one_or_none()
    if row_id is None:
        raise BookingConflictError(
            "A calendar feed already exists for this business; rotate it instead"
        )
    row = await session.get(CalendarFeed, row_id)
    if row is None:  # pragma: no cover - the row was inserted in this transaction
        raise BookingNotFoundError("Calendar feed")
    logger.info("Calendar feed created", extra={"organisation_id": organisation_id})
    return token, row


async def rotate_feed(
    session: AsyncSession, organisation_id: str
) -> tuple[str, CalendarFeed]:
    """Replace the token. The old URL stops matching at once."""
    row = await session.scalar(
        select(CalendarFeed)
        .where(CalendarFeed.organisation_id == organisation_id)
        .with_for_update()
    )
    if row is None:
        raise BookingNotFoundError("Calendar feed")
    token = new_token()
    row.token_hash = hash_token(token)
    row.rotated_at = utc_now()
    await session.flush()
    logger.info("Calendar feed rotated", extra={"organisation_id": organisation_id})
    return token, row


def link_payload(token: str, row: CalendarFeed) -> dict[str, Any]:
    return {
        "url": feed_url(token),
        "created_at": row.created_at,
        "rotated_at": row.rotated_at,
    }


# --- public: the feed itself ----------------------------------------------------------------


async def feed_ics(
    session: AsyncSession, token: str, *, now: datetime | None = None
) -> str:
    """The calendar text for a presented token; every miss is the same 404."""
    if not _TOKEN_SHAPE.fullmatch(token):
        raise BookingNotFoundError("Calendar feed")
    row = await session.scalar(
        select(CalendarFeed).where(CalendarFeed.token_hash == hash_token(token))
    )
    if row is None or not token_matches(token, row.token_hash):
        raise BookingNotFoundError("Calendar feed")
    profile = await session.scalar(
        select(BookingProfile).where(
            BookingProfile.organisation_id == row.organisation_id
        )
    )
    if profile is None or not profile.enabled:
        raise BookingNotFoundError("Calendar feed")
    await service.require_bookings_entitlement(session, profile, what="Calendar feed")
    moment = now or utc_now()
    rows = await _window_rows(session, profile, moment)
    events = [_event(booking_row, profile) for booking_row in rows]
    return ics.build_calendar_ics(calendar_name=profile.display_name, events=events)


async def _window_rows(
    session: AsyncSession, profile: BookingProfile, now: datetime
) -> Sequence[Any]:
    changes = (
        select(func.count())
        .where(BookingEvent.booking_id == Booking.id)
        .scalar_subquery()
    )
    cancelled_since = now - timedelta(days=CANCELLED_KEEP_DAYS)
    query = (
        select(
            Booking.id,
            Booking.starts_at,
            Booking.ends_at,
            Booking.status,
            Booking.updated_at,
            changes.label("changes"),
            Service.name.label("service_name"),
            Provider.name.label("provider_name"),
            Contact.name.label("customer_name"),
        )
        .join(Service, Service.id == Booking.service_id)
        .join(Provider, Provider.id == Booking.provider_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(
            Booking.organisation_id == profile.organisation_id,
            Booking.starts_at >= now - timedelta(days=LOOKBACK_DAYS),
            Booking.starts_at <= now + timedelta(days=profile.horizon_days),
            or_(
                Booking.status.in_(_LIVE_STATUSES),
                and_(
                    Booking.status == BookingStatus.CANCELLED.value,
                    func.coalesce(Booking.cancelled_at, Booking.updated_at)
                    >= cancelled_since,
                ),
            ),
        )
        .order_by(Booking.starts_at, Booking.id)
        .limit(MAX_EVENTS)
    )
    return (await session.execute(query)).all()


def _event(row: Any, profile: BookingProfile) -> ics.CalendarEvent:
    if row.status == BookingStatus.CANCELLED.value:
        status: ics.IcsStatus = "CANCELLED"
    elif row.status == BookingStatus.PENDING.value:
        status = "TENTATIVE"
    else:
        status = "CONFIRMED"
    name = first_name(row.customer_name)
    summary = f"{row.service_name} - {name}" if name else row.service_name
    return ics.CalendarEvent(
        uid=f"booking-{row.id}@barrels.gd",
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        summary=summary,
        stamp=row.updated_at,
        description=f"Provider: {row.provider_name}",
        location=profile.city,
        status=status,
        sequence=max((row.changes or 1) - 1, 0),
    )
