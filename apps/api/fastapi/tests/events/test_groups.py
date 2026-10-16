"""Group membership and the chat access it grants."""

import pytest

from src.events.models import Group
from tests.events.support import (
    ALEX,
    BASE,
    KAYLA,
    SessionFactory,
    client_as,
    profiles,
    seed,
)

GROUP = f"{BASE}/groups/anse-runners"


async def _chat_id(user) -> str:
    async with client_as(user) as client:
        chat_id = (await client.get(GROUP)).json()["chat_thread_id"]
    assert chat_id is not None
    return chat_id


async def _require_approval(factory: SessionFactory, group_id) -> None:
    async with factory() as db:
        group = await db.get(Group, group_id)
        assert group is not None
        group.join_policy = "approval"
        await db.commit()


@pytest.mark.asyncio
async def test_joining_an_open_group_opens_its_chat_and_leaving_closes_it(events_db):
    await seed(events_db)
    async with client_as(ALEX) as client:
        joined = await client.put(f"{GROUP}/membership")
        assert joined.json()["message"] == "Joined"
    chat_id = await _chat_id(ALEX)

    async with client_as(ALEX) as client:
        thread = (await client.get(f"{BASE}/threads/{chat_id}")).json()
        assert thread["kind"] == "group" and thread["can_send"] is True
        sent = await client.post(
            f"{BASE}/threads/{chat_id}/messages", json={"body": "Run at six?"}
        )
        assert sent.status_code == 201

        assert (await client.delete(f"{GROUP}/membership")).status_code == 204
        detail = (await client.get(GROUP)).json()
        assert detail["viewer_status"] is None
        assert detail["chat_thread_id"] is None
        assert (await client.get(f"{BASE}/threads/{chat_id}")).status_code == 404
        refused = await client.post(
            f"{BASE}/threads/{chat_id}/messages", json={"body": "Still here?"}
        )
        assert refused.status_code == 404


@pytest.mark.asyncio
async def test_pending_members_cannot_reach_an_existing_group_chat(events_db):
    ids = await seed(events_db)
    async with client_as(KAYLA) as client:
        await client.put(f"{GROUP}/membership")
    chat_id = await _chat_id(KAYLA)
    await _require_approval(events_db, ids["group"])

    async with client_as(ALEX) as client:
        joined = await client.put(f"{GROUP}/membership")
        assert joined.json()["message"] == "Request sent"
        assert (await client.get(GROUP)).json()["chat_thread_id"] is None
        assert (await client.get(f"{BASE}/threads/{chat_id}")).status_code == 404
        refused = await client.post(
            f"{BASE}/threads/{chat_id}/messages", json={"body": "Let me in"}
        )
        assert refused.status_code == 404
        threads = (await client.get(f"{BASE}/threads")).json()
        assert threads == []


@pytest.mark.asyncio
async def test_group_members_hide_people_blocked_either_way(events_db):
    await seed(events_db)
    await profiles(events_db, ALEX, KAYLA)
    for user in (ALEX, KAYLA):
        async with client_as(user) as client:
            await client.put(f"{GROUP}/membership")
    async with client_as(KAYLA) as client:
        assert (await client.put(f"{BASE}/blocks/alex")).status_code == 204
        members = (await client.get(GROUP)).json()["members"]
        assert [row["handle"] for row in members] == ["kayla"]
    async with client_as(ALEX) as client:
        members = (await client.get(GROUP)).json()["members"]
        assert [row["handle"] for row in members] == ["alex"]
    async with client_as(None) as client:
        members = (await client.get(GROUP)).json()["members"]
        assert sorted(row["handle"] for row in members) == ["alex", "kayla"]
