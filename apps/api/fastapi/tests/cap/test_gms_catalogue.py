"""The GMS warning catalogue served by ``GET /api/v1/cap/gms-catalogue``.

``fixtures/gms_catalogue.json`` is the snapshot of the gaa-admin constants taken
before they moved here (2026-10-30). The served catalogue must equal it, so the
desk and the published XML keep the same hazards, parishes, products and colours.
"""

import json
from pathlib import Path

import httpx

from src.cap import catalogue, levels
from src.cap.levels import GmsColour, GmsProduct

SNAPSHOT = json.loads(
    (Path(__file__).parent / "fixtures" / "gms_catalogue.json").read_text(
        encoding="utf-8"
    )
)
URL = "/api/v1/cap/gms-catalogue"


async def _served(client: httpx.AsyncClient, headers: dict[str, str]) -> dict:
    resp = await client.get(URL, headers=headers)
    assert resp.status_code == 200, resp.text
    body: dict = resp.json()
    return body


async def test_served_catalogue_matches_the_desk_snapshot(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    body = await _served(async_client, superuser_token_headers_async)

    assert body["hazard_groups"] == SNAPSHOT["hazard_groups"]
    assert body["category_labels"] == SNAPSHOT["category_labels"]
    assert body["parishes"] == SNAPSHOT["parishes"]
    assert body["products"] == SNAPSHOT["products"]
    assert body["colours"] == SNAPSHOT["colours"]
    assert body["geocode_name"] == SNAPSHOT["parameter_names"]["geocode"]


async def test_colour_rules_agree_with_the_level_rules(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    body = await _served(async_client, superuser_token_headers_async)

    for colour in body["colours"]:
        key = GmsColour(colour["key"])
        assert levels.awareness_value(key) == (
            f"{colour['awareness_code']}; {colour['key']}; {colour['severity']}"
        )
        assert levels.severity_for(key).value == colour["severity"]


async def test_outlook_is_the_only_product_without_a_colour(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    body = await _served(async_client, superuser_token_headers_async)

    without_colour = [p["key"] for p in body["products"] if not p["needs_colour"]]
    assert without_colour == [GmsProduct.OUTLOOK.value]


def test_hazard_events_are_unique_and_non_empty() -> None:
    events = [event for group in catalogue.HAZARD_GROUPS for event in group.events]

    assert events
    assert all(event.strip() == event and event for event in events)
    assert len(events) == len(set(events))


def test_every_parish_has_a_geocode_in_the_configured_system() -> None:
    assert catalogue.GEOCODE_NAME == "ISO3166-2:GD"
    assert all(parish.iso_code.startswith("GD-") for parish in catalogue.PARISHES)


async def test_catalogue_needs_the_cap_read_permission(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    resp = await async_client.get(URL, headers=normal_user_token_headers_async)

    assert resp.status_code in (401, 403), resp.text


async def test_the_existing_catalogs_endpoint_is_unchanged(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    resp = await async_client.get(
        "/api/v1/cap/catalogs", headers=superuser_token_headers_async
    )

    assert resp.status_code == 200
    assert set(resp.json()) == {
        "categories",
        "response_types",
        "urgencies",
        "severities",
        "certainties",
        "statuses",
        "message_types",
        "scopes",
        "languages",
    }
