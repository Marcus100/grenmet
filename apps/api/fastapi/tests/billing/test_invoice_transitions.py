"""Table-driven checks for the invoice lifecycle (src/billing/transitions.py).

The expected rows are written out here, so a change to the lifecycle is an explicit
edit of this file. No database is needed.
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from src.billing import transitions as bt
from src.billing.exceptions import InvoiceStateError
from src.billing.models import InvoiceStatus

_D = InvoiceStatus.DRAFT
_I = InvoiceStatus.ISSUED
_PP = InvoiceStatus.PARTIALLY_PAID
_PD = InvoiceStatus.PAID
_V = InvoiceStatus.VOID

#: move -> (allowed from, target, timestamp column set from ``at``)
EXPECTED_MOVES: dict[
    str, tuple[frozenset[InvoiceStatus], InvoiceStatus, str | None]
] = {
    "issue": (frozenset({_D}), _I, "issued_at"),
    "void": (frozenset({_I}), _V, "voided_at"),
    "part_pay": (frozenset({_I, _PP}), _PP, None),
    "settle": (frozenset({_I, _PP}), _PD, None),
}

_AT = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(bt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target, stamp) in EXPECTED_MOVES.items():
        assert bt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert bt.TRANSITIONS[move].target == target, move
        assert bt.TRANSITIONS[move].stamp == stamp, move


def test_open_group_is_issued_and_partly_paid() -> None:
    assert set(bt.OPEN_STATUSES) == {"issued", "partially_paid"}


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(InvoiceStatus))
def test_move_from_every_state(move: str, state: InvoiceStatus) -> None:
    allowed_from, target, stamp = EXPECTED_MOVES[move]
    invoice: Any = SimpleNamespace(status=state.value, issued_at=None, voided_at=None)

    if state in allowed_from:
        bt.move_invoice(invoice, move, at=_AT)
        assert invoice.status == target.value
        if stamp is not None:
            assert getattr(invoice, stamp) == _AT
    else:
        with pytest.raises(InvoiceStateError) as raised:
            bt.move_invoice(invoice, move, at=_AT)
        assert raised.value.status_code == 409
        assert invoice.status == state.value
        assert invoice.issued_at is None
        assert invoice.voided_at is None


def test_stamped_move_without_a_timestamp_is_refused() -> None:
    invoice: Any = SimpleNamespace(status=_D.value, issued_at=None)
    with pytest.raises(ValueError):
        bt.move_invoice(invoice, "issue")


def test_unknown_stored_status_is_a_conflict_not_a_crash() -> None:
    invoice: Any = SimpleNamespace(status="written_off")
    with pytest.raises(InvoiceStateError, match="unknown status 'written_off'"):
        bt.move_invoice(invoice, "settle")
