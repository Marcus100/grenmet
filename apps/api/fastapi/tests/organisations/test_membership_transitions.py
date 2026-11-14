"""Table-driven checks for the membership lifecycle (src/organisations/transitions.py).
No database is needed."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.exceptions import AppException
from src.organisations import transitions as mt
from src.organisations.models import MembershipStatus

_A = MembershipStatus.ACTIVE
_I = MembershipStatus.INVITED
_R = MembershipStatus.REMOVED

EXPECTED_MOVES: dict[str, tuple[frozenset[MembershipStatus], MembershipStatus]] = {
    "remove": (frozenset({_A}), _R),
    "reactivate": (frozenset({_I, _R}), _A),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(mt.MEMBERSHIP_TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert mt.MEMBERSHIP_TRANSITIONS[move].allowed_from == allowed_from, move
        assert mt.MEMBERSHIP_TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(MembershipStatus))
def test_move_from_every_state(move: str, state: MembershipStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    membership: Any = SimpleNamespace(status=state.value)

    assert mt.can_move_membership(state, move) is (state in allowed_from)
    if state in allowed_from:
        mt.move_membership(membership, move)
        assert membership.status == target.value
    else:
        with pytest.raises(AppException) as raised:
            mt.move_membership(membership, move)
        assert raised.value.status_code == 409
        assert membership.status == state.value


def test_an_unknown_stored_status_is_a_conflict() -> None:
    membership: Any = SimpleNamespace(status="suspended")
    with pytest.raises(AppException) as raised:
        mt.move_membership(membership, "remove")
    assert raised.value.status_code == 409
    assert membership.status == "suspended"
