"""Booking status state machine: a table, no database access.

``pending_payment`` waits for a deposit (B6), ``pending`` waits for the business
to confirm, ``confirmed`` is on the books. ``cancelled``, ``no_show`` and
``completed`` are final. Every change goes through ``public.transition``,
which writes a ``BookingEvent`` row.
"""

from .models import ACTIVE_STATUSES, BookingStatus

TRANSITIONS: dict[BookingStatus, frozenset[BookingStatus]] = {
    BookingStatus.PENDING_PAYMENT: frozenset(
        {BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CANCELLED}
    ),
    BookingStatus.PENDING: frozenset(
        {BookingStatus.CONFIRMED, BookingStatus.CANCELLED}
    ),
    BookingStatus.CONFIRMED: frozenset(
        {BookingStatus.CANCELLED, BookingStatus.NO_SHOW, BookingStatus.COMPLETED}
    ),
    BookingStatus.CANCELLED: frozenset(),
    BookingStatus.NO_SHOW: frozenset(),
    BookingStatus.COMPLETED: frozenset(),
}


def can_transition(current: BookingStatus, target: BookingStatus) -> bool:
    return target in TRANSITIONS[current]


def is_active(status: BookingStatus) -> bool:
    """Whether the booking still holds the provider's time."""
    return status in ACTIVE_STATUSES
