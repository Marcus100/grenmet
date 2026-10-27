"""The impact-based matrix (WMO-No. 1150): grid, hazard library, suggestions, overrides."""

import uuid
from typing import Any
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Permission, Role, User
from src.cap import ibf, ibf_suggest, profiles
from src.cap.escalation import (
    IBF_LIBRARY,
    IMPACT_PARAMETER,
    LIKELIHOOD_PARAMETER,
    OVERRIDE_REASON,
    SUGGESTED_COLOUR,
)
from src.cap.profile_schemas import CapProfileDefinition, CapProfileSave
from src.exceptions import AuthorizationError, NotFoundError
from src.wxproducts import service
from tests.cap.test_profiles import definition
from tests.cap.test_profiles import profile_session as profile_session
from tests.factories import make_user
from tests.wxproducts.test_validation import body, complete

pytestmark = pytest.mark.asyncio

URL = "/api/v1/cap/escalations"

# WMO-No. 1150, figure 2 (UK Met Office): rows from "Very low" to "High" likelihood,
# columns from "Minimal" to "Severe" impact.
WMO_FIGURE = {
    "Very low": ["green", "green", "yellow", "yellow"],
    "Low": ["green", "green", "yellow", "orange"],
    "Medium": ["green", "yellow", "orange", "orange"],
    "High": ["green", "yellow", "orange", "red"],
}
# A stricter grid for the library tests: only the top-right cell is red.
CUSTOM_GRID = [
    ["green", "green", "green", "green"],
    ["green", "green", "green", "yellow"],
    ["green", "green", "yellow", "orange"],
    ["green", "yellow", "orange", "red"],
]


def test_the_standard_grid_is_the_wmo_figure() -> None:
    assert {
        name: list(row)
        for name, row in zip(ibf.LIKELIHOODS, ibf.WMO_MATRIX, strict=True)
    } == WMO_FIGURE


def test_every_cell_is_read_by_likelihood_and_impact() -> None:
    for likelihood, row in WMO_FIGURE.items():
        for impact, colour in zip(ibf.IMPACTS, row, strict=True):
            assert ibf.colour_for(likelihood, impact) == colour
    assert ibf.colour_for("High", "Severe", CUSTOM_GRID) == "red"
    assert ibf.colour_for("Very low", "Severe", CUSTOM_GRID) == "green"


def test_unknown_axes_are_refused() -> None:
    with pytest.raises(ValueError, match="likelihood"):
        ibf.colour_for("Certain", "Minor")
    with pytest.raises(ValueError, match="impact"):
        ibf.colour_for("Low", "Extreme")


def test_a_grid_must_have_the_right_shape_known_colours_and_rise_only() -> None:
    assert ibf.matrix_errors(ibf.WMO_MATRIX) == []
    assert ibf.matrix_errors(CUSTOM_GRID) == []
    assert ibf.matrix_errors([["green"] * 4] * 3)
    purple = [list(row) for row in WMO_FIGURE.values()]
    purple[3][3] = "purple"
    assert any("purple" in e for e in ibf.matrix_errors(purple))
    milder_right = [list(row) for row in WMO_FIGURE.values()]
    milder_right[3] = ["green", "orange", "yellow", "red"]
    assert any("impact" in e and "milder" in e for e in ibf.matrix_errors(milder_right))
    milder_up = [list(row) for row in WMO_FIGURE.values()]
    milder_up[0][0] = "yellow"
    assert any("likelihood" in e for e in ibf.matrix_errors(milder_up))


def with_matrix_content(complete: bool = True, **extra: Any) -> CapProfileDefinition:
    data = definition(True).model_dump(mode="json")
    subtype = data["subtypes"][0]
    subtype["impact_levels"] = [
        {
            "impact": name,
            "impacts": [f"{name} impact on roads"],
            "thresholds": [f"{name} threshold"],
        }
        for name in ibf.IMPACTS
    ]
    subtype["colour_responses"] = [
        {"colour": colour, "response": f"{colour} response"} for colour in ibf.COLOURS
    ]
    if not complete:
        subtype["impact_levels"].pop()
        subtype["colour_responses"].pop(0)
    data.update(extra)
    return CapProfileDefinition.model_validate(data)


def test_a_profile_without_matrix_content_still_validates_and_approves() -> None:
    assert profiles.approval_errors(definition(True)) == []
    assert definition(True).matrix is None
    assert definition(True).subtypes[0].impact_levels == []


def test_matrix_content_must_be_complete_before_approval() -> None:
    assert profiles.approval_errors(with_matrix_content()) == []
    errors = profiles.approval_errors(with_matrix_content(complete=False))
    assert any("Severe impact" in e for e in errors)
    assert any("green" in e and "response" in e for e in errors)


