"""Weather product and tracked system lifecycles as declared tables: every
(state, action) pair. The expected values are written out by hand, so a change to
``src.wxproducts.transitions`` shows up here as a failing case. No database.
"""

from uuid import uuid4

import pytest

from src.wxproducts import tropical_systems, transitions
from src.wxproducts.exceptions import RevisionConflict, TropicalSystemConflict
from src.wxproducts.models import AuthoredProduct, TropicalSystem
from src.wxproducts.schemas import TropicalSystemUpdate

UN = transitions.UNPUBLISHED
PUB = transitions.PUBLISHED
PRODUCT_STATES = [UN, PUB]
ProductAction = transitions.ProductAction

# product action -> states it may start from.
EXPECTED_PRODUCT_FROM: dict[ProductAction, set[str]] = {
    "draft": {UN, PUB},
    "publish": {UN, PUB},
    "withdraw": {PUB},
}
PRODUCT_CASES = [
    (state, action) for state in PRODUCT_STATES for action in EXPECTED_PRODUCT_FROM
]

ACTIVE = transitions.ACTIVE
CLOSED = transitions.CLOSED


def test_every_product_action_is_declared() -> None:
    assert set(transitions.PRODUCT_TRANSITIONS) == set(EXPECTED_PRODUCT_FROM)
    assert transitions.PRODUCT_ACTIONS == ("draft", "publish", "withdraw")


@pytest.mark.parametrize(("state", "action"), PRODUCT_CASES)
def test_product_action_is_allowed_only_from_its_declared_states(
    state: str, action: ProductAction
) -> None:
    allowed = state in EXPECTED_PRODUCT_FROM[action]
    assert transitions.product_allowed(state, action) is allowed
    if allowed:
        transitions.guard_product(state, action, refusal="refused")
        return
    with pytest.raises(RevisionConflict) as refused:
        transitions.guard_product(state, action, refusal="refused")
    assert refused.value.status_code == 409
    assert refused.value.message == "refused"


@pytest.mark.parametrize("state", PRODUCT_STATES)
def test_staff_allowed_actions_follow_the_table(state: str) -> None:
    expected = [
        action
        for action in transitions.PRODUCT_ACTIONS
        if state in EXPECTED_PRODUCT_FROM[action]
    ]
    assert transitions.product_allowed_actions(state) == expected


def test_a_saved_draft_is_unpublished_and_a_snapshot_makes_it_published() -> None:
    draft_only = AuthoredProduct(id=uuid4(), kind="marine", draft={}, revision=1)
    assert transitions.product_state(draft_only) is UN
    assert transitions.product_state(None) is UN
    published = AuthoredProduct(
        id=uuid4(),
        kind="marine",
        draft={},
        revision=2,
        published={"revision": 2},
    )
    assert transitions.product_state(published) is PUB


# Tracked systems: active or closed.
SYSTEM_STATES = [ACTIVE, CLOSED]


@pytest.mark.parametrize("stored", ["", "Active", "archived", "deleted"])
def test_an_unknown_stored_system_status_is_a_conflict(stored: str) -> None:
    with pytest.raises(TropicalSystemConflict) as refused:
        transitions.stored_system_state(stored)
    assert refused.value.status_code == 409


@pytest.mark.parametrize("stored", SYSTEM_STATES)
def test_known_system_statuses_are_read(stored: str) -> None:
    assert transitions.stored_system_state(stored) == stored


@pytest.mark.parametrize("state", SYSTEM_STATES)
def test_only_an_active_system_can_be_linked_into_an_outlook(state: str) -> None:
    assert transitions.can_link(state) is (state == ACTIVE)


@pytest.mark.parametrize("state", SYSTEM_STATES)
@pytest.mark.parametrize("reason", [None, "dissipated", "merged", "out_of_area"])
def test_only_a_duplicate_closure_blocks_a_merge_target(
    state: str, reason: str | None
) -> None:
    refused = state == CLOSED and reason == "duplicate"
    assert transitions.can_merge_into(state, reason) is (not refused)
    assert transitions.can_merge_into(state, "duplicate") is (state == ACTIVE)


def _system(status: str) -> TropicalSystem:
    return TropicalSystem(
        id=uuid4(),
        season=2026,
        sequence=1,
        name="Test",
        feature_type="tropical_storm",
        status=status,
        closed_reason=None,
        continued_as_id=None,
        created_by="test",
        updated_by="test",
    )


def test_a_closure_read_with_an_unknown_stored_status_is_a_conflict() -> None:
    with pytest.raises(TropicalSystemConflict) as refused:
        tropical_systems._closure(_system("archived"), TropicalSystemUpdate())
    assert refused.value.status_code == 409


def test_a_closure_keeps_an_active_system_active() -> None:
    status, reason, continued = tropical_systems._closure(
        _system(ACTIVE), TropicalSystemUpdate()
    )
    assert (status, reason, continued) == (ACTIVE, None, None)
