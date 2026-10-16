"""Connection lifecycle, blocks, reports and the plans/network views."""

import pytest
from sqlalchemy import func, select

from src.events.models import Connection, Report
from tests.events.support import (
    ALEX,
    BASE,
    DANA,
    KAYLA,
    SessionFactory,
    client_as,
    connect,
    profiles,
    seed,
)


async def _connections(factory: SessionFactory) -> list[Connection]:
    async with factory() as db:
        return list((await db.scalars(select(Connection))).all())


async def _state(handle: str, viewer=ALEX) -> str:
    async with client_as(viewer) as client:
        return (await client.get(f"{BASE}/people/{handle}")).json()["connection_state"]


@pytest.mark.asyncio
async def test_repeating_a_request_keeps_one_pending_connection(events_db):
    await profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        for _ in range(2):
            sent = await client.post(f"{BASE}/connections", json={"handle": "dana"})
            assert sent.status_code == 200
    rows = await _connections(events_db)
    assert [(row.requester_id, row.status) for row in rows] == [(ALEX.id, "pending")]
    assert await _state("dana") == "sent"
    assert await _state("alex", viewer=DANA) == "received"


@pytest.mark.asyncio
async def test_a_reciprocal_request_accepts_the_pending_one(events_db):
    await profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        await client.post(f"{BASE}/connections", json={"handle": "dana"})
    async with client_as(DANA) as client:
        back = await client.post(f"{BASE}/connections", json={"handle": "alex"})
        assert back.status_code == 200
    rows = await _connections(events_db)
    assert [(row.requester_id, row.status) for row in rows] == [(ALEX.id, "accepted")]
    assert await _state("dana") == "connected"


@pytest.mark.asyncio
async def test_requests_to_yourself_or_a_blocker_are_refused(events_db):
    await profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        own = await client.post(f"{BASE}/connections", json={"handle": "alex"})
        assert own.status_code == 409
    async with client_as(DANA) as client:
        assert (await client.put(f"{BASE}/blocks/alex")).status_code == 204
    async with client_as(ALEX) as client:
        blocked = await client.post(f"{BASE}/connections", json={"handle": "dana"})
        assert blocked.status_code == 404
    assert await _connections(events_db) == []


@pytest.mark.asyncio
async def test_only_the_addressee_accepts_and_only_participants_remove(events_db):
    await profiles(events_db, ALEX, DANA, KAYLA)
    async with client_as(ALEX) as client:
        await client.post(f"{BASE}/connections", json={"handle": "dana"})
    link_id = (await _connections(events_db))[0].id

    for outsider in (ALEX, KAYLA):  # the requester can't accept their own request
        async with client_as(outsider) as client:
            accepted = await client.post(f"{BASE}/connections/{link_id}/accept")
            assert accepted.status_code == 404
    async with client_as(KAYLA) as client:
        removed = await client.delete(f"{BASE}/connections/{link_id}")
        assert removed.status_code == 404
    assert (await _connections(events_db))[0].status == "pending"

    async with client_as(ALEX) as client:
        assert (await client.delete(f"{BASE}/connections/{link_id}")).status_code == 204
    assert await _connections(events_db) == []


@pytest.mark.asyncio
async def test_blocking_drops_the_connection_and_unblocking_does_not_restore_it(
    events_db,
):
    await profiles(events_db, ALEX, DANA)
    await connect(ALEX, "dana", DANA)
    async with client_as(DANA) as client:
        assert (await client.put(f"{BASE}/blocks/alex")).status_code == 204
    assert await _connections(events_db) == []
    async with client_as(DANA) as client:
        assert (await client.delete(f"{BASE}/blocks/alex")).status_code == 204
    assert await _state("dana") == "none"


@pytest.mark.asyncio
async def test_reports_are_stored_open_for_moderators(events_db):
    await profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        response = await client.post(
            f"{BASE}/reports",
            json={
                "subject_type": "profile",
                "subject_id": "dana",
                "reason": "Spam invitations",
            },
        )
        assert response.status_code == 201
    async with events_db() as db:
        report = await db.scalar(select(Report))
        count = await db.scalar(select(func.count()).select_from(Report))
    assert count == 1
    assert report is not None
    assert (report.reporter_id, report.status) == (ALEX.id, "open")


@pytest.mark.asyncio
async def test_plans_and_network_reflect_rsvps_follows_groups_and_connections(
    events_db,
):
    await seed(events_db)
    await profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        await client.put(f"{BASE}/listings/tech-meetup/rsvp")
        await client.put(f"{BASE}/organisers/spice-isle-tech/follow")
        await client.put(f"{BASE}/groups/anse-runners/membership")
    await connect(ALEX, "dana", DANA)

    async with client_as(ALEX) as client:
        plans = (await client.get(f"{BASE}/me/plans")).json()
        assert [row["slug"] for row in plans["going"]] == ["tech-meetup"]
        assert [row["slug"] for row in plans["following"]] == ["spice-isle-tech"]
        assert [row["slug"] for row in plans["groups"]] == ["anse-runners"]
        network = (await client.get(f"{BASE}/me/network")).json()
        assert [
            (row["person"]["handle"], row["state"]) for row in network["connections"]
        ] == [("dana", "connected")]

        await client.delete(f"{BASE}/listings/tech-meetup/rsvp")
        await client.delete(f"{BASE}/organisers/spice-isle-tech/follow")
        plans = (await client.get(f"{BASE}/me/plans")).json()
        assert plans["going"] == []
        assert plans["following"] == []