def test_a_custom_grid_must_be_usable_and_entries_unique() -> None:
    assert with_matrix_content(matrix={"cells": CUSTOM_GRID}).matrix is not None
    bad = [row[:] for row in CUSTOM_GRID]
    bad[0][3] = "red"
    bad[1][3] = "green"
    with pytest.raises(ValidationError, match="milder"):
        with_matrix_content(matrix={"cells": bad})
    data = with_matrix_content().model_dump(mode="json")
    data["subtypes"][0]["impact_levels"].append(data["subtypes"][0]["impact_levels"][0])
    with pytest.raises(ValidationError):
        CapProfileDefinition.model_validate(data)


def user_with(*keys: str) -> User:
    role = Role(name=f"ROLE_{uuid.uuid4().hex[:6]}")
    role.permissions = [Permission(key=key) for key in keys]
    user = User(id=uuid.uuid4())
    user.roles = [role]
    return user


async def test_the_library_needs_its_own_permission(
    profile_session: AsyncSession,
) -> None:
    save = CapProfileSave(definition=definition())
    with pytest.raises(AuthorizationError):  # the older CAP settings key is not enough
        await profiles.save_version(
            profile_session, user_with("cap.settings.manage"), "ibf-flood", save
        )
    saved = await profiles.save_version(
        profile_session, user_with("cap.library.manage"), "ibf-flood", save
    )
    assert saved.version == 1


async def approved_library(
    session: AsyncSession, kind: str, data: CapProfileDefinition
) -> Any:
    author = await make_user(session, superuser=True)
    reviewer = await make_user(session, superuser=True)
    saved = await profiles.save_version(
        session, author, f"ibf-{kind}", CapProfileSave(definition=data)
    )
    return await profiles.approve(session, reviewer, saved.id)


async def test_without_a_library_the_colour_is_still_suggested(
    profile_session: AsyncSession,
) -> None:
    user = await make_user(profile_session, superuser=True)
    result = await ibf_suggest.suggest(
        profile_session, user, kind="flood", likelihood="High", impact="Severe"
    )
    assert result.colour.value == "red"
    assert result.meaning == "Take action"
    assert result.percent == 80
    assert result.awareness_level == "4; red; Extreme"
    assert result.available is False
    assert result.impacts == [] and result.response == ""
    assert result.library_key is None


async def test_an_approved_library_supplies_the_grid_and_the_starting_wording(
    profile_session: AsyncSession,
) -> None:
    user = await make_user(profile_session, superuser=True)
    data = with_matrix_content(
        matrix={"cells": CUSTOM_GRID},
    )
    raw = data.model_dump(mode="json")
    raw["subtypes"][0]["cell_texts"] = [
        {
            "likelihood": "High",
            "impact": "Severe",
            "impacts": ["Cell impact: bridges closed"],
            "response": "Cell response: evacuate low ground",
        }
    ]
    data = CapProfileDefinition.model_validate(raw)
    approved = await approved_library(profile_session, "flood", data)

    plain = await ibf_suggest.suggest(
        profile_session, user, kind="flood", likelihood="Very low", impact="Severe"
    )
    assert plain.colour.value == "green"  # the library's grid, not WMO's yellow
    assert plain.available is True
    assert plain.impacts == ["Severe impact on roads"]
    assert plain.thresholds == ["Severe threshold"]
    assert plain.response == "green response"
    assert plain.subtype == "Flash Flood"
    assert (plain.library_key, plain.library_version) == ("ibf-flood", approved.version)

    cell = await ibf_suggest.suggest(
        profile_session, user, kind="flood", likelihood="High", impact="Severe"
    )
    assert cell.colour.value == "red"
    assert cell.impacts == ["Cell impact: bridges closed"]
    assert cell.response == "Cell response: evacuate low ground"

    grid = await ibf_suggest.matrix(profile_session, user, "flood")
    assert [[c.value for c in row] for row in grid.cells] == CUSTOM_GRID
    assert grid.library_key == "ibf-flood"
    assert [level.percent for level in grid.likelihoods] == [10, 30, 60, 80]


async def test_a_draft_library_is_ignored(profile_session: AsyncSession) -> None:
    user = await make_user(profile_session, superuser=True)
    await profiles.save_version(
        profile_session,
        user,
        "ibf-flood",
        CapProfileSave(definition=with_matrix_content()),
    )
    result = await ibf_suggest.suggest(
        profile_session, user, kind="flood", likelihood="Low", impact="Minor"
    )
    assert result.available is False and result.library_key is None


async def test_the_matrix_is_closed_to_users_without_a_reason_to_read_it(
    profile_session: AsyncSession,
) -> None:
    with pytest.raises(AuthorizationError):
        await ibf_suggest.matrix(profile_session, user_with(), "flood")


