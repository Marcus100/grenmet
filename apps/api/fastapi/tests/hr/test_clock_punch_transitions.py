"""Table-driven checks for the clock punch review machine
(src/hr/attendance/transitions.py). The expected rows are written out here.
"""

from types import SimpleNamespace

import pytest

from src.exceptions import AppException
from src.hr.attendance import transitions as pt
from src.hr.attendance.models import ClockPunchStatus

_P = ClockPunchStatus.PENDING
_A = ClockPunchStatus.APPROVED
_R = ClockPunchStatus.REJECTED

EXPECTED_MOVES: dict[str, tuple[frozenset[ClockPunchStatus], ClockPunchStatus]] = {
    "approve": (frozenset({_P}), _A),
    "reject": (frozenset({_P}), _R),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(pt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert pt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert pt.TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(ClockPunchStatus))
def test_move_from_every_state(move: str, state: ClockPunchStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    punch = SimpleNamespace(status=state.value)

    if state in allowed_from:
        pt.move_punch(punch, move)
        assert punch.status == target.value
    else:
        with pytest.raises(AppException) as raised:
            pt.move_punch(punch, move)
        assert raised.value.status_code == 409
        assert punch.status == state.value


def test_repeat_of_a_final_state_is_refused_with_the_callers_message() -> None:
    approved = SimpleNamespace(status=_A.value)
    with pytest.raises(AppException, match="already approved"):
        pt.move_punch(
            approved, "reject", refusal="This clock punch was already approved"
        )
    rejected = SimpleNamespace(status=_R.value)
    with pytest.raises(AppException, match="already rejected"):
        pt.move_punch(
            rejected, "approve", refusal="This clock punch was already rejected"
        )


def test_live_statuses_are_everything_but_rejected() -> None:
    """The set HR counts as a punch that stands. Must match the SQL predicate
    ``status <> 'REJECTED'`` used in the clock and punch services."""
    assert pt.LIVE_PUNCH_STATUSES == frozenset(ClockPunchStatus) - {_R}
