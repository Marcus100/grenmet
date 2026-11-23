"""Raise a saved GMS alert to a CAP warning draft (ADR-0051)."""

import asyncio
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.baseline import product_access
from src.cap.escalation import SOURCE_ID, SOURCE_KIND, SOURCE_REVISION
from src.cap.levels import read_level
from src.cap.models import CapAlert, CapLifecycleState, CapSeverity
from src.cap.schemas import CapNameValue
from src.wxproducts import service
from tests.wxproducts.test_authoring import current_input
from tests.wxproducts.test_validation import body, complete

pytestmark = pytest.mark.asyncio

URL = "/api/v1/cap/escalations"


async def saved_alert(weather_sessions, actor, kind="marine") -> UUID:
    payload = current_input(action="draft")
    if kind != "marine":
        payload = body(kind, action="draft", values=complete(kind))
    async with weather_sessions() as session:
        await service.write_product(session, payload, actor)
    return payload.id


def request(
    product_id: UUID,
    level: str = "orange",
    revision: int = 1,
    reason: str | None = "Exercise: forecaster judgement over the matrix",
) -> dict:
    # The saved test alerts sit in a low cell of the matrix, so a raised colour
    # differs from the suggestion and carries a reason (tests below cover its absence).
    body = {
        "product_id": str(product_id),
        "revision": revision,
        "awareness_level": level,
    }
    if reason is not None:
        body["override_reason"] = reason
    return body


def parameters(alert: dict) -> dict[str, str]:
    return {p["value_name"]: p["value"] for p in alert["info"][0]["parameters"]}


async def test_creates_a_linked_prefilled_draft_and_repeats_idempotently(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_alert(weather_sessions, actor)
    first = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    assert first.status_code == 201, first.text
    data = first.json()
    assert data["created"] is True
    assert data["source"] == {
        "product_id": str(product_id),
        "revision": 1,
        "kind": "marine",
    }

    alert = (
        await async_client.get(
            f"/api/v1/cap/alerts/{data['alert_id']}",
            headers=superuser_token_headers_async,
        )
    ).json()
    assert alert["lifecycle_state"] == "DRAFT"
    info = alert["info"][0]
    assert info["severity"] == CapSeverity.SEVERE.value
    assert info["event"] == "Marine hazard"
    values = parameters(alert)
    assert values[SOURCE_KIND] == "marine"
    assert values[SOURCE_ID] == str(product_id)
    assert values[SOURCE_REVISION] == "1"
    product, colour = read_level(
        [CapNameValue(value_name=k, value=v) for k, v in values.items()]
    )
    assert (product.value, colour.value) == ("Warning", "orange")

    # The source link passes the existing CAP link validation.
    checked = await async_client.post(
        f"/api/v1/cap/alerts/{data['alert_id']}/validate",
        headers=superuser_token_headers_async,
    )
    assert not [e for e in checked.json()["errors"] if "source bulletin" in e]

    again = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id, "red")
    )
    assert again.status_code == 200, again.text
    assert again.json()["alert_id"] == data["alert_id"]
    assert again.json()["created"] is False


