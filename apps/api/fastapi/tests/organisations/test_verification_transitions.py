"""Table-driven checks for organisation verification (src/organisations/transitions.py).

The expected rows are written out here, so a change to the rules is an explicit edit of
this file. No database is needed.
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from src.exceptions import AppException
from src.organisations import transitions as vt
from src.organisations.models import VerificationStatus

_P = VerificationStatus.PENDING
_A = VerificationStatus.APPROVED
_R = VerificationStatus.REJECTED

EXPECTED_MOVES: dict[str, tuple[frozenset[VerificationStatus], VerificationStatus]] = {
    "approve": (frozenset({_P, _R}), _A),
    "reject": (frozenset({_P}), _R),
    "withdraw": (frozenset({_A}), _P),
    "resubmit": (frozenset({_R}), _P),
}

_AT = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
_EARLIER = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


def _org(status: VerificationStatus) -> Any:
    """A row whose verified_at agrees with its status, as the database guarantees."""
    return SimpleNamespace(
        verification_status=status.value,
        verified_at=_EARLIER if status is _A else None,
    )


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(vt.TRANSITIONS) == set(EXPECTED_MOVES)
    for move, (allowed_from, target) in EXPECTED_MOVES.items():
        assert vt.TRANSITIONS[move].allowed_from == allowed_from, move
        assert vt.TRANSITIONS[move].target == target, move


@pytest.mark.parametrize("move", sorted(EXPECTED_MOVES))
@pytest.mark.parametrize("state", list(VerificationStatus))
def test_move_from_every_state_keeps_verified_at_in_step(
    move: str, state: VerificationStatus
) -> None:
    allowed_from, target = EXPECTED_MOVES[move]
    organisation = _org(state)

    if state in allowed_from:
        vt.move_verification(organisation, move, at=_AT)
        assert organisation.verification_status == target.value
        # verified_at is set exactly when the status is APPROVED.
        if target is _A:
            assert organisation.verified_at == _AT
        else:
            assert organisation.verified_at is None
    else:
        before = dict(organisation.__dict__)
        with pytest.raises(AppException) as raised:
            vt.move_verification(organisation, move, at=_AT)
        assert raised.value.status_code == 409
        assert organisation.__dict__ == before


def test_approve_needs_the_time_it_was_approved() -> None:
    with pytest.raises(ValueError):
        vt.move_verification(_org(_P), "approve")


def test_refusal_message_is_kept_when_given() -> None:
    with pytest.raises(AppException, match="already verified") as raised:
        vt.move_verification(
            _org(_A),
            "approve",
            at=_AT,
            refusal="Organisation is already verified",
        )
    assert raised.value.status_code == 409


def test_unknown_stored_status_is_a_conflict_not_a_crash() -> None:
    organisation: Any = SimpleNamespace(
        verification_status="suspended", verified_at=None
    )
    with pytest.raises(AppException, match="unknown verification status") as raised:
        vt.move_verification(organisation, "reject")
    assert raised.value.status_code == 409
