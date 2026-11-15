"""Table-driven checks for the access request lifecycle
(src/models_guidance/transitions.py). No database is needed."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.models_guidance import transitions as gt
from src.models_guidance.exceptions import AccessRequestDecidedError
from src.models_guidance.models import AccessRequestStatus

_P = AccessRequestStatus.PENDING

EXPECTED_MOVES: dict[
    str, tuple[frozenset[AccessRequestStatus], AccessRequestStatus]
] = {
    "approve": (frozenset({_P}), AccessRequestStatus.APPROVED),
    "reject": (frozenset({_P}), AccessRequestStatus.REJECTED),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(gt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert gt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert gt.TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("stored", [s.value for s in AccessRequestStatus] + ["lost"])
def test_move_from_every_stored_value(move: str, stored: str) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    request: Any = SimpleNamespace(status=stored)
    allowed = stored in {state.value for state in allowed_from}

    assert gt.can_move(stored, move) is allowed
    if allowed:
        gt.move_request(request, move)
        assert request.status == target.value
    else:
        with pytest.raises(AccessRequestDecidedError) as raised:
            gt.move_request(request, move)
        assert raised.value.status_code == 409
        assert request.status == stored
