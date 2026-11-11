"""eRegister lifecycle as a declared table: every (state, sends, action) case.

The expected values below are written out by hand, not read from
``src.eregister.transitions``, so a change to the table shows up here as a failing
case and must be made on purpose.

``sends`` is what has been handed off for the observation: ``none``, ``email``
(an email queued or sent) or ``wis2`` (a WIS2 file queued or sent; a WIS2 file is
always a send of any kind, so ``wis2`` implies ``any_sent``).

The integration matrix calls the real endpoints and checks today's status, detail
and resulting state. A re-save of an hour with no live row (rejected or superseded)
is not a transition of that row: it inserts a fresh draft, so the table does not
cover it, and the matrix pins that outcome separately.
"""

import json
from typing import Any
from uuid import UUID

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.eregister import transitions
from src.eregister.models import ERegisterSend
from src.eregister.schemas import PublicObservation
from src.main import app
from tests import test_eregister_send as send_tests
from tests.test_eregister_send import (
    FULL_ROW,
    OBS_URL,
    OBSERVED,
    qc_url,
    register_rows,
    save,
    set_state,
)

# The send-log fixtures, exposed under their own names (pytest reads module attributes).
send_client = send_tests.send_client
incoming = send_tests.incoming
recipients = send_tests.recipients

STATES = (
    "draft",
    "qc_pending",
    "accepted",
    "rejected",
    "superseded",
    "historical",
)
SENDS = ("none", "email", "wis2")
ACTIONS = ("accept", "reject", "reopen", "correct", "save")

PENDING = {"draft", "qc_pending"}
LIVE = {"draft", "qc_pending", "accepted", "historical"}

# --- hand-written expectations --------------------------------------------------


def expected_allowed(state: str, action: str, sends: str) -> bool:
    """Whether today's endpoint for ``action`` succeeds on an existing row."""
    if action == "accept":
        return state in PENDING
    if action == "reject":
        return state in PENDING and sends != "wis2"
    if action == "reopen":
        return state in {"accepted", "rejected"} and sends != "wis2"
    if action == "correct":
        return state in LIVE
    if action == "save":
        return state in PENDING and sends == "none"
    raise AssertionError(action)


SUCCESS_STATUS = {
    "accept": 200,
    "reject": 200,
    "reopen": 200,
    "correct": 201,
    "save": 200,
}
# The state the row (the original, for correct) is in afterwards.
AFTER_STATE = {
    "accept": "accepted",
    "reject": "rejected",
    "reopen": "qc_pending",
    "correct": "superseded",
    "save": "draft",  # even from qc_pending: the re-save is a fresh draft
}
WIS2_REFUSAL = "Already queued or sent to WIS2; correct it with a new observation"
# Which states the endpoint's own state check allows, before any send check.
STATE_ALLOWED_FOR_QC = {
    "accept": PENDING,
    "reject": PENDING,
    "reopen": {"accepted", "rejected"},
}

EXPECTED_ALLOWED_ACTIONS: dict[str, list[str]] = {
    "draft": ["accept", "reject", "correct"],
    "qc_pending": ["accept", "reject", "correct"],
    "accepted": ["reopen", "correct"],
    "rejected": ["reopen"],
    "superseded": [],
    "historical": ["correct"],
}
EXPECTED_ALLOWED_ACTIONS_NO_SYNOP: dict[str, list[str]] = {
    state: [action for action in actions if action != "accept"]
    for state, actions in EXPECTED_ALLOWED_ACTIONS.items()
}
EXPECTED_ALLOWED_ACTIONS_WIS2: dict[str, list[str]] = {
    "draft": ["accept", "correct"],
    "qc_pending": ["accept", "correct"],
    "accepted": ["correct"],
    "rejected": [],
    "superseded": [],
    "historical": ["correct"],
}


def _flags(sends: str) -> dict[str, bool]:
    return {"wis2_sent": sends == "wis2", "any_sent": sends != "none"}


