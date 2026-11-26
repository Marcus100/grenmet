"""The moves of the two case-engine status columns (ADR-0069). Every status write
is here.

Case: reported, assessing, investigating, actions, monitoring, closed. A case
moves forward, may skip the investigation, may go back from monitoring to actions,
and may close from any stage (the rules for closing are checked in
``service.py``). A closed case reopens into assessing. Action: open, done,
verified; a done or verified action can be sent back to open.
"""

import uuid

from src.utils.datetime import utc_now

from .exceptions import CaseConflictError
from .models import Case, CaseAction, CaseActionStatus, CaseStatus

_S = CaseStatus
CASE_TRANSITIONS: dict[str, frozenset[str]] = {
    _S.REPORTED.value: frozenset({_S.ASSESSING.value, _S.CLOSED.value}),
    _S.ASSESSING.value: frozenset(
        {_S.INVESTIGATING.value, _S.ACTIONS.value, _S.CLOSED.value}
    ),
    _S.INVESTIGATING.value: frozenset({_S.ACTIONS.value, _S.CLOSED.value}),
    _S.ACTIONS.value: frozenset({_S.MONITORING.value, _S.CLOSED.value}),
    _S.MONITORING.value: frozenset({_S.ACTIONS.value, _S.CLOSED.value}),
    _S.CLOSED.value: frozenset({_S.ASSESSING.value}),
}

_A = CaseActionStatus
ACTION_TRANSITIONS: dict[str, frozenset[str]] = {
    _A.OPEN.value: frozenset({_A.DONE.value}),
    _A.DONE.value: frozenset({_A.VERIFIED.value, _A.OPEN.value}),
    _A.VERIFIED.value: frozenset({_A.OPEN.value}),
}


def move_case(
    case: Case,
    target: CaseStatus,
    *,
    actor_id: uuid.UUID,
    no_risk: bool = False,
    reason: str | None = None,
) -> None:
    """Move ``case`` to ``target`` and stamp what the move implies."""
    if target.value not in CASE_TRANSITIONS.get(case.status, frozenset()):
        raise CaseConflictError(f"A {case.status} case cannot move to {target.value}")
    if target is CaseStatus.CLOSED:
        case.closed_at = utc_now()
        case.closed_by = actor_id
        case.closed_no_risk = no_risk
        case.close_reason = reason
    elif case.status == CaseStatus.CLOSED.value:
        case.reopened_at = utc_now()
        case.closed_at = None
        case.closed_by = None
        case.closed_no_risk = False
        case.close_reason = None
    case.status = target.value


def move_action(
    action: CaseAction, target: CaseActionStatus, *, actor_id: uuid.UUID
) -> None:
    if target.value not in ACTION_TRANSITIONS.get(action.status, frozenset()):
        raise CaseConflictError(
            f"A {action.status} action cannot move to {target.value}"
        )
    now = utc_now()
    if target is CaseActionStatus.DONE:
        action.done_at = now
    elif target is CaseActionStatus.VERIFIED:
        action.verified_at = now
        action.verified_by = actor_id
    else:
        action.done_at = None
        action.verified_at = None
        action.verified_by = None
    action.status = target.value
