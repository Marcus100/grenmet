"""Model-guidance access request lifecycle as a declared table. No database access.

One access request (``GuidanceAccessRequest.status``), one move per decision:

    approve  PENDING -> APPROVED     a platform reviewer grants the organisation access
    reject   PENDING -> REJECTED     a platform reviewer declines it

A request is created PENDING (an insert, not a move). Both outcomes are final for
that request; an organisation that was declined sends a new request.

The one write to ``GuidanceAccessRequest.status`` goes through ``move_request``, which
checks ``TRANSITIONS`` first and refuses a request that was already decided.
"""

from typing import Literal, NamedTuple

from .exceptions import AccessRequestDecidedError
from .models import AccessRequestStatus, GuidanceAccessRequest

AccessRequestMove = Literal["approve", "reject"]


class Transition(NamedTuple):
    allowed_from: frozenset[AccessRequestStatus]
    target: AccessRequestStatus


_P = AccessRequestStatus.PENDING

TRANSITIONS: dict[AccessRequestMove, Transition] = {
    "approve": Transition(frozenset({_P}), AccessRequestStatus.APPROVED),
    "reject": Transition(frozenset({_P}), AccessRequestStatus.REJECTED),
}


def can_move(state: str, move: AccessRequestMove) -> bool:
    """False for a move the table refuses and for a stored value it does not know."""
    try:
        return AccessRequestStatus(state) in TRANSITIONS[move].allowed_from
    except ValueError:
        return False


def move_request(request: GuidanceAccessRequest, move: AccessRequestMove) -> None:
    """Set ``request.status`` to the move's target. Raises the 409 "already decided"
    refusal when the request is not PENDING."""
    if not can_move(request.status, move):
        raise AccessRequestDecidedError()
    request.status = TRANSITIONS[move].target.value
