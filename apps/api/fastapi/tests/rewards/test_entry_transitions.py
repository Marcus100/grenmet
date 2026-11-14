"""Table-driven checks for the ledger entry lifecycle (src/rewards/transitions.py).
No database is needed."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.rewards import transitions as et
from src.rewards.exceptions import RewardsConflictError
from src.rewards.models import EntryStatus

_P = EntryStatus.PENDING
_C = EntryStatus.CONFIRMED
_R = EntryStatus.REVERSED

EXPECTED_MOVES: dict[str, tuple[frozenset[EntryStatus], EntryStatus]] = {
    "confirm": (frozenset({_P}), _C),
    "reverse": (frozenset({_P, _C}), _R),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(et.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert et.TRANSITIONS[move].allowed_from == allowed_from, move
        assert et.TRANSITIONS[move].target == target, move


def test_reversed_is_final() -> None:
    assert not any(_R in row.allowed_from for row in et.TRANSITIONS.values())


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(EntryStatus))
def test_move_from_every_state(move: str, state: EntryStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    entry: Any = SimpleNamespace(status=state.value)

    assert et.can_move(state, move) is (state in allowed_from)
    if state in allowed_from:
        et.move_entry(entry, move)
        assert entry.status == target.value
    else:
        with pytest.raises(RewardsConflictError) as raised:
            et.move_entry(entry, move)
        assert raised.value.status_code == 409
        assert entry.status == state.value


def test_an_unknown_stored_status_is_a_conflict() -> None:
    entry: Any = SimpleNamespace(status="voided")
    with pytest.raises(RewardsConflictError) as raised:
        et.move_entry(entry, "reverse")
    assert raised.value.status_code == 409
    assert entry.status == "voided"
