"""Table-driven checks for the approval workflow machine and its request mirror.

The expected rows are written out here, not read from the module, so a change to
the machine has to be an explicit edit of this file.
"""

from types import SimpleNamespace

import pytest

from src.exceptions import AppException
from src.hr.models import RequestStatus
from src.hr.workflow import transitions as wt
from src.hr.workflow.models import WorkflowStatus

_D = WorkflowStatus.DRAFT
_P = WorkflowStatus.PENDING
_A = WorkflowStatus.APPROVED
_R = WorkflowStatus.REJECTED
_T = WorkflowStatus.RETURNED
_C = WorkflowStatus.CANCELLED

EXPECTED_MOVES: dict[str, tuple[frozenset[WorkflowStatus], WorkflowStatus]] = {
    "submit": (frozenset({_D, _T}), _P),
    "approve": (frozenset({_P}), _A),
    "reject": (frozenset({_P}), _R),
    "return": (frozenset({_P}), _T),
    "cancel": (frozenset({_P}), _C),
    "cancel_approved": (frozenset({_A}), _C),
}

EXPECTED_REQUEST_STATUS: dict[WorkflowStatus, RequestStatus | None] = {
    _D: None,
    _P: None,
    _A: RequestStatus.APPROVED,
    _R: RequestStatus.REJECTED,
    _T: RequestStatus.RETURNED,
    _C: RequestStatus.CANCELLED,
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(wt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert wt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert wt.TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(WorkflowStatus))
def test_move_from_every_state(move: str, state: WorkflowStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    instance = SimpleNamespace(status=state)

    if state in allowed_from:
        wt.move_workflow(instance, move)
        assert instance.status == target
    else:
        with pytest.raises(AppException) as raised:
            wt.move_workflow(instance, move)
        assert raised.value.status_code == 409
        assert instance.status == state


def test_refusal_message_is_the_callers_when_given() -> None:
    instance = SimpleNamespace(status=_A)
    with pytest.raises(AppException, match="Only a pending form can be returned"):
        wt.move_workflow(
            instance,
            "return",
            refusal="Only a pending form can be returned",
        )


def test_request_status_mapping_is_declared_for_every_workflow_status() -> None:
    assert set(wt.REQUEST_STATUS_FOR) == set(WorkflowStatus)
    assert wt.REQUEST_STATUS_FOR == EXPECTED_REQUEST_STATUS


@pytest.mark.parametrize("state", list(WorkflowStatus))
def test_mirror_copies_mirrored_states_and_leaves_the_rest(
    state: WorkflowStatus,
) -> None:
    entity = SimpleNamespace(status=RequestStatus.SUBMITTED)
    wt.mirror_request_status(entity, state)
    expected = EXPECTED_REQUEST_STATUS[state]
    if expected is None:
        assert entity.status == RequestStatus.SUBMITTED
    else:
        assert entity.status == expected


ALLOWED_PAIRS = [
    (move, start)
    for move, (allowed_from, _target) in sorted(EXPECTED_MOVES.items())
    for start in sorted(allowed_from, key=lambda state: state.value)
]


@pytest.mark.parametrize(("move", "start"), ALLOWED_PAIRS)
def test_every_move_leaves_instance_and_request_consistent(
    move: str, start: WorkflowStatus
) -> None:
    """Apply each move from each state it allows, then mirror, and check the pair:
    the request shows the instance's mirrored state, or keeps its own status when
    the instance has none (DRAFT, PENDING)."""
    _allowed_from, target = EXPECTED_MOVES[move]
    instance = SimpleNamespace(status=start)
    entity = SimpleNamespace(status=RequestStatus.SUBMITTED)

    wt.move_workflow(instance, move)
    wt.mirror_request_status(entity, instance.status)

    assert instance.status == target
    mirrored = EXPECTED_REQUEST_STATUS[target]
    assert entity.status == (
        mirrored if mirrored is not None else RequestStatus.SUBMITTED
    )
    if mirrored is not None:
        assert entity.status.value == instance.status.value
