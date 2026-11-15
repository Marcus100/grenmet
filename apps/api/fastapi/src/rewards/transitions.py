"""Rewards ledger entry lifecycle as a declared table. No database access.

One ledger entry (``Entry.status``), one move per action:

    confirm  PENDING -> CONFIRMED               a pending earn settles, or staff accept
                                                a customer's redemption code
    reverse  PENDING, CONFIRMED -> REVERSED     the entry is undone; a negating entry
                                                is appended next to it

An entry is inserted PENDING or CONFIRMED (an insert is not a move): earns from a
refundable source and redemptions start PENDING; everything else is born CONFIRMED.
REVERSED is final, and the ledger is append-only: a reversal never deletes or edits
the amount, it adds a ``reverse`` entry.

Every later write to ``Entry.status`` goes through ``move_entry``, which checks
``TRANSITIONS`` first. The callers keep their own answers for a second attempt (a
reversal of a reversed entry returns nothing; a used code is refused with its own
message) before they reach the write.

This table is about ``Entry.status`` only. Programme and challenge status are
two-way switches (active, paused) where every move is allowed, so they have no table.
"""

from typing import Literal, NamedTuple

from .exceptions import RewardsConflictError
from .models import Entry, EntryStatus

EntryMove = Literal["confirm", "reverse"]


class Transition(NamedTuple):
    allowed_from: frozenset[EntryStatus]
    target: EntryStatus


_P = EntryStatus.PENDING
_C = EntryStatus.CONFIRMED
_R = EntryStatus.REVERSED

TRANSITIONS: dict[EntryMove, Transition] = {
    "confirm": Transition(frozenset({_P}), _C),
    "reverse": Transition(frozenset({_P, _C}), _R),
}


def can_move(state: EntryStatus, move: EntryMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_entry(entry: Entry, move: EntryMove) -> None:
    """Set ``entry.status`` to the move's target. Raises a 409 when the table does
    not allow the move, or when the stored value is not a declared status."""
    try:
        state = EntryStatus(entry.status)
    except ValueError:
        raise RewardsConflictError(
            f"This ledger entry has an unknown status '{entry.status}'"
        ) from None
    if not can_move(state, move):
        raise RewardsConflictError(
            f"A ledger entry cannot {move} from status {state.value}"
        )
    entry.status = TRANSITIONS[move].target.value
