"""Bus timetable version lifecycle as a declared table. No database access.

One timetable version (``TimetableVersion.status``), one move per action:

    publish  DRAFT -> PUBLISHED      the draft becomes a timetable with an effective date
    discard  DRAFT -> DISCARDED      the draft is abandoned; its trips are kept for audit

A version is created DRAFT by the insert in ``service.py``, which is not a move.
PUBLISHED and DISCARDED are final: a published timetable is replaced by publishing a
newer version, never edited. Whether a published version is current, scheduled or
superseded is worked out from its effective date (``service._state``); it is not stored.

Every write to ``TimetableVersion.status`` goes through ``move_version``, which checks
``TRANSITIONS`` first. ``EDITABLE`` is where the version and its trips may change;
``service._draft`` uses it for every edit, publish and discard.
"""

from typing import Literal, NamedTuple

from src.transport.exceptions import TransportConflict
from src.transport.models import TimetableVersion, TimetableVersionStatus

TimetableVersionMove = Literal["publish", "discard"]


class Transition(NamedTuple):
    allowed_from: frozenset[TimetableVersionStatus]
    target: TimetableVersionStatus


_D = TimetableVersionStatus.DRAFT
_P = TimetableVersionStatus.PUBLISHED
_X = TimetableVersionStatus.DISCARDED

TRANSITIONS: dict[TimetableVersionMove, Transition] = {
    "publish": Transition(frozenset({_D}), _P),
    "discard": Transition(frozenset({_D}), _X),
}

#: The version and its trips may change only while a draft.
EDITABLE: frozenset[TimetableVersionStatus] = frozenset({_D})

#: What staff are told when they act on a version that is no longer a draft.
NOT_A_DRAFT = "Only a draft timetable can be changed"


def can_move(state: TimetableVersionStatus, move: TimetableVersionMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_version(version: TimetableVersion, move: TimetableVersionMove) -> None:
    """Set ``version.status`` to the move's target. Raises a 409 when the table does
    not allow the move from the current status."""
    if not can_move(TimetableVersionStatus(version.status), move):
        raise TransportConflict(NOT_A_DRAFT)
    version.status = TRANSITIONS[move].target
