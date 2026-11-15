"""Table-driven checks for the hazard profile lifecycle (src/cap/transitions.py).
No database is needed."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.cap import transitions as ct
from src.cap.exceptions import CapStateError
from src.cap.models import CapProfileState


def test_declared_moves_are_exactly_the_expected_rows() -> None:
    assert set(ct.PROFILE_TRANSITIONS) == {"approve"}
    approve = ct.PROFILE_TRANSITIONS["approve"]
    assert approve.allowed_from == frozenset({CapProfileState.DRAFT})
    assert approve.target is CapProfileState.APPROVED


def test_stored_values_are_unchanged() -> None:
    # The column and the public schema carry these exact strings.
    assert [state.value for state in CapProfileState] == ["DRAFT", "APPROVED"]


@pytest.mark.parametrize(
    ("state", "usable"), [("DRAFT", False), ("APPROVED", True), ("RETIRED", False)]
)
def test_only_an_approved_profile_is_usable(state: str, usable: bool) -> None:
    assert ct.profile_is_usable(state) is usable


def test_a_draft_is_approved() -> None:
    profile: Any = SimpleNamespace(state="DRAFT")
    ct.approve_profile(profile)
    assert profile.state == "APPROVED"


@pytest.mark.parametrize("state", ["APPROVED", "RETIRED"])
def test_anything_but_a_draft_is_refused(state: str) -> None:
    profile: Any = SimpleNamespace(state=state)
    assert ct.can_move_profile(state, "approve") is False
    with pytest.raises(CapStateError) as raised:
        ct.approve_profile(profile)
    assert raised.value.status_code == 409
    assert raised.value.message == "Only draft profiles can be approved."
    assert profile.state == state
