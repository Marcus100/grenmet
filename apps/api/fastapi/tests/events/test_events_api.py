"""Barrels Events API against a disposable, migrated events database."""

from datetime import datetime, timedelta

import pytest

from src.events import service
from src.events.models import Group, GroupMember
from src.utils.datetime import utc_now
from tests.events.support import (
    ALEX,
    BASE,
    DANA,
    KAYLA,
    client_as,
    profiles,
    seed,
)


@pytest.mark.asyncio
async def test_public_listings_hide_drafts_and_show_prices(events_db):
    await seed(events_db)
    async with client_as(None) as client:
        response = await client.get(f"{BASE}/listings")
        assert response.status_code == 200, response.text
        body = response.json()
        assert [row["slug"] for row in body["data"]] == ["tech-meetup", "sunset-fete"]
        fete = body["data"][1]
        assert fete["price_from_minor"] == 15000
        assert fete["viewer_going"] is None
        assert (await client.get(f"{BASE}/listings/secret-draft")).status_code == 404
        filtered = await client.get(f"{BASE}/listings", params={"price": "free"})
        assert [row["slug"] for row in filtered.json()["data"]] == ["tech-meetup"]


@pytest.mark.asyncio
async def test_member_writes_need_an_events_session(events_db):
    await seed(events_db)
    async with client_as(None) as client:
        assert (
            await client.put(f"{BASE}/listings/tech-meetup/rsvp")
        ).status_code == 401


@pytest.mark.asyncio
async def test_rsvp_and_save_show_in_plans_and_going_list(events_db):
    await seed(events_db)
    async with client_as(ALEX) as client:
        assert (
            await client.put(f"{BASE}/listings/tech-meetup/rsvp")
        ).status_code == 204
        assert (
            await client.put(f"{BASE}/listings/sunset-fete/save")
        ).status_code == 204
        plans = (await client.get(f"{BASE}/me/plans")).json()
        assert [row["slug"] for row in plans["going"]] == ["tech-meetup"]
        assert [row["slug"] for row in plans["saved"]] == ["sunset-fete"]
        detail = (await client.get(f"{BASE}/listings/tech-meetup")).json()
        assert detail["going_count"] == 1
        assert detail["viewer_going"] is True
        assert detail["going_preview"][0]["display_name"] == "Alex Tester"


@pytest.mark.asyncio
async def test_messaging_needs_a_connection_or_shared_group(events_db):
    await seed(events_db)
    await profiles(events_db, ALEX, DANA, KAYLA)
    async with client_as(ALEX) as client:
        dana = (await client.get(f"{BASE}/people/dana")).json()
        assert dana["can_message"] is False
        blocked = await client.post(f"{BASE}/threads", json={"handle": "dana"})
        assert blocked.status_code == 403
        assert (
            await client.post(f"{BASE}/connections", json={"handle": "dana"})
        ).status_code == 200

    async with client_as(DANA) as client:
        network = (await client.get(f"{BASE}/me/network")).json()
        request = next(
            row for row in network["connections"] if row["state"] == "received"
        )
        assert (
            await client.post(f"{BASE}/connections/{request['id']}/accept")
        ).status_code == 204

    async with client_as(ALEX) as client:
        thread = await client.post(f"{BASE}/threads", json={"handle": "dana"})
        assert thread.status_code == 200
        thread_id = thread.json()["id"]
        sent = await client.post(
            f"{BASE}/threads/{thread_id}/messages", json={"body": "Hi Dana"}
        )
        assert sent.status_code == 201

    # Shared group also allows messaging, without a connection.
    async with client_as(KAYLA) as client:
        assert (
            await client.put(f"{BASE}/groups/anse-runners/membership")
        ).status_code == 200
    async with client_as(ALEX) as client:
        await client.put(f"{BASE}/groups/anse-runners/membership")
        kayla = (await client.get(f"{BASE}/people/kayla")).json()
        assert kayla["can_message"] is True
        group = (await client.get(f"{BASE}/groups/anse-runners")).json()
        assert group["member_count"] == 2
        assert group["chat_thread_id"] is not None


@pytest.mark.asyncio
async def test_blocking_hides_people_and_stops_messages(events_db):
    await seed(events_db)
    await profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        await client.post(f"{BASE}/connections", json={"handle": "dana"})
    async with client_as(DANA) as client:
        request = (await client.get(f"{BASE}/me/network")).json()["connections"][0]
        await client.post(f"{BASE}/connections/{request['id']}/accept")
        thread_id = (
            await client.post(f"{BASE}/threads", json={"handle": "alex"})
        ).json()["id"]
        assert (await client.put(f"{BASE}/blocks/alex")).status_code == 204
    async with client_as(ALEX) as client:
        assert (await client.get(f"{BASE}/people/dana")).status_code == 404
        refused = await client.post(
            f"{BASE}/threads/{thread_id}/messages", json={"body": "Hello?"}
        )
        assert refused.status_code == 403


@pytest.mark.asyncio
async def test_connections_only_profiles_are_restricted(events_db):
    await seed(events_db)
    await profiles(events_db, ALEX, KAYLA)
    async with client_as(KAYLA) as client:
        update = await client.patch(
            f"{BASE}/me/profile",
            json={
                "visibility": "connections",
                "bio": "Private bio",
                "interests": ["fete"],
            },
        )
        assert update.status_code == 200
    async with client_as(ALEX) as client:
        kayla = (await client.get(f"{BASE}/people/kayla")).json()
        assert kayla["restricted"] is True
        assert kayla["bio"] is None and kayla["interests"] == []


