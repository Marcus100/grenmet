"""Events lifecycles as declared tables: every (state, action) pair.

The expected values below are written out by hand, not read from
``src.events.transitions``, so a change to a table shows up here as a failing case
and has to be made on purpose. No database: the guards are pure and run on
unsaved model instances.
"""

from collections.abc import Mapping
from enum import Enum
from typing import Any, get_args

import pytest

from src.events import schemas, transitions
from src.events.exceptions import EventsConflict
from src.events.models import Connection, Listing, Order, Ticket

LS = transitions.ListingStatus
OS = transitions.OrderStatus
TS = transitions.TicketStatus
CS = transitions.ConnectionStatus

ALL_LISTING = set(LS)

# listing action -> (states it may start from, state it leaves the listing in).
# A save (PUT) may set any status, which is what the service did before the table.
EXPECTED_LISTING: dict[transitions.ListingAction, tuple[set[LS], LS]] = {
    "save_draft": (ALL_LISTING, LS.DRAFT),
    "save_published": (ALL_LISTING, LS.PUBLISHED),
    "save_cancelled": (ALL_LISTING, LS.CANCELLED),
    "cancel": ({LS.PUBLISHED}, LS.CANCELLED),
}

# order action -> (states it may start from, target).
EXPECTED_ORDER: dict[transitions.OrderAction, tuple[set[OS], OS]] = {
    "fulfil": ({OS.PENDING_PAYMENT}, OS.CONFIRMED),
    "expire": ({OS.PENDING_PAYMENT}, OS.EXPIRED),
    "refund": ({OS.CONFIRMED}, OS.REFUNDED),
}

# ticket action -> (states it may start from, target).
EXPECTED_TICKET: dict[transitions.TicketAction, tuple[set[TS], TS]] = {
    "cancel": ({TS.VALID}, TS.CANCELLED),
    "refund": ({TS.VALID}, TS.REFUNDED),
    # A cancelled ticket is refunded only when its event was cancelled; the service
    # checks that rule, the table only checks the state.
    "refund_cancelled": ({TS.CANCELLED}, TS.REFUNDED),
}

# connection action -> (states it may start from, target). Accepting an accepted
# link is a replay the service has always allowed.
EXPECTED_CONNECTION: dict[transitions.ConnectionAction, tuple[set[CS], CS]] = {
    "accept": ({CS.PENDING, CS.ACCEPTED}, CS.ACCEPTED),
}


def _listing(status: LS) -> Listing:
    return Listing(status=status.value)


def _order(status: OS) -> Order:
    return Order(status=status.value)


def _ticket(status: TS) -> Ticket:
    return Ticket(status=status.value)


def _connection(status: CS) -> Connection:
    return Connection(status=status.value)


def _cases(expected: Mapping[Any, Any], states: list[Any]) -> list[tuple[Any, Any]]:
    return [(action, state) for action in expected for state in states]


@pytest.mark.parametrize(
    ("action", "state"), _cases(EXPECTED_LISTING, list(LS)), ids=str
)
def test_listing_moves(action: transitions.ListingAction, state: LS) -> None:
    allowed_from, target = EXPECTED_LISTING[action]
    listing = _listing(state)
    refusal = "refused by the table"
    if state in allowed_from:
        transitions.move_listing(listing, action, refusal=refusal)
        assert listing.status == target.value
    else:
        with pytest.raises(EventsConflict) as raised:
            transitions.move_listing(listing, action, refusal=refusal)
        assert raised.value.message == refusal
        assert listing.status == state.value


@pytest.mark.parametrize(("action", "state"), _cases(EXPECTED_ORDER, list(OS)), ids=str)
def test_order_moves(action: transitions.OrderAction, state: OS) -> None:
    allowed_from, target = EXPECTED_ORDER[action]
    order = _order(state)
    if state in allowed_from:
        transitions.move_order(order, action)
        assert order.status == target.value
    else:
        with pytest.raises(EventsConflict):
            transitions.move_order(order, action)
        assert order.status == state.value


