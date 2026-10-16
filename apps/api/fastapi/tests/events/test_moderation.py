"""Moderation routes behind the real ``events.moderate`` permission check."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from tests.events.roles import user_with_role
from tests.events.support import (
    ALEX,
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
)

REPORT = {"subject_type": "listing", "subject_id": "tech-meetup", "reason": "Scam"}
SUGGESTION = {
    "title": "Fish Friday",
    "event_date": "2026-11-06",
    "venue": "Gouyave",
    "category": "food",
    "parish": "st-john",
}


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [None, "events-member", "events-organiser"])
async def test_moderation_needs_the_moderate_permission(
    events_db: SessionFactory, db_async: AsyncSession, role: str | None
):
    _ = events_db
    user = await user_with_role(db_async, role)
    async with client_with_real_roles(user) as client:
        for path in ("reports", "suggestions"):
            response = await client.get(f"{BASE}/moderation/{path}")
            assert response.status_code == 403, (path, response.text)
        patched = await client.patch(
            f"{BASE}/moderation/reports/{uuid.uuid4()}", json={"status": "dismissed"}
        )
        assert patched.status_code == 403


@pytest.mark.asyncio
async def test_moderators_resolve_reports_and_suggestions(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    async with client_as(ALEX) as client:
        assert (await client.post(f"{BASE}/reports", json=REPORT)).status_code == 201
        assert (
            await client.post(f"{BASE}/suggestions", json=SUGGESTION)
        ).status_code == 201

    moderator = await user_with_role(db_async, "events-moderator")
    async with client_with_real_roles(moderator) as client:
        reports = (await client.get(f"{BASE}/moderation/reports")).json()
        assert [(row["subject_id"], row["status"]) for row in reports] == [
            ("tech-meetup", "open")
        ]
        resolved = await client.patch(
            f"{BASE}/moderation/reports/{reports[0]['id']}",
            json={"status": "actioned"},
        )
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "actioned"
        assert (await client.get(f"{BASE}/moderation/reports")).json() == []

        suggestions = (await client.get(f"{BASE}/moderation/suggestions")).json()
        assert [row["title"] for row in suggestions] == ["Fish Friday"]
        approved = await client.patch(
            f"{BASE}/moderation/suggestions/{suggestions[0]['id']}",
            json={"status": "approved"},
        )
        assert approved.json()["status"] == "approved"
        assert (await client.get(f"{BASE}/moderation/suggestions")).json() == []

        missing = await client.patch(
            f"{BASE}/moderation/reports/{uuid.uuid4()}", json={"status": "dismissed"}
        )
        assert missing.status_code == 404
        reopened = await client.patch(
            f"{BASE}/moderation/reports/{reports[0]['id']}", json={"status": "open"}
        )
        assert reopened.status_code == 422  # only actioned or dismissed
