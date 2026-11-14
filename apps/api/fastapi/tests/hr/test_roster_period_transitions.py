"""Table-driven checks for the roster period lifecycle (src/hr/roster/transitions.py).

The expected rows and refusal messages are written out here, so a change to the
lifecycle is an explicit edit of this file. No database is needed.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from src.hr.exceptions import HRValidationError
from src.hr.roster import transitions as rt
from src.hr.roster.models import ROSTER_VISIBLE_PERIOD_STATUSES, RosterPeriodStatus

_D = RosterPeriodStatus.DRAFT
_P = RosterPeriodStatus.PUBLISHED
_C = RosterPeriodStatus.CLOSED

EXPECTED_MOVES: dict[str, tuple[frozenset[RosterPeriodStatus], RosterPeriodStatus]] = {
    "publish": (frozenset({_D}), _P),
    "close": (frozenset({_P}), _C),
}

EXPECTED_REFUSALS: dict[tuple[str, RosterPeriodStatus], str] = {
    ("publish", _P): "Roster period is already published",
    ("publish", _C): "Roster period is already closed",
    ("close", _C): "Roster period is already closed",
    ("close", _D): "Roster period must be published before closing",
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(rt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert rt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert rt.TRANSITIONS[move].target == target, move


def test_every_refused_pair_has_its_message() -> None:
    refused = {
        (move, state)
        for move, (allowed_from, _) in EXPECTED_MOVES.items()
        for state in RosterPeriodStatus
        if state not in allowed_from
    }
    assert set(rt.REFUSALS) == refused
    assert rt.REFUSALS == EXPECTED_REFUSALS


def test_named_groups() -> None:
    assert rt.EDITABLE == frozenset({_D, _P})
    # Staff see a period from the moment it is published, and still after it closes.
    assert set(ROSTER_VISIBLE_PERIOD_STATUSES) == {_P, _C}


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(RosterPeriodStatus))
def test_move_from_every_state(move: str, state: RosterPeriodStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    period: Any = SimpleNamespace(status=state)

    assert rt.can_move(state, move) is (state in allowed_from)
    if state in allowed_from:
        rt.require_move(state, move)
        rt.move_period(period, move)
        assert period.status is target
    else:
        with pytest.raises(HRValidationError) as raised:
            rt.move_period(period, move)
        assert raised.value.status_code == 400
        assert raised.value.message == EXPECTED_REFUSALS[(move, state)]
        assert period.status is state


@pytest.mark.parametrize(
    ("state", "expected"),
    [(_D, ["edit", "publish"]), (_P, ["edit", "close"]), (_C, [])],
)
def test_allowed_actions_follow_the_table(
    state: RosterPeriodStatus, expected: list[str]
) -> None:
    assert rt.allowed_actions(state) == expected


def test_the_read_schema_derives_allowed_actions_and_ignores_input() -> None:
    import uuid
    from datetime import UTC, date, datetime

    from src.hr.roster.schemas import RosterPeriodPublic

    now = datetime(2026, 11, 1, tzinfo=UTC)
    period = RosterPeriodPublic(
        id=uuid.uuid4(),
        department_id="met",
        period_start=date(2026, 11, 1),
        period_end=date(2026, 11, 30),
        status=_C,
        created_by_user_id=uuid.uuid4(),
        created_at=now,
        updated_at=now,
        allowed_actions=["publish"],
    )
    assert period.allowed_actions == []
