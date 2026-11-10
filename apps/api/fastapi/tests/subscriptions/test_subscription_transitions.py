"""Table-driven checks for the subscription lifecycle (src/subscriptions/transitions.py).

The expected rows are written out here, so a change to the lifecycle is an explicit
edit of this file. No database is needed.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from src.exceptions import AppException
from src.subscriptions import transitions as st
from src.subscriptions.models import SubscriptionStatus

_P = SubscriptionStatus.PENDING
_C = SubscriptionStatus.CONFIRMED
_U = SubscriptionStatus.UNSUBSCRIBED

EXPECTED_MOVES: dict[str, tuple[frozenset[SubscriptionStatus], SubscriptionStatus]] = {
    "resubscribe": (frozenset({_U}), _P),
    "confirm": (frozenset({_P}), _C),
    "unsubscribe": (frozenset({_P, _C}), _U),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(st.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert st.TRANSITIONS[move].allowed_from == allowed_from, move
        assert st.TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(SubscriptionStatus))
def test_move_from_every_state(move: str, state: SubscriptionStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    row: Any = SimpleNamespace(status=state.value)

    if state in allowed_from:
        st.move_subscription(row, move)
        assert row.status == target.value
    else:
        with pytest.raises(AppException) as raised:
            st.move_subscription(row, move)
        assert raised.value.status_code == 409
        assert row.status == state.value


def test_unknown_stored_status_is_a_conflict_not_a_crash() -> None:
    row: Any = SimpleNamespace(status="bounced")
    with pytest.raises(AppException, match="unknown status 'bounced'") as raised:
        st.move_subscription(row, "unsubscribe")
    assert raised.value.status_code == 409