# --- pure table -----------------------------------------------------------------


@pytest.mark.parametrize("sends", SENDS)
@pytest.mark.parametrize("action", ACTIONS)
@pytest.mark.parametrize("state", STATES)
def test_table_allows_exactly_the_expected_cases(
    state: str, action: str, sends: str
) -> None:
    # "save" is the table's save_draft; the endpoint adds the no-live-row insert.
    table_action = "save_draft" if action == "save" else action
    assert transitions.can_transition(state, table_action, **_flags(sends)) is (
        expected_allowed(state, action, sends)
    )


def test_restore_is_allowed_only_from_superseded_and_has_no_fixed_target() -> None:
    for state in STATES:
        assert transitions.state_allows(state, "restore") is (state == "superseded")
    with pytest.raises(ValueError):
        transitions.fixed_target("restore")


@pytest.mark.parametrize(
    ("action", "target"),
    [
        ("accept", "accepted"),
        ("reject", "rejected"),
        ("reopen", "qc_pending"),
        ("correct", "superseded"),
        ("save_draft", "draft"),
    ],
)
def test_fixed_targets(action: str, target: str) -> None:
    assert transitions.fixed_target(action) == target


def test_named_state_groups() -> None:
    assert transitions.PENDING_STATES == PENDING
    assert transitions.LIVE_STATES == LIVE
    assert transitions.REVIEWABLE_STATES == LIVE
    assert transitions.NOT_SENDABLE_STATES == {
        "rejected",
        "superseded",
        "historical",
    }
    # Historical is never awaiting acceptance, but it can be reviewed and corrected.
    assert "historical" not in transitions.PENDING_STATES
    assert "historical" in transitions.REVIEWABLE_STATES
    assert transitions.NOT_SENDABLE_STATES | transitions.LIVE_STATES == set(STATES)


def test_every_offered_action_is_in_the_table() -> None:
    assert set(transitions.OFFERED_ACTIONS) <= set(transitions.TRANSITIONS)
    assert transitions.SYNOP_ONLY <= set(transitions.TRANSITIONS)


@pytest.mark.parametrize("state", STATES)
def test_allowed_actions_per_state(state: str) -> None:
    got = transitions.allowed_actions(state, synop=True)
    assert got == EXPECTED_ALLOWED_ACTIONS[state]


@pytest.mark.parametrize("state", STATES)
def test_allowed_actions_drop_accept_for_non_synop(state: str) -> None:
    got = transitions.allowed_actions(state, synop=False)
    assert got == EXPECTED_ALLOWED_ACTIONS_NO_SYNOP[state]


@pytest.mark.parametrize("state", STATES)
def test_allowed_actions_with_a_wis2_file_sent(state: str) -> None:
    got = transitions.allowed_actions(
        state,
        synop=True,
        wis2_sent=True,
        any_sent=True,
    )
    assert got == EXPECTED_ALLOWED_ACTIONS_WIS2[state]


# --- integration: every (state, sends, action) through the real endpoints --------


async def _queue(db: AsyncSession, observation: str, sends: str) -> None:
    if sends == "none":
        return
    db.add(
        ERegisterSend(
            observation_id=UUID(observation),
            station_id="78958",
            observed_at=OBSERVED.replace(tzinfo=None),
            target="wis2" if sends == "wis2" else "email",
            status="queued",
            detail={},
        )
    )
    await db.commit()


async def _act(
    client: httpx.AsyncClient, observation: str, action: str
) -> httpx.Response:
    if action == "save":
        return await client.post(
            OBS_URL,
            json={
                "station_id": "78958",
                "kind": "SYNOP",
                "observed_at": OBSERVED.isoformat(),
                "body": FULL_ROW,
            },
        )
    if action == "correct":
        return await client.post(
            qc_url(observation, "correct"), json={"body": FULL_ROW}
        )
    if action == "accept":
        return await client.post(qc_url(observation, "accept"))
    return await client.post(
        qc_url(observation, action), json={"reason": "Wrong station"}
    )


