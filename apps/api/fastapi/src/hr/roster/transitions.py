"""Roster period lifecycle as a declared table. No database access.

One roster period (``RosterPeriod.status``), one move per action:

    publish  DRAFT -> PUBLISHED      a roster manager makes the period visible to staff
    close    PUBLISHED -> CLOSED     a roster manager locks the period

A period is created DRAFT by the insert in ``service.py``, which is not a move. There
is no move back: a published period is corrected by editing it (each change is checked
and recorded), never by returning it to DRAFT.

Every write to ``RosterPeriod.status`` goes through ``move_period``, which calls
``require_move`` first. ``REFUSALS`` holds the message for each refused pair, so the
wording a manager sees is declared next to the rule it explains.

Named groups: ``EDITABLE`` is where assignments may still change. The set of periods
staff can see (``ROSTER_VISIBLE_PERIOD_STATUSES``) stays in ``models.py``, where ten
other modules already import it.
"""

from typing import Literal, NamedTuple

from src.hr.constants import (
    ERROR_ROSTER_PERIOD_ALREADY_CLOSED,
    ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED,
    ERROR_ROSTER_PERIOD_NOT_PUBLISHED,
)
from src.hr.exceptions import HRValidationError

from .models import RosterPeriod, RosterPeriodStatus

RosterPeriodMove = Literal["publish", "close"]


class Transition(NamedTuple):
    allowed_from: frozenset[RosterPeriodStatus]
    target: RosterPeriodStatus


_D = RosterPeriodStatus.DRAFT
_P = RosterPeriodStatus.PUBLISHED
_C = RosterPeriodStatus.CLOSED

TRANSITIONS: dict[RosterPeriodMove, Transition] = {
    "publish": Transition(frozenset({_D}), _P),
    "close": Transition(frozenset({_P}), _C),
}

#: What a manager is told for each refused (move, current status) pair.
REFUSALS: dict[tuple[RosterPeriodMove, RosterPeriodStatus], str] = {
    ("publish", _P): ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED,
    ("publish", _C): ERROR_ROSTER_PERIOD_ALREADY_CLOSED,
    ("close", _C): ERROR_ROSTER_PERIOD_ALREADY_CLOSED,
    ("close", _D): ERROR_ROSTER_PERIOD_NOT_PUBLISHED,
}

#: Assignments may change in these states (a published change is checked and logged).
EDITABLE: frozenset[RosterPeriodStatus] = frozenset({_D, _P})


def can_move(state: RosterPeriodStatus, move: RosterPeriodMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def require_move(state: RosterPeriodStatus, move: RosterPeriodMove) -> None:
    """Raise the declared refusal (400, as before the table) when ``move`` is not
    allowed from ``state``."""
    state = RosterPeriodStatus(state)
    if not can_move(state, move):
        raise HRValidationError(REFUSALS[(move, state)])


def move_period(period: RosterPeriod, move: RosterPeriodMove) -> None:
    """Set ``period.status`` to the move's target after checking the table."""
    require_move(period.status, move)
    period.status = TRANSITIONS[move].target
