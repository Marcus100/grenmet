"""Add-on rules for bookings (owner request 23 Nov 2026). Pure: no database.

An add-on is a service flagged ``is_add_on``. It is never booked alone: a booking
keeps one main service and up to ``MAX_PER_BOOKING`` add-ons. Its length and
price add to the main service's. The main service's buffers apply; an add-on's
own buffers and its own deposit are not used. The deposit rule applies to the
combined price (``deposit_payments``). Add-ons need no provider link: the
provider who takes the main service takes them too.

A main service flagged ``also_add_on`` is booked alone as a main service and can
also be attached as an add-on (never to itself). ``is_add_on`` still means add-on
only and clears ``also_add_on``.

``add_on_categories`` restricts an add-on to main services in those categories
(compared exactly, as stored). Null or empty means any main service.
"""

from collections.abc import Sequence

#: Most add-ons one booking can carry.
MAX_PER_BOOKING = 5


def offered_with(
    add_on_categories: Sequence[str] | None, main_category: str | None
) -> bool:
    """True when an add-on with these category restrictions is offered with a
    main service in ``main_category``."""
    if not add_on_categories:
        return True
    return main_category is not None and main_category in add_on_categories


def normalised_categories(values: Sequence[str] | None) -> list[str] | None:
    """Trim and de-duplicate restriction categories, keeping their order. Blank
    input (or nothing left after trimming) means no restriction: None."""
    if not values:
        return None
    seen: dict[str, None] = {}
    for value in values:
        cleaned = value.strip()
        if cleaned:
            seen.setdefault(cleaned, None)
    return list(seen) or None
