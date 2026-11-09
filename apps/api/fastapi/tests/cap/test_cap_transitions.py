"""CAP lifecycle as a declared table: every (state, action) pair.

The expected values below are written out by hand, not read from
``src.cap.transitions``, so a change to the table shows up here as a failing
case and must be made on purpose.
"""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.baseline.models import ApprovalPolicy
from src.cap import service as cap_service
from src.cap.exceptions import CapStateError
from src.cap.models import CapAlert, CapLifecycleState
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAlertPublic,
    CapAlertUpdate,
    CapEmergencyPublish,
    CapPublishAction,
)
from src.cap.transitions import (
    ENDED_STATES,
    EVER_PUBLISHED_STATES,
    OPEN_STATES,
    REVIEWABLE_STATES,
    TRANSITIONS,
    allowed_actions,
    can_transition,
)
from tests.factories import make_user

S = CapLifecycleState
STATES = list(CapLifecycleState)

# action -> states it may start from, and the state it leaves the alert in.
EXPECTED_FROM: dict[str, set[CapLifecycleState]] = {
    "submit": {S.DRAFT},
    "approve": {S.SUBMITTED},
    "revert_to_draft": {S.SUBMITTED, S.APPROVED},
    "publish": {S.APPROVED},
    "emergency_publish": {S.DRAFT, S.SUBMITTED, S.APPROVED},
    "cancel": {S.PUBLISHED},
    "supersede": {S.PUBLISHED},
    "expire": {S.PUBLISHED},
}
EXPECTED_TARGET: dict[str, CapLifecycleState] = {
    "submit": S.SUBMITTED,
    "approve": S.APPROVED,
    "revert_to_draft": S.DRAFT,
    "publish": S.PUBLISHED,
    "emergency_publish": S.PUBLISHED,
    "cancel": S.CANCELLED,
    "supersede": S.EXPIRED,
    "expire": S.EXPIRED,
}
EXPECTED_ALLOWED_ACTIONS: dict[CapLifecycleState, list[str]] = {
    S.DRAFT: ["submit", "emergency_publish"],
    S.SUBMITTED: ["approve", "emergency_publish"],
    S.APPROVED: ["publish", "emergency_publish"],
    S.PUBLISHED: ["cancel", "expire"],
    S.EXPIRED: [],
    S.CANCELLED: [],
}
# Refusal text callers raise today, per action (the generic one where a caller
# has no bespoke message). Checked against the live service below.
GENERIC_STATE_MESSAGE = "CAP alert must be in one of these states: {states}."
REFUSAL_MESSAGE: dict[str, str] = {
    "submit": GENERIC_STATE_MESSAGE.format(states="DRAFT"),
    "approve": GENERIC_STATE_MESSAGE.format(states="SUBMITTED"),
    "publish": (
        "Only an approved alert can be published. Submit it for approval, "
        "or use emergency publish if you hold that permission."
    ),
    "emergency_publish": "Only a draft, submitted or approved alert can be published.",
    "cancel": "Only published CAP alerts can be cancelled.",
    "expire": GENERIC_STATE_MESSAGE.format(states="PUBLISHED"),
}
EDIT_REFUSAL = "Only draft, submitted, or approved CAP alerts can be edited."


@pytest.mark.parametrize("state", STATES)
@pytest.mark.parametrize("action", sorted(EXPECTED_FROM))
def test_table_allows_exactly_the_expected_pairs(
    state: CapLifecycleState, action: str
) -> None:
    assert can_transition(state, action) is (state in EXPECTED_FROM[action])


@pytest.mark.parametrize("action", sorted(EXPECTED_FROM))
def test_table_entry_has_expected_source_and_target(action: str) -> None:
    entry = TRANSITIONS[action]
    assert entry.allowed_from == frozenset(EXPECTED_FROM[action])
    assert entry.target == EXPECTED_TARGET[action]


def test_named_state_groups_match_the_codebase_sets() -> None:
    assert OPEN_STATES == frozenset({S.DRAFT, S.SUBMITTED, S.APPROVED})
    assert REVIEWABLE_STATES == frozenset({S.SUBMITTED, S.APPROVED})
    assert EVER_PUBLISHED_STATES == frozenset({S.PUBLISHED, S.EXPIRED, S.CANCELLED})
    assert ENDED_STATES == frozenset({S.EXPIRED, S.CANCELLED})


@pytest.mark.parametrize("state", STATES)
def test_allowed_actions_per_state(state: CapLifecycleState) -> None:
    assert allowed_actions(state) == EXPECTED_ALLOWED_ACTIONS[state]


async def _policy(session: AsyncSession) -> None:
    if await session.get(ApprovalPolicy, "cap") is None:
        session.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await session.commit()


