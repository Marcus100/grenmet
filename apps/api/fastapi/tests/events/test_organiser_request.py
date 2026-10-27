"""Self-service organiser requests and moderator verification (real gates)."""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Organiser
from src.organisations.models import Membership
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
)

REQUEST = f"{BASE}/manage/organiser"
BODY = {"name": "Island Beats", "bio": "Parties and pop-ups."}


@pytest.mark.asyncio
async def test_member_requests_an_organiser_and_becomes_owner(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    member = await user_with_role(db_async, None)
    async with client_with_real_roles(member) as client:
        assert (await client.get(f"{BASE}/manage")).status_code == 403
        response = await client.post(REQUEST, json=BODY)
        assert response.status_code == 201, response.text
        created = response.json()
        assert created["slug"] == "island-beats"
        assert created["verified"] is False
        assert created["organisation_id"].startswith("org_")
        workspace = await client.get(f"{BASE}/manage")
        assert workspace.status_code == 200
        assert workspace.json()["organisers"][0]["verified"] is False
    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == created["organisation_id"]
        )
    )
    assert membership is not None
    assert (membership.user_id, membership.role) == (member.id, "owner")


@pytest.mark.asyncio
async def test_duplicate_name_and_second_pending_request_conflict(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    first = await user_with_role(db_async, None)
    second = await user_with_role(db_async, None)
    async with client_with_real_roles(first) as client:
        assert (await client.post(REQUEST, json=BODY)).status_code == 201
        again = await client.post(REQUEST, json={"name": "Another"})
        assert again.status_code == 409
        assert "awaiting review" in again.text
    async with client_with_real_roles(second) as client:
        taken = await client.post(REQUEST, json=BODY)
        assert taken.status_code == 409
        assert "taken" in taken.text


@pytest.mark.asyncio
async def test_anonymous_cannot_request(events_db: SessionFactory):
    _ = events_db
    async with client_as(None) as client:
        assert (await client.post(REQUEST, json=BODY)).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [None, "events-member", "events-organiser"])
async def test_only_moderators_review_organisers(
    events_db: SessionFactory, db_async: AsyncSession, role: str | None
):
    _ = events_db
    user = await user_with_role(db_async, role)
    async with client_with_real_roles(user) as client:
        assert (await client.get(f"{BASE}/moderation/organisers")).status_code == 403


@pytest.mark.asyncio
async def test_superuser_verifies_a_pending_organiser(
    events_db: SessionFactory,
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    mfa_admin,
):
    member = await user_with_role(db_async, None)
    async with client_with_real_roles(member) as client:
        created = (await client.post(REQUEST, json=BODY)).json()
    moderator = await user_with_role(db_async, "events-moderator")
    _, headers = await mfa_admin()
    async with client_with_real_roles(moderator) as client:
        pending = (await client.get(f"{BASE}/moderation/organisers")).json()
        assert [row["slug"] for row in pending] == ["island-beats"]
        assert (
            await client.patch(
                f"{BASE}/moderation/organisers/{created['id']}",
                json={"verified": True},
            )
        ).status_code in (401, 403)  # moderators read; they do not decide
    url = f"{BASE}/moderation/organisers/{created['id']}"
    done = await async_client.patch(url, json={"verified": True}, headers=headers)
    assert done.status_code == 200
    assert done.json()["verified"] is True
    async with client_with_real_roles(moderator) as client:
        assert (await client.get(f"{BASE}/moderation/organisers")).json() == []
    missing = await async_client.patch(
        f"{BASE}/moderation/organisers/00000000-0000-0000-0000-000000000000",
        json={"verified": True},
        headers=headers,
    )
    assert missing.status_code == 404
    async with events_db() as db:
        row = await db.scalar(select(Organiser))
        assert row is not None
        assert row.verified is True
