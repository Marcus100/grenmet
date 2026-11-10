"""Table-driven checks for the requisition lifecycle (src/stores/transitions.py).

The expected rows are written out here, so a change to the lifecycle is an explicit
edit of this file. No database is needed.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from src.stores import transitions as rt
from src.stores.exceptions import StoresStateError
from src.stores.models import RequisitionStatus

_D = RequisitionStatus.DRAFT
_S = RequisitionStatus.SUBMITTED
_A = RequisitionStatus.APPROVED
_R = RequisitionStatus.REJECTED
_P = RequisitionStatus.PARTIALLY_DELIVERED
_F = RequisitionStatus.DELIVERED
_C = RequisitionStatus.CANCELLED

EXPECTED_MOVES: dict[str, tuple[frozenset[RequisitionStatus], RequisitionStatus]] = {
    "submit": (frozenset({_D}), _S),
    "cancel": (frozenset({_D, _S}), _C),
    "approve": (frozenset({_S}), _A),
    "reject": (frozenset({_S}), _R),
    "deliver_partly": (frozenset({_A, _P}), _P),
    "deliver_in_full": (frozenset({_A, _P}), _F),
}


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(rt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert rt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert rt.TRANSITIONS[move].target == target, move


def test_named_groups_match_the_table() -> None:
    assert rt.EDITABLE == frozenset({_D})
    assert rt.OPEN_FOR_DELIVERY == frozenset({_A, _P})


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(RequisitionStatus))
def test_move_from_every_state(move: str, state: RequisitionStatus) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    requisition: Any = SimpleNamespace(status=state)

    assert rt.can_move(state, move) is (state in allowed_from)  # type: ignore[arg-type]
    if state in allowed_from:
        rt.move_requisition(requisition, move)  # type: ignore[arg-type]
        assert requisition.status is target
    else:
        with pytest.raises(StoresStateError) as raised:
            rt.move_requisition(requisition, move)  # type: ignore[arg-type]
        assert raised.value.status_code == 409
        assert requisition.status is state


def test_refusal_message_is_kept_when_given() -> None:
    requisition: Any = SimpleNamespace(status=_D)
    with pytest.raises(StoresStateError, match="Only a submitted requisition"):
        rt.move_requisition(
            requisition,
            "approve",
            refusal="Only a submitted requisition can be decided",
        )