@pytest.mark.parametrize(
    ("action", "state"), _cases(EXPECTED_TICKET, list(TS)), ids=str
)
def test_ticket_moves(action: transitions.TicketAction, state: TS) -> None:
    allowed_from, target = EXPECTED_TICKET[action]
    ticket = _ticket(state)
    refusal = "This ticket is already cancelled"
    if state in allowed_from:
        transitions.move_ticket(ticket, action, refusal=refusal)
        assert ticket.status == target.value
    else:
        with pytest.raises(EventsConflict) as raised:
            transitions.move_ticket(ticket, action, refusal=refusal)
        assert raised.value.message == refusal
        assert ticket.status == state.value


@pytest.mark.parametrize(
    ("action", "state"), _cases(EXPECTED_CONNECTION, list(CS)), ids=str
)
def test_connection_moves(action: transitions.ConnectionAction, state: CS) -> None:
    allowed_from, target = EXPECTED_CONNECTION[action]
    link = _connection(state)
    if state in allowed_from:
        transitions.move_connection(link, action)
        assert link.status == target.value
    else:
        with pytest.raises(EventsConflict):
            transitions.move_connection(link, action)
        assert link.status == state.value


@pytest.mark.parametrize(
    ("guard", "make_row", "action"),
    [
        (transitions.move_listing, lambda: Listing(status="archived"), "cancel"),
        (transitions.move_order, lambda: Order(status="archived"), "expire"),
        (transitions.move_ticket, lambda: Ticket(status="archived"), "cancel"),
        (transitions.move_connection, lambda: Connection(status="archived"), "accept"),
    ],
)
def test_an_unknown_stored_status_is_a_409_naming_the_value(
    guard: Any, make_row: Any, action: str
) -> None:
    row = make_row()
    with pytest.raises(EventsConflict) as raised:
        guard(row, action)
    assert raised.value.status_code == 409
    assert raised.value.message == "This record has an unknown status 'archived'"
    assert row.status == "archived"


def test_stored_state_maps_known_and_unknown_values() -> None:
    assert transitions.stored_state(OS, "refunded") is OS.REFUNDED
    with pytest.raises(EventsConflict) as raised:
        transitions.stored_state(OS, "archived")
    assert raised.value.status_code == 409


def test_every_table_action_is_declared_once() -> None:
    assert set(EXPECTED_LISTING) == set(transitions.LISTING_MOVES)
    assert set(EXPECTED_ORDER) == set(transitions.ORDER_MOVES)
    assert set(EXPECTED_TICKET) == set(transitions.TICKET_MOVES)
    assert set(EXPECTED_CONNECTION) == set(transitions.CONNECTION_MOVES)


def test_named_groups() -> None:
    assert transitions.ORDER_ENDED == {OS.EXPIRED, OS.REFUNDED}
    assert transitions.TICKET_ENDED == {TS.CANCELLED, TS.REFUNDED}
    assert transitions.values_of(transitions.TICKET_ENDED) == ["cancelled", "refunded"]


def test_bulk_sources_match_the_table() -> None:
    # Set-based SQL uses these instead of a per-row guard.
    assert transitions.bulk_sources(transitions.TICKET_MOVES, "cancel") == ["valid"]
    assert transitions.bulk_target(transitions.TICKET_MOVES, "cancel") == "cancelled"
    assert transitions.bulk_sources(transitions.TICKET_MOVES, "refund") == ["valid"]
    assert transitions.bulk_sources(transitions.ORDER_MOVES, "expire") == [
        "pending_payment"
    ]
    assert transitions.bulk_target(transitions.ORDER_MOVES, "expire") == "expired"


@pytest.mark.parametrize(
    ("enum", "contract"),
    [
        (LS, schemas.ListingStatusName),
        (OS, schemas.OrgOrderStatus),
        (TS, schemas.OrgTicketStatus),
    ],
)
def test_enum_values_match_the_api_contract(enum: type[Enum], contract: object) -> None:
    # The Pydantic Literal the API exposes must list exactly the enum's values.
    assert set(get_args(contract)) == {member.value for member in enum}


def test_enum_values_are_the_stored_strings() -> None:
    # Columns stay Text (no migration): the enum values are the stored strings.
    assert {member.value for member in LS} == {"draft", "published", "cancelled"}
    assert {member.value for member in OS} == {
        "confirmed",
        "pending_payment",
        "expired",
        "refunded",
    }
    assert {member.value for member in TS} == {"valid", "cancelled", "refunded"}
