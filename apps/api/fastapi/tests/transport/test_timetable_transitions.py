"""Table-driven checks for the timetable version lifecycle
(src/transport/timetable/transitions.py). No database is needed."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.transport.exceptions import TransportConflict
from src.transport.models import TimetableVersionStatus
from src.transport.timetable import transitions as tt

_D = TimetableVersionStatus.DRAFT
_P = TimetableVersionStatus.PUBLISHED
_X = TimetableVersionStatus.DISCARDED

EXPECTED_MOVES: dict[
    str, tuple[frozenset[TimetableVersionStatus], TimetableVersionStatus]
] = {
    "publish": (frozenset({_D}), _P),
    "discard": (frozenset({_D}), _X),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(tt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert tt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert tt.TRANSITIONS[move].target == target, move


def test_only_a_draft_is_editable() -> None:
    assert tt.EDITABLE == frozenset({_D})


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(TimetableVersionStatus))
def test_move_from_every_state(move: str, state: TimetableVersionStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    version: Any = SimpleNamespace(status=state)

    assert tt.can_move(state, move) is (state in allowed_from)
    if state in allowed_from:
        tt.move_version(version, move)
        assert version.status is target
    else:
        with pytest.raises(TransportConflict) as raised:
            tt.move_version(version, move)
        assert raised.value.status_code == 409
        assert raised.value.message == "Only a draft timetable can be changed"
        assert version.status is state
