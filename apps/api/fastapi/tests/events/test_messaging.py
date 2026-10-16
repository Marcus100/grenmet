"""Direct threads: one per pair, and send rights re-checked on every message."""

import pytest
from sqlalchemy import select

from src.events.models import Connection
from tests.events.support import (
    ALEX,
    BASE,
    DANA,
    SessionFactory,
    client_as,
    connect,
    profiles,
    seed,
)


async def _open(user, handle: str) -> str:
    async with client_as(user) as client:
        response = await client.post(f"{BASE}/threads", json={"handle": handle})
        assert response.status_code == 200, response.text
        return response.json()["id"]


async def _disconnect(factory: SessionFactory) -> None:
    async with client_as(ALEX) as client:
        link_id = (await client.get(f"{BASE}/me/network")).json()["connections"][0][
            "id"
        ]
        assert (await client.delete(f"{BASE}/connections/{link_id}")).status_code == 204
    async with factory() as db:
        assert (await db.scalars(select(Connection))).all() == []


@pytest.mark.asyncio
async def test_each_pair_shares_one_direct_thread(events_db):
    await profiles(events_db, ALEX, DANA)
    await connect(ALEX, "dana", DANA)
    first = await _open(ALEX, "dana")
    assert await _open(ALEX, "dana") == first
    assert await _open(DANA, "alex") == first


@pytest.mark.asyncio
async def test_removing_the_connection_stops_direct_messages(events_db):
    await profiles(events_db, ALEX, DANA)
    await connect(ALEX, "dana", DANA)
    thread_id = await _open(ALEX, "dana")
    await _disconnect(events_db)
    async with client_as(ALEX) as client:
        thread = (await client.get(f"{BASE}/threads/{thread_id}")).json()
        assert thread["can_send"] is False
        refused = await client.post(
            f"{BASE}/threads/{thread_id}/messages", json={"body": "Still there?"}
        )
        assert refused.status_code == 403


@pytest.mark.asyncio
async def test_a_shared_active_group_keeps_direct_messages_open(events_db):
    await seed(events_db)
    await profiles(events_db, ALEX, DANA)
    await connect(ALEX, "dana", DANA)
    thread_id = await _open(ALEX, "dana")
    for user in (ALEX, DANA):
        async with client_as(user) as client:
            await client.put(f"{BASE}/groups/anse-runners/membership")
    await _disconnect(events_db)
    async with client_as(ALEX) as client:
        sent = await client.post(
            f"{BASE}/threads/{thread_id}/messages", json={"body": "See you Saturday"}
        )
        assert sent.status_code == 201


@pytest.mark.asyncio
async def test_thread_list_titles_and_orders_by_latest_message(events_db):
    await seed(events_db)
    await profiles(events_db, ALEX, DANA)
    await connect(ALEX, "dana", DANA)
    direct_id = await _open(ALEX, "dana")
    async with client_as(ALEX) as client:
        await client.put(f"{BASE}/groups/anse-runners/membership")
        group_id = (await client.get(f"{BASE}/groups/anse-runners")).json()[
            "chat_thread_id"
        ]
        await client.post(f"{BASE}/threads/{group_id}/messages", json={"body": "Hi"})
        await client.post(f"{BASE}/threads/{direct_id}/messages", json={"body": "Yo"})
        threads = (await client.get(f"{BASE}/threads")).json()
    assert [
        (row["kind"], row["title"], row["group_slug"], row["last_message"])
        for row in threads
    ] == [
        ("direct", "Dana Tester", None, "Yo"),
        ("group", "Anse Runners", "anse-runners", "Hi"),
    ]
