"""Table-driven checks for the timesheet status machine (src/hr/timesheet/transitions.py).

The expected rows are written out here, so a change to the machine is an explicit
edit of this file.
"""

from types import SimpleNamespace

import pytest

from src.exceptions import AppException
from src.hr.timesheet import transitions as tt
from src.hr.timesheet.models import TimesheetStatus
from src.hr.workflow.models import WorkflowStatus

_D = TimesheetStatus.DRAFT
_S = TimesheetStatus.SUBMITTED
_A = TimesheetStatus.APPROVED
_R = TimesheetStatus.REJECTED
_T = TimesheetStatus.RETURNED
_ALL = frozenset(TimesheetStatus)

EXPECTED_MOVES: dict[str, tuple[frozenset[TimesheetStatus], TimesheetStatus]] = {
    "submit": (frozenset({_D, _T}), _S),
    "approve": (frozenset({_S}), _A),
    "workflow_approve": (_ALL, _A),
    "workflow_return": (_ALL, _T),
    "workflow_reject": (_ALL, _R),
}

# What the workflow path wrote before the table existed: APPROVED approves,
# RETURNED returns, and every other outcome (REJECTED and CANCELLED, and the
# never-reached DRAFT and PENDING) rejects.
EXPECTED_WORKFLOW_MOVE: dict[WorkflowStatus, str] = {
    WorkflowStatus.DRAFT: "workflow_reject",
    WorkflowStatus.PENDING: "workflow_reject",
    WorkflowStatus.APPROVED: "workflow_approve",
    WorkflowStatus.REJECTED: "workflow_reject",
    WorkflowStatus.RETURNED: "workflow_return",
    WorkflowStatus.CANCELLED: "workflow_reject",
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(tt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert tt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert tt.TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(TimesheetStatus))
def test_move_from_every_state(move: str, state: TimesheetStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    timesheet = SimpleNamespace(status=state)

    if state in allowed_from:
        tt.move_timesheet(timesheet, move)
        assert timesheet.status == target
    else:
        with pytest.raises(AppException) as raised:
            tt.move_timesheet(timesheet, move)
        assert raised.value.status_code == 409
        assert timesheet.status == state


def test_refusal_message_is_the_callers_when_given() -> None:
    timesheet = SimpleNamespace(status=_A)
    with pytest.raises(AppException, match="Already submitted"):
        tt.move_timesheet(timesheet, "submit", refusal="Already submitted")


@pytest.mark.parametrize("status", list(WorkflowStatus))
def test_workflow_outcome_maps_to_the_move_it_always_caused(
    status: WorkflowStatus,
) -> None:
    assert tt.workflow_move_for(status) == EXPECTED_WORKFLOW_MOVE[status]


def test_cancelled_workflow_rejects_the_timesheet() -> None:
    """Quirk kept on purpose: a cancelled timesheet workflow leaves the timesheet
    REJECTED, not CANCELLED (TimesheetStatus has no cancelled state)."""
    timesheet = SimpleNamespace(status=_S)
    tt.move_timesheet(timesheet, tt.workflow_move_for(WorkflowStatus.CANCELLED))
    assert timesheet.status == _R
