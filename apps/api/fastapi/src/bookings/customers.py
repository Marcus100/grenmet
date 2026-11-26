"""The studio's customers list: one row per customer, built from the bookings.

Read only. Name, email and phone come from the contact (ADR-0028); the booking
facts are grouped, searched, ordered and paged in SQL.
"""

import re

from sqlalchemy import ColumnElement, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts.models import Contact
from src.utils.datetime import utc_now

from .models import ACTIVE_STATUSES, Booking, BookingStatus, Customer
from .schemas import BookingCustomerList, BookingCustomerListItem

#: A booking that was cancelled never counts towards a customer's bookings.
_COUNTED = [
    status.value for status in BookingStatus if status != BookingStatus.CANCELLED
]
#: A past booking is a visit when it was kept (not cancelled, not a no-show).
_VISITED = (BookingStatus.CONFIRMED.value, BookingStatus.COMPLETED.value)
_UPCOMING = [status.value for status in ACTIVE_STATUSES]
#: Shortest run of digits treated as a phone search.
_MIN_PHONE_DIGITS = 3


def _search(q: str | None) -> list[ColumnElement[bool]]:
    """Case-insensitive match on name, email or phone. A phone also matches on
    its digits alone, so "4735550100" finds "+1 473 555 0100"."""
    term = (q or "").strip()
    if not term:
        return []
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    matches: list[ColumnElement[bool]] = [
        Contact.name.ilike(pattern, escape="\\"),
        Contact.email.ilike(pattern, escape="\\"),
        Contact.phone.ilike(pattern, escape="\\"),
    ]
    digits = re.sub(r"\D", "", term)
    if len(digits) >= _MIN_PHONE_DIGITS and not re.search(r"[A-Za-z@]", term):
        matches.append(
            func.regexp_replace(Contact.phone, r"\D", "", "g").like(f"%{digits}%")
        )
    return [or_(*matches)]


async def list_customers(
    session: AsyncSession,
    organisation_id: str,
    *,
    q: str | None,
    limit: int,
    offset: int,
) -> BookingCustomerList:
    """The organisation's customers that have at least one booking that was not
    cancelled: who has a booking coming up first (soonest first), then the most
    recent visit. An erased contact is left out: nothing is left to show."""
    moment = utc_now()
    counted = Booking.status.in_(_COUNTED)
    bookings_count = func.count(Booking.id).filter(counted)
    last_visit_at = func.max(
        case(
            (
                (Booking.starts_at < moment) & Booking.status.in_(_VISITED),
                Booking.starts_at,
            )
        )
    )
    next_booking_at = func.min(
        case(
            (
                (Booking.starts_at >= moment) & Booking.status.in_(_UPCOMING),
                Booking.starts_at,
            )
        )
    )
    grouped = (
        select(
            Customer.id.label("id"),
            Contact.name.label("name"),
            Contact.email.label("email"),
            Contact.phone.label("phone"),
            bookings_count.label("bookings_count"),
            last_visit_at.label("last_visit_at"),
            next_booking_at.label("next_booking_at"),
        )
        .join(Contact, Contact.id == Customer.contact_id)
        .join(Booking, Booking.customer_id == Customer.id)
        .where(
            Customer.organisation_id == organisation_id,
            Contact.organisation_id == organisation_id,
            Booking.organisation_id == organisation_id,
            Contact.erased_at.is_(None),
            *_search(q),
        )
        .group_by(Customer.id, Contact.id)
        .having(bookings_count > 0)
        .subquery()
    )
    total = await session.scalar(select(func.count()).select_from(grouped)) or 0
    rows = (
        await session.execute(
            select(grouped)
            .order_by(
                grouped.c.next_booking_at.asc().nulls_last(),
                grouped.c.last_visit_at.desc().nulls_last(),
                func.lower(func.coalesce(grouped.c.name, "")),
                grouped.c.id,
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return BookingCustomerList(
        total=total,
        limit=limit,
        offset=offset,
        customers=[
            BookingCustomerListItem(
                id=row.id,
                name=row.name or "",
                email=row.email,
                phone=row.phone,
                bookings_count=row.bookings_count,
                last_visit_at=row.last_visit_at,
                next_booking_at=row.next_booking_at,
                returning=row.bookings_count > 1,
            )
            for row in rows
        ],
    )
