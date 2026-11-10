"""Events lifecycles as declared tables. No database access, no database enums.

The status columns stay ``Text`` (no migration). Their values live here as str enums,
and every write to a status after the row is created goes through one guard per
entity: ``move_listing``, ``move_order``, ``move_ticket`` or ``move_connection``. A
guard checks its table first and raises ``EventsConflict`` (409) with the caller's
``refusal`` text when the move is not allowed. A row's first status is set by its
constructor, not by a transition.

Listing (an event), one row per event:

    save_draft / save_published / save_cancelled   any -> that status
                                                   (an organiser's PUT; saving as
                                                   cancelled also cancels, in the
                                                   service)
    cancel         published -> cancelled          (the organiser's cancel)

Order (a claim of tickets):

    fulfil         pending_payment -> confirmed    (the payment landed in time)
    expire         pending_payment -> expired      (the hold ran out, or the payment
                                                   was given back)
    refund         confirmed -> refunded           (a full refund of an online order)

Ticket (one admission):

    cancel         valid -> cancelled              (holder, event or order cancel)
    refund         valid -> refunded               (the order was refunded in full)
    refund_cancelled  cancelled -> refunded        (an outlet ticket of a cancelled
                                                   event; the service checks that)

Connection (a request between two members): ``accept`` from pending or accepted.

Report, suggestion and group membership carry enums only: staff may set any
report or suggestion status, and a membership is created as pending or active.
Giving them a table would change what the API accepts, so that is an owner decision.

Set-based SQL (bulk updates) cannot call a per-row guard, so it reads the same tables
through ``bulk_sources`` and ``bulk_target``. The refusal messages stay with the
callers, as they were before the tables existed.
"""

from collections.abc import Iterable, Mapping
from enum import Enum
from typing import Literal, NamedTuple

from .exceptions import EventsConflict
from .models import Connection, Listing, Order, Ticket


class ListingStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class OrderStatus(str, Enum):
    CONFIRMED = "confirmed"
    PENDING_PAYMENT = "pending_payment"
    EXPIRED = "expired"
    REFUNDED = "refunded"


class TicketStatus(str, Enum):
    VALID = "valid"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class ConnectionStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"


class ReportStatus(str, Enum):
    OPEN = "open"
    ACTIONED = "actioned"
    DISMISSED = "dismissed"


class SuggestionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class GroupMemberStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"


ListingAction = Literal["save_draft", "save_published", "save_cancelled", "cancel"]
OrderAction = Literal["fulfil", "expire", "refund"]
TicketAction = Literal["cancel", "refund", "refund_cancelled"]
ConnectionAction = Literal["accept"]


class Move[S: Enum](NamedTuple):
    allowed_from: frozenset[S]
    target: S


_ALL_LISTING = frozenset(ListingStatus)

LISTING_MOVES: dict[ListingAction, Move[ListingStatus]] = {
    "save_draft": Move(_ALL_LISTING, ListingStatus.DRAFT),
    "save_published": Move(_ALL_LISTING, ListingStatus.PUBLISHED),
    "save_cancelled": Move(_ALL_LISTING, ListingStatus.CANCELLED),
    "cancel": Move(frozenset({ListingStatus.PUBLISHED}), ListingStatus.CANCELLED),
}

ORDER_MOVES: dict[OrderAction, Move[OrderStatus]] = {
    "fulfil": Move(frozenset({OrderStatus.PENDING_PAYMENT}), OrderStatus.CONFIRMED),
    "expire": Move(frozenset({OrderStatus.PENDING_PAYMENT}), OrderStatus.EXPIRED),
    "refund": Move(frozenset({OrderStatus.CONFIRMED}), OrderStatus.REFUNDED),
}

TICKET_MOVES: dict[TicketAction, Move[TicketStatus]] = {
    "cancel": Move(frozenset({TicketStatus.VALID}), TicketStatus.CANCELLED),
    "refund": Move(frozenset({TicketStatus.VALID}), TicketStatus.REFUNDED),
    "refund_cancelled": Move(
        frozenset({TicketStatus.CANCELLED}), TicketStatus.REFUNDED
    ),
}

CONNECTION_MOVES: dict[ConnectionAction, Move[ConnectionStatus]] = {
    "accept": Move(
        frozenset({ConnectionStatus.PENDING, ConnectionStatus.ACCEPTED}),
        ConnectionStatus.ACCEPTED,
    ),
}

# Named groups, shared by the services and the SQL that filters on them.
#: An order that will never be paid or fulfilled again.
ORDER_ENDED = frozenset({OrderStatus.EXPIRED, OrderStatus.REFUNDED})
#: A ticket that no longer admits anyone.
TICKET_ENDED = frozenset({TicketStatus.CANCELLED, TicketStatus.REFUNDED})


def values_of[S: Enum](members: Iterable[S]) -> list[str]:
    """The stored strings for a group, sorted, for ``in_`` clauses."""
    return sorted(member.value for member in members)


def bulk_sources[A, S: Enum](table: Mapping[A, Move[S]], action: A) -> list[str]:
    """The stored states a set-based update of ``action`` may touch."""
    return values_of(table[action].allowed_from)


def bulk_target[A, S: Enum](table: Mapping[A, Move[S]], action: A) -> str:
    """The stored state a set-based update of ``action`` writes."""
    return str(table[action].target.value)


def stored_state[S: Enum](enum: type[S], stored: str) -> S:
    """The enum member for a stored string. A value outside the enum is a record we
    cannot act on: a 409 that names the value, never a 500."""
    try:
        return enum(stored)
    except ValueError:
        raise EventsConflict(f"This record has an unknown status '{stored}'") from None


def _guard[A, S: Enum](
    table: Mapping[A, Move[S]],
    enum: type[S],
    action: A,
    stored: str,
    refusal: str | None,
) -> S:
    """The target state when ``action`` may run from ``stored``; raises otherwise."""
    state = stored_state(enum, stored)
    move = table[action]
    if state not in move.allowed_from:
        raise EventsConflict(
            refusal or f"A {enum.__name__} cannot {action} from {state.value}"
        )
    return move.target


def move_listing(
    listing: Listing, action: ListingAction, *, refusal: str | None = None
) -> None:
    listing.status = _guard(
        LISTING_MOVES, ListingStatus, action, listing.status, refusal
    ).value


def move_order(
    order: Order, action: OrderAction, *, refusal: str | None = None
) -> None:
    order.status = _guard(ORDER_MOVES, OrderStatus, action, order.status, refusal).value


def move_ticket(
    ticket: Ticket, action: TicketAction, *, refusal: str | None = None
) -> None:
    ticket.status = _guard(
        TICKET_MOVES, TicketStatus, action, ticket.status, refusal
    ).value


def move_connection(
    link: Connection, action: ConnectionAction, *, refusal: str | None = None
) -> None:
    link.status = _guard(
        CONNECTION_MOVES, ConnectionStatus, action, link.status, refusal
    ).value