@pytest.mark.asyncio
async def test_approval_groups_hold_members_pending(events_db):
    ids = await seed(events_db)
    async with events_db() as db:
        group = await db.get(Group, ids["group"])
        assert group is not None
        group.join_policy = "approval"
        await db.commit()
    async with client_as(ALEX) as client:
        joined = await client.put(f"{BASE}/groups/anse-runners/membership")
        assert joined.json()["message"] == "Request sent"
        detail = (await client.get(f"{BASE}/groups/anse-runners")).json()
        assert detail["viewer_status"] == "pending"
        assert detail["member_count"] == 0
        assert detail["chat_thread_id"] is None
    async with events_db() as db:
        row = await db.get(GroupMember, (ids["group"], ALEX.id))
        assert row is not None and row.status == "pending"


@pytest.mark.asyncio
async def test_organisers_manage_their_listings(events_db):
    await seed(events_db)
    start = (utc_now() + timedelta(days=10)).replace(microsecond=0)
    payload = {
        "title": "Harbour Lights Fete",
        "summary": "Lantern night on the water",
        "category": "fete",
        "parish": "st-george",
        "venue": "Carenage",
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=5)).isoformat()}Z",
        "admission": "ticketed",
        "capacity": 300,
        "status": "published",
        "tiers": [{"name": "General", "price_minor": 8000, "allocation": 400}],
    }
    async with client_as(DANA) as client:
        assert (
            await client.post(f"{BASE}/manage/listings", json=payload)
        ).status_code == 403
    async with client_as(DANA, organiser=True) as client:
        over = await client.post(f"{BASE}/manage/listings", json=payload)
        assert over.status_code == 409  # allocations exceed capacity
        payload["tiers"][0]["allocation"] = 250
        created = await client.post(f"{BASE}/manage/listings", json=payload)
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["slug"] == "harbour-lights-fete"
        assert body["price_from_minor"] == 8000
        workspace = (await client.get(f"{BASE}/manage")).json()
        assert "secret-draft" in [row["slug"] for row in workspace["listings"]]
    async with client_as(None) as client:
        assert (
            await client.get(f"{BASE}/listings/harbour-lights-fete")
        ).status_code == 200


@pytest.mark.asyncio
async def test_anyone_can_suggest_an_event(events_db):
    _ = events_db
    async with client_as(None) as client:
        response = await client.post(
            f"{BASE}/suggestions",
            json={
                "title": "Fish Friday",
                "event_date": "2026-11-06",
                "venue": "Gouyave",
                "category": "food",
                "parish": "st-john",
            },
        )
        assert response.status_code == 201


def _listing_payload(**overrides: object) -> dict[str, object]:
    start = (utc_now() + timedelta(days=10)).replace(microsecond=0)
    payload: dict[str, object] = {
        "title": "Harbour Lights Fete",
        "summary": "Lantern night on the water",
        "category": "fete",
        "parish": "st-george",
        "venue": "Carenage",
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=5)).isoformat()}Z",
        "admission": "rsvp",
        "capacity": 300,
        "status": "published",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_listing_updates_validate_and_cancelling_unpublishes(events_db):
    await seed(events_db)
    async with client_as(DANA, organiser=True) as client:
        created = await client.post(f"{BASE}/manage/listings", json=_listing_payload())
        assert created.status_code == 201, created.text
        listing_id = created.json()["id"]
        payload = _listing_payload()
        backwards = await client.put(
            f"{BASE}/manage/listings/{listing_id}",
            json={**payload, "ends_at": payload["starts_at"]},
        )
        assert backwards.status_code == 409
        untiered = await client.put(
            f"{BASE}/manage/listings/{listing_id}",
            json=_listing_payload(admission="ticketed", tiers=[]),
        )
        assert untiered.status_code == 409
        cancelled = await client.put(
            f"{BASE}/manage/listings/{listing_id}",
            json=_listing_payload(status="cancelled"),
        )
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
    async with client_as(None) as client:
        assert (
            await client.get(f"{BASE}/listings/harbour-lights-fete")
        ).status_code == 404


@pytest.mark.asyncio
async def test_following_an_organiser_is_idempotent(events_db):
    await seed(events_db)
    async with client_as(ALEX) as client:
        for _ in range(2):
            followed = await client.put(f"{BASE}/organisers/spice-isle-tech/follow")
            assert followed.status_code == 204
        organiser = (await client.get(f"{BASE}/organisers/spice-isle-tech")).json()
        assert organiser["follower_count"] == 1
        assert organiser["viewer_following"] is True
        for _ in range(2):
            unfollowed = await client.delete(
                f"{BASE}/organisers/spice-isle-tech/follow"
            )
            assert unfollowed.status_code == 204
        organiser = (await client.get(f"{BASE}/organisers/spice-isle-tech")).json()
        assert organiser["follower_count"] == 0
        assert organiser["viewer_following"] is False
        assert (
            await client.put(f"{BASE}/organisers/no-such-organiser/follow")
        ).status_code == 404


def test_weekend_window_uses_grenada_dates():
    # Saturday 3 Oct 2026, 23:30 in Grenada = Sunday 03:30 UTC.
    start, end = service.when_window("weekend", datetime(2026, 10, 4, 3, 30))
    assert start == datetime(2026, 10, 3, 4, 0)  # Saturday 00:00 Grenada
    assert end == datetime(2026, 10, 5, 4, 0)  # Monday 00:00 Grenada
    wed_start, wed_end = service.when_window("weekend", datetime(2026, 9, 30, 12, 0))
    assert wed_start == datetime(2026, 10, 2, 4, 0)
    assert wed_end == datetime(2026, 10, 5, 4, 0)