async def _seed(
    session: AsyncSession, state: CapLifecycleState
) -> tuple[uuid.UUID, User]:
    """An alert in ``state``, reached through the real service functions."""
    await _policy(session)
    author = await make_user(session, superuser=True)
    created = await cap_service.create_alert(
        session=session,
        current_user=author,
        payload=CapAlertCreate(**_PAYLOAD),
    )
    alert_id = created.id
    if state is S.DRAFT:
        return alert_id, author
    await cap_service.submit_alert(
        session=session,
        current_user=author,
        alert_id=alert_id,
        payload=CapAlertAction(note="ready"),
    )
    if state is S.SUBMITTED:
        return alert_id, author
    reviewer = await make_user(session, superuser=True)
    await cap_service.approve_alert(
        session=session,
        current_user=reviewer,
        alert_id=alert_id,
        payload=CapAlertAction(),
    )
    if state is S.APPROVED:
        return alert_id, author
    await cap_service.publish_alert(
        session=session,
        current_user=author,
        alert_id=alert_id,
        payload=CapPublishAction(),
    )
    if state is S.PUBLISHED:
        return alert_id, author
    if state is S.EXPIRED:
        await cap_service.expire_alert(
            session=session,
            current_user=author,
            alert_id=alert_id,
            payload=CapAlertAction(),
        )
    else:
        await cap_service.cancel_alert(
            session=session,
            current_user=author,
            alert_id=alert_id,
            payload=CapAlertAction(note="Withdrawn in test"),
        )
    return alert_id, author


_PAYLOAD = {
    "status": "Actual",
    "msg_type": "Alert",
    "scope": "Public",
    "info": [
        {
            "language": "en",
            "categories": ["Met"],
            "event": "Heavy Rain",
            "urgency": "Immediate",
            "severity": "Severe",
            "certainty": "Observed",
            "headline": "Heavy rain warning",
            "description": "Significant rainfall expected.",
            "areas": [{"area_desc": "Grenada", "kind": "AREA"}],
        }
    ],
}


async def _run(
    session: AsyncSession, actor: User, alert_id: uuid.UUID, action: str
) -> CapAlertPublic:
    """Call the service function that performs ``action`` on the alert."""
    if action == "submit":
        return await cap_service.submit_alert(
            session=session,
            current_user=actor,
            alert_id=alert_id,
            payload=CapAlertAction(note="ready"),
        )
    if action == "approve":
        return await cap_service.approve_alert(
            session=session,
            current_user=await make_user(session, superuser=True),
            alert_id=alert_id,
            payload=CapAlertAction(),
        )
    if action == "publish":
        published, _ = await cap_service.publish_alert(
            session=session,
            current_user=actor,
            alert_id=alert_id,
            payload=CapPublishAction(),
        )
        return published
    if action == "emergency_publish":
        published, _ = await cap_service.emergency_publish_alert(
            session=session,
            current_user=actor,
            alert_id=alert_id,
            payload=CapEmergencyPublish(reason="table test"),
        )
        return published
    if action == "cancel":
        return await cap_service.cancel_alert(
            session=session,
            current_user=actor,
            alert_id=alert_id,
            payload=CapAlertAction(note="Withdrawn in test"),
        )
    if action == "expire":
        return await cap_service.expire_alert(
            session=session,
            current_user=actor,
            alert_id=alert_id,
            payload=CapAlertAction(),
        )
    if action == "revert_to_draft":
        return await cap_service.update_alert(
            session=session,
            current_user=actor,
            alert_id=alert_id,
            payload=CapAlertUpdate(note="edited in test"),
        )
    raise AssertionError(f"no runner for {action}")


@pytest.mark.parametrize("state", STATES)
@pytest.mark.parametrize("action", sorted(EXPECTED_FROM))
async def test_service_honours_table_for_every_pair(
    db_async: AsyncSession, state: CapLifecycleState, action: str
) -> None:
    if action == "supersede":
        pytest.skip(
            "supersede is a side effect of publishing an Update or Cancel; "
            "covered by test_cap_issue_update and test_cap_state_machine"
        )
    if action == "revert_to_draft":
        pytest.skip(
            "revert_to_draft happens inside update_alert, and an edit of a draft "
            "is allowed with no state change; covered by the edit test below"
        )
    alert_id, actor = await _seed(db_async, state)
    allowed = state in EXPECTED_FROM[action]
    if allowed:
        result = await _run(db_async, actor, alert_id, action)
        assert result.lifecycle_state == EXPECTED_TARGET[action]
        return
    with pytest.raises(CapStateError) as error:
        await _run(db_async, actor, alert_id, action)
    assert error.value.status_code == 409
    assert error.value.message == REFUSAL_MESSAGE[action]
    unchanged = await db_async.get(CapAlert, alert_id)
    assert unchanged is not None
    assert unchanged.lifecycle_state == state


@pytest.mark.parametrize("state", STATES)
async def test_edit_is_allowed_only_in_open_states_and_reverts_to_draft(
    db_async: AsyncSession, state: CapLifecycleState
) -> None:
    alert_id, actor = await _seed(db_async, state)
    if state in OPEN_STATES:
        result = await _run(db_async, actor, alert_id, "revert_to_draft")
        assert result.lifecycle_state == S.DRAFT
        return
    with pytest.raises(CapStateError) as error:
        await _run(db_async, actor, alert_id, "revert_to_draft")
    assert error.value.status_code == 409
    assert error.value.message == EDIT_REFUSAL


async def test_allowed_actions_reach_the_api(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    alert_id, _ = await _seed(db_async, S.APPROVED)
    response = await async_client.get(
        f"/api/v1/cap/alerts/{alert_id}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200
    assert response.json()["allowed_actions"] == ["publish", "emergency_publish"]