@pytest.mark.parametrize(
    "state",
    [CapLifecycleState.EXPIRED, CapLifecycleState.CANCELLED],
)
async def test_an_ended_warning_does_not_block_a_new_one(
    state: CapLifecycleState,
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_alert(weather_sessions, actor)
    first = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    await db_async.execute(
        update(CapAlert)
        .where(CapAlert.id == UUID(first.json()["alert_id"]))
        .values(lifecycle_state=state)
    )
    await db_async.commit()
    second = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    assert second.status_code == 201, second.text
    assert second.json()["alert_id"] != first.json()["alert_id"]
    assert second.json()["created"] is True


@pytest.mark.parametrize(
    "state",
    [
        CapLifecycleState.DRAFT,
        CapLifecycleState.SUBMITTED,
        CapLifecycleState.APPROVED,
        CapLifecycleState.PUBLISHED,
    ],
)
async def test_a_repeat_raise_returns_the_warning_in_force_or_open(
    state: CapLifecycleState,
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Open states and a published warning all block a second draft (CAP AGENTS.md)."""
    product_id = await saved_alert(weather_sessions, actor)
    first = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    await db_async.execute(
        update(CapAlert)
        .where(CapAlert.id == UUID(first.json()["alert_id"]))
        .values(lifecycle_state=state)
    )
    await db_async.commit()
    again = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id, "red")
    )
    assert again.status_code == 200, again.text
    assert again.json() == {
        "alert_id": first.json()["alert_id"],
        "created": False,
        "source": {
            "product_id": str(product_id),
            "revision": 1,
            "kind": "marine",
        },
    }
    found = await async_client.get(
        URL,
        headers=superuser_token_headers_async,
        params={"product_id": str(product_id)},
    )
    assert found.json() == {
        "alert_id": first.json()["alert_id"],
        "lifecycle_state": state.value,
    }


async def test_a_published_warning_blocks_a_second_raise_under_concurrent_clicks(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Two raises at once, with the first warning already published, make no draft."""
    product_id = await saved_alert(weather_sessions, actor)
    first = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    await db_async.execute(
        update(CapAlert)
        .where(CapAlert.id == UUID(first.json()["alert_id"]))
        .values(lifecycle_state=CapLifecycleState.PUBLISHED)
    )
    await db_async.commit()
    replies = await asyncio.gather(
        *(
            async_client.post(
                URL, headers=superuser_token_headers_async, json=request(product_id)
            )
            for _ in range(2)
        )
    )
    assert [r.status_code for r in replies] == [200, 200]
    assert {r.json()["alert_id"] for r in replies} == {first.json()["alert_id"]}
    assert all(r.json()["created"] is False for r in replies)


async def test_concurrent_first_raises_make_one_draft(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_alert(weather_sessions, actor)
    replies = await asyncio.gather(
        *(
            async_client.post(
                URL, headers=superuser_token_headers_async, json=request(product_id)
            )
            for _ in range(2)
        )
    )
    assert sorted(r.status_code for r in replies) == [200, 201]
    assert len({r.json()["alert_id"] for r in replies}) == 1


async def test_needs_cap_create_permission(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_alert(weather_sessions, actor)
    response = await async_client.post(
        URL, headers=normal_user_token_headers_async, json=request(product_id)
    )
    assert response.status_code == 403


async def test_needs_product_access_to_the_source_kind(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    product_id = await saved_alert(weather_sessions, actor)

    async def only_morning(*_args):
        return ["morning"]

    monkeypatch.setattr(product_access, "allowed_kinds", only_morning)
    response = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    assert response.status_code == 403


async def test_refuses_forecasts_unknown_products_and_green(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    forecast = await saved_alert(weather_sessions, actor, kind="morning")
    refused = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(forecast)
    )
    assert refused.status_code == 422
    missing = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(uuid4())
    )
    assert missing.status_code == 404
    product_id = await saved_alert(weather_sessions, actor)
    green = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id, "green")
    )
    assert green.status_code == 422


async def test_lookup_reports_the_raised_warning_and_leaves_the_alert_alone(
    async_client: httpx.AsyncClient,
    weather_sessions,
    actor,
    superuser_token_headers_async: dict[str, str],
) -> None:
    product_id = await saved_alert(weather_sessions, actor)
    none = await async_client.get(
        URL,
        headers=superuser_token_headers_async,
        params={"product_id": str(product_id)},
    )
    assert none.json() == {"alert_id": None, "lifecycle_state": None}
    created = await async_client.post(
        URL, headers=superuser_token_headers_async, json=request(product_id)
    )
    found = await async_client.get(
        URL,
        headers=superuser_token_headers_async,
        params={"product_id": str(product_id)},
    )
    assert found.json() == {
        "alert_id": created.json()["alert_id"],
        "lifecycle_state": "DRAFT",
    }
    # Raising a warning never edits the green alert: it still has one revision.
    async with weather_sessions() as session:
        revisions = await service.history(session, product_id, ["marine"])
    assert [r.revision for r in revisions] == [1]