def _refusal(observation: str, state: str, action: str) -> str:
    """Today's 409 detail for a refused action on an existing row."""
    if action == "save":
        return (
            "An observation for this station and time already exists "
            f"({observation}, {state}). Correct it instead of saving a second one."
        )
    if action == "correct":
        return f"A {state} observation cannot be corrected"
    if state not in STATE_ALLOWED_FOR_QC[action]:
        return f"Cannot {action} an observation that is {state}"
    # The state allows it, so only a WIS2 file can refuse (reject and reopen).
    return WIS2_REFUSAL


async def _state_of(observation: str) -> str:
    rows = await register_rows(
        "SELECT state::text AS state FROM register_observations WHERE id = :i",
        i=observation,
    )
    return str(rows[0]["state"])


@pytest.mark.parametrize("sends", SENDS)
@pytest.mark.parametrize("action", ACTIONS)
@pytest.mark.parametrize("state", STATES)
@pytest.mark.usefixtures("incoming", "recipients")
async def test_each_state_and_send_gets_todays_status_and_result(
    send_client: tuple[httpx.AsyncClient, Any],
    db_async: AsyncSession,
    state: str,
    action: str,
    sends: str,
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_state(observation, state)
    await _queue(db_async, observation, sends)

    response = await _act(client, observation, action)

    if action == "save" and state not in LIVE:
        # No live row for the hour: a fresh draft is inserted beside the old one.
        assert response.status_code == 201, response.text
        assert response.json()["id"] != observation
        assert response.json()["state"] == "draft"
        assert await _state_of(observation) == state
        return
    if not expected_allowed(state, action, sends):
        assert response.status_code == 409, response.text
        assert response.json()["detail"] == _refusal(observation, state, action)
        assert await _state_of(observation) == state, "a refusal must not move the row"
        return
    assert response.status_code == SUCCESS_STATUS[action], response.text
    if action == "correct":
        replacement = response.json()
        assert replacement["state"] == "draft"
        assert replacement["supersedes_id"] == observation
    else:
        assert response.json()["id"] == observation
    assert await _state_of(observation) == AFTER_STATE[action]


# --- the staff read model carries the field; public output does not ---------------


@pytest.mark.parametrize("state", STATES)
async def test_staff_listing_carries_allowed_actions(
    send_client: tuple[httpx.AsyncClient, Any],
    state: str,
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_state(observation, state)
    response = await client.get(OBS_URL, params={"station_id": "78958"})
    assert response.status_code == 200, response.text
    listed = {row["id"]: row for row in response.json()["observations"]}
    assert listed[observation]["allowed_actions"] == EXPECTED_ALLOWED_ACTIONS[state]


async def test_a_metar_is_never_offered_accept(
    send_client: tuple[httpx.AsyncClient, Any],
) -> None:
    client, _ = send_client
    metar = await save(client, kind="METAR")
    response = await client.get(OBS_URL, params={"station_id": "78958"})
    listed = {row["id"]: row for row in response.json()["observations"]}
    assert listed[metar]["allowed_actions"] == ["reject", "correct"]


def test_public_schemas_do_not_carry_the_field() -> None:
    assert "allowed_actions" not in PublicObservation.model_fields
    assert "allowed_actions" not in json.dumps(PublicObservation.model_json_schema())


def test_public_routes_do_not_reference_the_staff_read_model() -> None:
    paths = app.openapi()["paths"]
    public = {path: ops for path, ops in paths.items() if "/eregister/public/" in path}
    assert public, "expected the public eRegister routes to be documented"
    for path, operations in public.items():
        assert "RegisterObservationRead" not in json.dumps(operations), path
        assert "allowed_actions" not in json.dumps(operations), path
