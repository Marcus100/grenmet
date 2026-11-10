"""Timesheet lifecycle as a declared table. No database access.

    submit            DRAFT, RETURNED -> SUBMITTED     the employee (or a proxy) submits
    approve           SUBMITTED -> APPROVED            legacy approval, no workflow instance
    workflow_approve  any -> APPROVED                  the workflow's final approval (finalize)
    workflow_return   any -> RETURNED                  the workflow sent it back (finalize)
    workflow_reject   any -> REJECTED                  the workflow rejected it, or it was
                                                       cancelled (finalize maps both here)

The workflow rows allow every state. That is what the code does today: finalize
writes the outcome without checking the timesheet's status, and the reachable
states are SUBMITTED only (an act on a pending instance needs SUBMITTED). Tightening
those rows would refuse a case that succeeds today, so it is a separate decision.

Every write to ``Timesheet.status`` goes through ``move_timesheet``, which checks
``TRANSITIONS`` first. ``workflow_move_for`` is the one place that maps a workflow
outcome to a timesheet move, so the two paths cannot disagree about it.
"""

from typing import Literal, NamedTuple

from src.exceptions import AppException
from src.hr.workflow.models import WorkflowStatus

from .models import Timesheet, TimesheetStatus

TimesheetMove = Literal[
    "submit", "approve", "workflow_approve", "workflow_return", "workflow_reject"
]


class Transition(NamedTuple):
    allowed_from: frozenset[TimesheetStatus]
    target: TimesheetStatus


_D = TimesheetStatus.DRAFT
_S = TimesheetStatus.SUBMITTED
_A = TimesheetStatus.APPROVED
_R = TimesheetStatus.REJECTED
_T = TimesheetStatus.RETURNED
_ANY = frozenset(TimesheetStatus)

TRANSITIONS: dict[TimesheetMove, Transition] = {
    "submit": Transition(frozenset({_D, _T}), _S),
    "approve": Transition(frozenset({_S}), _A),
    "workflow_approve": Transition(_ANY, _A),
    "workflow_return": Transition(_ANY, _T),
    "workflow_reject": Transition(_ANY, _R),
}


def workflow_move_for(status: WorkflowStatus) -> TimesheetMove:
    """The timesheet move a workflow outcome causes. A cancelled workflow rejects
    the timesheet (the code has always done so)."""
    if status == WorkflowStatus.APPROVED:
        return "workflow_approve"
    if status == WorkflowStatus.RETURNED:
        return "workflow_return"
    return "workflow_reject"


def can_move(state: TimesheetStatus, move: TimesheetMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_timesheet(
    timesheet: Timesheet, move: TimesheetMove, *, refusal: str | None = None
) -> None:
    state = TimesheetStatus(timesheet.status)
    if not can_move(state, move):
        raise AppException(
            refusal or f"A timesheet cannot {move} from status {state.value}", 409
        )
    timesheet.status = TRANSITIONS[move].target
