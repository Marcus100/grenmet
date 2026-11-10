"""Payroll lifecycles as declared tables. No database access.

Pay period (``PayPeriod.status``), one move per action:

    submit    OPEN -> IN_REVIEW       the preparer sends the period for approval
    approve   IN_REVIEW -> APPROVED   the approval workflow approves it (finalize hook)
    reopen    IN_REVIEW -> OPEN       the workflow returns, rejects or cancels it (finalize hook)
    export    APPROVED -> EXPORTED    the quantity CSV is produced
    close     EXPORTED -> CLOSED      the period is closed for good

Every write to ``PayPeriod.status`` made by ``service.py`` goes through ``move_period``,
which checks ``PERIOD_MOVES`` first. The callers keep their own, more specific checks
(and messages) before they reach the write.

Table rule state (``rule_state`` plus ``confirmed_by_user_id`` and ``confirmed_at`` on
the statutory and deduction tables) is set through ``set_table_state``. Any state may be
set from any other, because a confirmation can be withdrawn. PROVISIONAL clears the
confirmation; every other state records who confirmed it and when. The pay calendar,
pay item and pay item rate rows only ever start PROVISIONAL, so they have no move here.
"""

import uuid
from datetime import datetime
from typing import Any, Literal, NamedTuple

from src.exceptions import AppException

from .models import PayPeriod, PayPeriodStatus, TableState

PeriodMove = Literal["submit", "approve", "reopen", "export", "close"]


class PeriodTransition(NamedTuple):
    allowed_from: frozenset[PayPeriodStatus]
    target: PayPeriodStatus


_O = PayPeriodStatus.OPEN
_R = PayPeriodStatus.IN_REVIEW
_A = PayPeriodStatus.APPROVED
_E = PayPeriodStatus.EXPORTED
_C = PayPeriodStatus.CLOSED

PERIOD_MOVES: dict[PeriodMove, PeriodTransition] = {
    "submit": PeriodTransition(frozenset({_O}), _R),
    "approve": PeriodTransition(frozenset({_R}), _A),
    "reopen": PeriodTransition(frozenset({_R}), _O),
    "export": PeriodTransition(frozenset({_A}), _E),
    "close": PeriodTransition(frozenset({_E}), _C),
}


def can_period(state: PayPeriodStatus, move: PeriodMove) -> bool:
    return state in PERIOD_MOVES[move].allowed_from


def move_period(
    period: PayPeriod, move: PeriodMove, *, refusal: str | None = None
) -> None:
    """Set ``period.status`` to the move's target. Raises a 409 when the table does
    not allow the move from the current status, or when the stored value is not a
    declared status (a record we cannot act on is a conflict, never a 500)."""
    try:
        state = PayPeriodStatus(period.status)
    except ValueError:
        raise AppException(
            f"This pay period has an unknown status '{period.status}'", 409
        ) from None
    if not can_period(state, move):
        raise AppException(
            refusal or f"A pay period cannot {move} from status {state.value}", 409
        )
    period.status = PERIOD_MOVES[move].target.value


def set_table_state(
    record: Any, target: TableState, *, confirmer_id: uuid.UUID, at: datetime
) -> None:
    """Set a statutory or deduction table's rule state and its confirmation.

    ``target`` must be a declared state; a stored string is never written as is."""
    record.rule_state = TableState(target).value
    if target is TableState.PROVISIONAL:
        record.confirmed_by_user_id = None
        record.confirmed_at = None
    else:
        record.confirmed_by_user_id = confirmer_id
        record.confirmed_at = at
