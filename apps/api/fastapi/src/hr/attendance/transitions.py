"""Phone clock punch review as a declared table. No database access.

    approve   PENDING -> APPROVED    a supervisor approves it; the attendance record follows
    reject    PENDING -> REJECTED    a supervisor rejects it (a departure is also rejected
                                     when its arrival is)

APPROVED and REJECTED are final. Approving an approved punch, or rejecting a
rejected one, is a retry and changes nothing: the callers return early before they
ask for a move. Every other repeat is refused with the caller's message.

``LIVE_PUNCH_STATUSES`` is the set the rest of HR counts as a punch that stands
(anything but REJECTED). The database column is a plain string with no check
constraint, and the partial unique index on ``status <> 'REJECTED'`` is unchanged.
"""

from typing import Literal, NamedTuple

from src.exceptions import AppException

from .models import ClockPunch, ClockPunchStatus

PunchMove = Literal["approve", "reject"]


class Transition(NamedTuple):
    allowed_from: frozenset[ClockPunchStatus]
    target: ClockPunchStatus


_P = ClockPunchStatus.PENDING
_A = ClockPunchStatus.APPROVED
_R = ClockPunchStatus.REJECTED

TRANSITIONS: dict[PunchMove, Transition] = {
    "approve": Transition(frozenset({_P}), _A),
    "reject": Transition(frozenset({_P}), _R),
}

#: Not rejected: an open or accepted punch. Used in place of ``status != REJECTED``.
LIVE_PUNCH_STATUSES: frozenset[ClockPunchStatus] = frozenset({_P, _A})
#: The stored values of ``LIVE_PUNCH_STATUSES``, sorted, for SQL ``IN`` clauses.
LIVE_PUNCH_VALUES: tuple[str, ...] = tuple(
    sorted(status.value for status in LIVE_PUNCH_STATUSES)
)


def can_move(state: ClockPunchStatus, move: PunchMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_punch(
    punch: ClockPunch, move: PunchMove, *, refusal: str | None = None
) -> None:
    state = ClockPunchStatus(punch.status)
    if not can_move(state, move):
        raise AppException(
            refusal or f"A clock punch cannot {move} from status {state.value}", 409
        )
    punch.status = TRANSITIONS[move].target.value
