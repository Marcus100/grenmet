"""The case and action status tables (src/cases/transitions.py)."""

import uuid

import pytest

from src.cases.exceptions import CaseConflictError
from src.cases.models import Case, CaseAction, CaseActionStatus, CaseStatus
from src.cases.transitions import (
    ACTION_TRANSITIONS,
    CASE_TRANSITIONS,
    move_action,
    move_case,
)

ACTOR = uuid.uuid4()


def test_every_status_has_a_row() -> None:
    assert set(CASE_TRANSITIONS) == {s.value for s in CaseStatus}
    assert set(ACTION_TRANSITIONS) == {s.value for s in CaseActionStatus}


@pytest.mark.parametrize(
    ("start", "target"),
    [
        (CaseStatus.REPORTED, CaseStatus.ACTIONS),
        (CaseStatus.REPORTED, CaseStatus.MONITORING),
        (CaseStatus.ACTIONS, CaseStatus.ASSESSING),
        (CaseStatus.CLOSED, CaseStatus.MONITORING),
        (CaseStatus.CLOSED, CaseStatus.CLOSED),
    ],
)
def test_refused_case_moves(start: CaseStatus, target: CaseStatus) -> None:
    with pytest.raises(CaseConflictError):
        move_case(Case(status=start.value), target, actor_id=ACTOR)


def test_close_and_reopen_stamp_and_clear() -> None:
    case = Case(status=CaseStatus.ASSESSING.value)
    move_case(case, CaseStatus.CLOSED, actor_id=ACTOR, no_risk=True, reason="Nothing")
    assert case.closed_at is not None
    assert (case.closed_by, case.closed_no_risk, case.close_reason) == (
        ACTOR,
        True,
        "Nothing",
    )
    move_case(case, CaseStatus.ASSESSING, actor_id=ACTOR)
    assert case.closed_at is None
    assert case.closed_no_risk is False
    assert case.close_reason is None


def test_action_moves() -> None:
    action = CaseAction(status=CaseActionStatus.OPEN.value)
    with pytest.raises(CaseConflictError):
        move_action(action, CaseActionStatus.VERIFIED, actor_id=ACTOR)
    move_action(action, CaseActionStatus.DONE, actor_id=ACTOR)
    assert action.done_at is not None
    move_action(action, CaseActionStatus.VERIFIED, actor_id=ACTOR)
    assert action.verified_by == ACTOR
    move_action(action, CaseActionStatus.OPEN, actor_id=ACTOR)
    assert action.done_at is None
    assert action.verified_at is None
