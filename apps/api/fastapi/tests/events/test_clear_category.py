"""An organiser may clear a listing's category (#810, owner decision 2026-11-15).

An explicit ``category: null`` leaves the listing uncategorised (no legacy
category and no catalogue category). Leaving ``category`` out keeps the current
one. Uncategorised listings still show in "All events", detail and search, and
drop out of category filters and category counts.
"""

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Organiser, OrganiserMember
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
)

MANAGE = f"{BASE}/manage/listings"


def _payload(**changes: Any) -> dict[str, Any]:
    start = (utc_now() + timedelta(days=10)).replace(microsecond=0)
    body: dict[str, Any] = {
        "title": "Harbour Lights Fete",
        "summary": "Lantern night on the water",
        "category": "fete",
        "parish": "st-george",
        "venue": "Carenage",
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=5)).isoformat()}Z",
        "admission": "free",
        "capacity": 300,
        "status": "published",
    }
    body.update(changes)
    return body


async def _organiser(factory: SessionFactory, db_async: AsyncSession):
    user = await user_with_role(db_async, "events-organiser")
    async with factory() as db:
        organiser = Organiser(slug="harbour-crew", name="Harbour Crew", verified=True)
        db.add(organiser)
        await db.flush()
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=user.id))
        await db.commit()
    return user


async def _public(path: str, **params: Any) -> Any:
    async with client_as(None) as client:
        resp = await client.get(f"{BASE}{path}", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _uncategorised(body: dict[str, Any]) -> None:
    assert body["category"] is None
    assert body["category_slug"] is None
    assert body["subcategory_slug"] is None


@pytest.mark.asyncio
async def test_explicit_null_clears_and_omitting_keeps(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        created = await client.post(
            MANAGE,
            json=_payload(category_slug="parties-fetes", subcategory_slug="boat-fete"),
        )
        assert created.status_code == 201, created.text
        listing_id = created.json()["id"]

        omitted = _payload(title="Renamed fete")
        del omitted["category"]
        kept = await client.put(f"{MANAGE}/{listing_id}", json=omitted)
        assert kept.status_code == 200, kept.text
        assert kept.json()["category"] == "fete"
        assert kept.json()["subcategory_slug"] == "boat-fete"

        cleared = await client.put(
            f"{MANAGE}/{listing_id}", json=_payload(category=None)
        )
        assert cleared.status_code == 200, cleared.text
        _uncategorised(cleared.json())

        # A later save that leaves the category out keeps it cleared; the
        # legacy fallback must not re-classify it.
        still = await client.put(f"{MANAGE}/{listing_id}", json=omitted)
        assert still.status_code == 200, still.text
        _uncategorised(still.json())

        restored = await client.put(
            f"{MANAGE}/{listing_id}", json=_payload(category="music")
        )
        assert restored.status_code == 200, restored.text
        assert restored.json()["category"] == "music"
        assert restored.json()["category_slug"] == "music-live-shows"


@pytest.mark.asyncio
async def test_create_without_a_category_is_uncategorised(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        explicit = await client.post(MANAGE, json=_payload(category=None))
        assert explicit.status_code == 201, explicit.text
        _uncategorised(explicit.json())
        omitted = _payload(title="No category given")
        del omitted["category"]
        resp = await client.post(MANAGE, json=omitted)
        assert resp.status_code == 201, resp.text
        _uncategorised(resp.json())


@pytest.mark.asyncio
async def test_real_values_are_still_validated(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        for bad in ("", "concert", 7):
            resp = await client.post(MANAGE, json=_payload(category=bad))
            assert resp.status_code == 422, (bad, resp.text)


@pytest.mark.asyncio
async def test_uncategorised_listings_show_in_discovery_but_not_in_category_views(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        created = await client.post(
            MANAGE, json=_payload(title="Mystery Lantern Night")
        )
        assert created.status_code == 201, created.text
        listing = created.json()
        cleared = await client.put(
            f"{MANAGE}/{listing['id']}",
            json=_payload(title="Mystery Lantern Night", category=None),
        )
        assert cleared.status_code == 200, cleared.text
        managed = await client.get(f"{BASE}/manage")
        assert managed.status_code == 200, managed.text
        assert [row["category"] for row in managed.json()["listings"]] == [None]

    every = await _public("/listings")
    assert [card["slug"] for card in every["data"]] == [listing["slug"]]
    _uncategorised(every["data"][0])

    assert (await _public("/listings", category="fete"))["data"] == []
    assert (await _public("/listings", category_slug="parties-fetes"))["data"] == []
    found = await _public("/listings", q="lantern")
    assert [card["slug"] for card in found["data"]] == [listing["slug"]]

    detail = await _public(f"/listings/{listing['slug']}")
    _uncategorised(detail)

    tree = (await _public("/public/categories"))["data"]
    assert all(node["listing_count"] == 0 for node in tree)