async def saved_flood(weather_sessions, actor, **values: str) -> UUID:
    payload = body("flood", action="draft", values={**complete("flood"), **values})
    async with weather_sessions() as session:
        await service.write_product(session, payload, actor)
    return payload.id


def request(product_id: UUID, level: str, reason: str | None = None) -> dict:
    data = {"product_id": str(product_id), "revision": 1, "awareness_level": level}
    if reason is not None:
        data["override_reason"] = reason
    return data


def parameters(alert: dict) -> dict[str, str]:
    return {p["value_name"]: p["value"] for p in alert["info"][0]["parameters"]}


async def raised(
    async_client: httpx.AsyncClient, headers: dict[str, str], product_id: UUID, **kw
) -> httpx.Response:
    return await async_client.post(URL, headers=headers, json=request(product_id, **kw))


async def test_the_matching_colour_needs_no_reason_and_is_recorded(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_flood(
        weather_sessions, actor, likelihood="High", impact="Significant"
    )
    response = await raised(
        async_client, superuser_token_headers_async, product_id, level="orange"
    )
    assert response.status_code == 201, response.text
    alert = (
        await async_client.get(
            f"/api/v1/cap/alerts/{response.json()['alert_id']}",
            headers=superuser_token_headers_async,
        )
    ).json()
    values = parameters(alert)
    assert values[LIKELIHOOD_PARAMETER] == "High"
    assert values[IMPACT_PARAMETER] == "Significant"
    assert values[SUGGESTED_COLOUR] == "orange"
    assert OVERRIDE_REASON not in values
    assert IBF_LIBRARY not in values


async def test_a_different_colour_needs_a_reason_that_is_recorded(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_flood(
        weather_sessions, actor, likelihood="Low", impact="Minor"
    )  # the matrix says green
    for reason in (None, "too short"):
        refused = await raised(
            async_client,
            superuser_token_headers_async,
            product_id,
            level="red",
            reason=reason,
        )
        assert refused.status_code == 422, refused.text
        assert "matrix suggests green" in refused.text
    why = "Observed 90 mm in 2 hours upstream; forecaster judgement"
    created = await raised(
        async_client,
        superuser_token_headers_async,
        product_id,
        level="red",
        reason=why,
    )
    assert created.status_code == 201, created.text
    alert = (
        await async_client.get(
            f"/api/v1/cap/alerts/{created.json()['alert_id']}",
            headers=superuser_token_headers_async,
        )
    ).json()
    values = parameters(alert)
    assert values[SUGGESTED_COLOUR] == "green"
    assert values[OVERRIDE_REASON] == why


async def test_an_alert_without_a_valid_likelihood_and_impact_needs_no_reason(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_flood(weather_sessions, actor, likelihood="", impact="")
    response = await raised(
        async_client, superuser_token_headers_async, product_id, level="yellow"
    )
    assert response.status_code == 201, response.text
    alert = (
        await async_client.get(
            f"/api/v1/cap/alerts/{response.json()['alert_id']}",
            headers=superuser_token_headers_async,
        )
    ).json()
    values = parameters(alert)
    assert SUGGESTED_COLOUR not in values and OVERRIDE_REASON not in values


async def test_the_approved_library_and_its_grid_decide_the_suggestion(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    author = await make_user(db_async, superuser=True)
    reviewer = await make_user(db_async, superuser=True)
    saved = await profiles.save_version(
        db_async,
        author,
        "ibf-flood",
        CapProfileSave(definition=with_matrix_content(matrix={"cells": CUSTOM_GRID})),
    )
    approved = await profiles.approve(db_async, reviewer, saved.id)
    assert isinstance(approved.id, uuid.UUID)
    # WMO says orange for Medium x Significant; the library's own grid says yellow.
    product_id = await saved_flood(
        weather_sessions, actor, likelihood="Medium", impact="Significant"
    )
    refused = await raised(
        async_client, superuser_token_headers_async, product_id, level="orange"
    )
    assert refused.status_code == 422, refused.text
    assert "matrix suggests yellow" in refused.text
    created = await raised(
        async_client, superuser_token_headers_async, product_id, level="yellow"
    )
    assert created.status_code == 201, created.text
    alert = (
        await async_client.get(
            f"/api/v1/cap/alerts/{created.json()['alert_id']}",
            headers=superuser_token_headers_async,
        )
    ).json()
    assert parameters(alert)[IBF_LIBRARY] == "ibf-flood:v1"


async def test_a_misspelt_subtype_is_not_found(profile_session: AsyncSession) -> None:
    user = await make_user(profile_session, superuser=True)
    await approved_library(profile_session, "tsunami", with_matrix_content())
    with pytest.raises(NotFoundError):
        await ibf_suggest.suggest(
            profile_session,
            user,
            kind="tsunami",
            likelihood="High",
            impact="Severe",
            subtype="Flsh Flood",
        )
