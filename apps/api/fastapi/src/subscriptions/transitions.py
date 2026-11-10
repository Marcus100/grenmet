"""Mailing-list subscription lifecycle as a declared table. No database access.

One row is one address on one list (``ListSubscription.status``):

    resubscribe  UNSUBSCRIBED -> PENDING     a fresh sign-up starts double opt-in again
    confirm      PENDING -> CONFIRMED        the emailed confirmation link is followed
    unsubscribe  PENDING, CONFIRMED -> UNSUBSCRIBED
                                             one list is stopped (the address is kept off
                                             that list only); repeating it is a no-op

A row is created ``PENDING`` by the insert in ``service.py``, which is not a move.
Every later write to ``ListSubscription.status`` goes through ``move_subscription``,
which checks ``TRANSITIONS`` first. The callers keep their own early returns (an
already confirmed row, an already unsubscribed row) before they reach the write.
"""

from typing import Any, Literal, NamedTuple

from src.exceptions import AppException

from .models import SubscriptionStatus

SubscriptionMove = Literal["resubscribe", "confirm", "unsubscribe"]


class Transition(NamedTuple):
    allowed_from: frozenset[SubscriptionStatus]
    target: SubscriptionStatus


_P = SubscriptionStatus.PENDING
_C = SubscriptionStatus.CONFIRMED
_U = SubscriptionStatus.UNSUBSCRIBED

TRANSITIONS: dict[SubscriptionMove, Transition] = {
    "resubscribe": Transition(frozenset({_U}), _P),
    "confirm": Transition(frozenset({_P}), _C),
    "unsubscribe": Transition(frozenset({_P, _C}), _U),
}


def can_move(state: SubscriptionStatus, move: SubscriptionMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_subscription(
    row: Any, move: SubscriptionMove, *, refusal: str | None = None
) -> None:
    """Set ``row.status`` to the move's target. Raises a 409 when the table does not
    allow the move from the current status, or when the stored value is not a declared
    status (a record we cannot act on is a conflict, never a 500)."""
    try:
        state = SubscriptionStatus(row.status)
    except ValueError:
        raise AppException(
            f"This subscription has an unknown status '{row.status}'", 409
        ) from None
    if not can_move(state, move):
        raise AppException(
            refusal or f"A subscription cannot {move} from status {state.value}", 409
        )
    row.status = TRANSITIONS[move].target.value
