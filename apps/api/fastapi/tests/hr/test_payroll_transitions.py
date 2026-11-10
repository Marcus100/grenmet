"""Table-driven checks for the payroll state rules (src/hr/payroll/transitions.py).

The expected rows are written out here, so a change to the rules is an explicit edit
of this file. No database is needed.
"""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from src.exceptions import AppException
from src.hr.payroll import transitions as pt
from src.hr.payroll.models import PayPeriodStatus, TableState

_O = PayPeriodStatus.OPEN
_R = PayPeriodStatus.IN_REVIEW
_A = PayPeriodStatus.APPROVED
_E = PayPeriodStatus.EXPORTED
_C = PayPeriodStatus.CLOSED

EXPECTED_PERIOD_MOVES: dict[str, tuple[frozenset[PayPeriodStatus], PayPeriodStatus]] = {
    "submit": (frozenset({_O}), _R),
    "approve": (frozenset({_R}), _A),
    "reopen": (frozenset({_R}), _O),
    "export": (frozenset({_A}), _E),
    "close": (frozenset({_E}), _C),
}


def test_declared_period_moves_are_exactly_the_expected_rows() -> None:
    assert set(pt.PERIOD_MOVES) == set(EXPECTED_PERIOD_MOVES)
    for move, (allowed_from, target) in EXPECTED_PERIOD_MOVES.items():
        assert pt.PERIOD_MOVES[move].allowed_from == allowed_from, move
        assert pt.PERIOD_MOVES[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_PERIOD_MOVES))
@pytest.mark.parametrize("state", list(PayPeriodStatus))
def test_period_move_from_every_state(move: str, state: PayPeriodStatus) -> None:
    allowed_from, target = EXPECTED_PERIOD_MOVES[move]
    period: Any = SimpleNamespace(status=state.value)

    if state in allowed_from:
        pt.move_period(period, move)
        assert period.status == target.value
    else:
        with pytest.raises(AppException) as raised:
            pt.move_period(period, move)
        assert raised.value.status_code == 409
        assert period.status == state.value


def test_period_refusal_message_is_kept_when_given() -> None:
    period: Any = SimpleNamespace(status=_A.value)
    with pytest.raises(AppException, match="Only an open period can be submitted"):
        pt.move_period(
            period,
            "submit",
            refusal="Only an open period can be submitted",
        )


def test_unknown_stored_period_status_is_a_conflict_not_a_crash() -> None:
    period: Any = SimpleNamespace(status="ARCHIVED")
    with pytest.raises(AppException, match="unknown status 'ARCHIVED'") as raised:
        pt.move_period(period, "close")
    assert raised.value.status_code == 409


_USER = uuid.UUID("00000000-0000-0000-0000-000000000042")
_AT = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize("prior", list(TableState))
@pytest.mark.parametrize("target", list(TableState))
def test_set_table_state_from_every_state(
    prior: TableState, target: TableState
) -> None:
    record: Any = SimpleNamespace(
        rule_state=prior.value,
        confirmed_by_user_id=uuid.uuid4()
        if prior is not TableState.PROVISIONAL
        else None,
        confirmed_at=_AT if prior is not TableState.PROVISIONAL else None,
    )

    pt.set_table_state(record, target, confirmer_id=_USER, at=_AT)

    assert record.rule_state == target.value
    if target is TableState.PROVISIONAL:
        assert record.confirmed_by_user_id is None
        assert record.confirmed_at is None
    else:
        assert record.confirmed_by_user_id == _USER
        assert record.confirmed_at == _AT
