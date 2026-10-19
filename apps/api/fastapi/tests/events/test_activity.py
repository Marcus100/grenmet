"""Events activity log (F7): append-only, one row per organiser/moderation mutation."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Activity, MemberProfile
from tests.events.roles import user_with_role
from tests.events.support import (
    ALEX,
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
)
from tests.events.test_organiser_admin import _organiser, _payload

MANAGE = f"{BASE}/manage/listings"


async def _rows(factory: SessionFactory) -> list[Activity]:
    async with factory() as db:
        return list(
            (await db.scalars(select(Activity).order_by(Activity.created_at))).all()
        )


@pytest.mark.asyncio
async def test_each_listing_mutation_writes_exactly_one_row(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        body = _payload(status="draft")
        listing_id = (await client.post(MANAGE, json=body)).json()["id"]
        assert [row.action for row in await _rows(events_db)] == ["listing.created"]

        renamed = {**body, "title": "Harbour Lights Fete 2"}
        await client.put(f"{MANAGE}/{listing_id}", json=renamed)
        published = {**renamed, "status": "published"}
        await client.put(f"{MANAGE}/{listing_id}", json=published)
        moved = {
            **published,
            "starts_at": "2031-01-01T20:00:00Z",
            "ends_at": "2031-01-02T01:00:00Z",
        }
        await client.put(f"{MANAGE}/{listing_id}", json=moved)
        await client.put(
            f"{MANAGE}/{listing_id}", json={**moved, "status": "cancelled"}
        )
        await client.put(
            f"{MANAGE}/{listing_id}", json={**moved, "status": "cancelled"}
        )

        # Rejected saves leave no trace.
        assert (
            await client.put(f"{MANAGE}/{listing_id}", json={**moved, "tiers": []})
        ).status_code == 409

    rows = await _rows(events_db)
    assert [row.action for row in rows] == [
        "listing.created",
        "listing.updated",
        "listing.published",
        "listing.rescheduled",
        "listing.cancelled",
        "listing.updated",
    ]
    assert {row.actor_id for row in rows} == {organiser.id}
    renamed_row = rows[1]
    assert renamed_row.summary["changed"] == ["title"]
    assert renamed_row.summary["from"] == {"title": "Harbour Lights Fete"}
    assert renamed_row.summary["to"] == {"title": "Harbour Lights Fete 2"}
    assert rows[2].summary["to"] == {"status": "published"}


@pytest.mark.asyncio
async def test_history_endpoint_is_scoped_and_names_the_actor(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    other = await _organiser(events_db, db_async, slug="other-crew")
    async with events_db() as db:
        db.add(
            MemberProfile(
                user_id=organiser.id, handle="harbour", display_name="Harbour Host"
            )
        )
        await db.commit()
    async with client_with_real_roles(organiser) as client:
        body = _payload()
        listing_id = (await client.post(MANAGE, json=body)).json()["id"]
        await client.put(f"{MANAGE}/{listing_id}", json={**body, "title": "Renamed"})
        history = await client.get(f"{BASE}/manage/{listing_id}/activity")
        assert history.status_code == 200
        entries = history.json()
        assert [entry["action"] for entry in entries] == [
            "listing.updated",
            "listing.published",
        ]
        assert entries[0]["actor_name"] == "Harbour Host"
        assert entries[0]["actor_id"] == str(organiser.id)
        assert "email" not in str(entries)
        assert (
            await client.get(f"{BASE}/manage/{uuid.uuid4()}/activity")
        ).status_code == 404
    async with client_with_real_roles(other) as client:
        assert (
            await client.get(f"{BASE}/manage/{listing_id}/activity")
        ).status_code == 404


@pytest.mark.asyncio
async def test_history_needs_organiser_access(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    member = await user_with_role(db_async, "events-member")
    async with client_with_real_roles(member) as client:
        response = await client.get(f"{BASE}/manage/{uuid.uuid4()}/activity")
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_organiser_requests_and_reviews_are_recorded(
    events_db: SessionFactory, db_async: AsyncSession
):
    member = await user_with_role(db_async, None)
    async with client_with_real_roles(member) as client:
        created = (
            await client.post(f"{BASE}/manage/organiser", json={"name": "Island Beats"})
        ).json()
    moderator = await user_with_role(db_async, "events-moderator")
    url = f"{BASE}/moderation/organisers/{created['id']}"
    async with client_with_real_roles(moderator) as client:
        await client.patch(url, json={"verified": True})
        await client.patch(url, json={"verified": True})  # no change, no row
        await client.patch(url, json={"verified": False})
    rows = await _rows(events_db)
    assert [(row.action, row.actor_id) for row in rows] == [
        ("organiser.created", member.id),
        ("organiser.verified", moderator.id),
        ("organiser.unverified", moderator.id),
    ]
    assert {row.entity_id for row in rows} == {created["id"]}


@pytest.mark.asyncio
async def test_moderation_resolutions_are_recorded(
    events_db: SessionFactory, db_async: AsyncSession
):
    async with client_as(ALEX) as client:
        assert (
            await client.post(
                f"{BASE}/reports",
                json={"subject_type": "listing", "subject_id": "x", "reason": "Scam"},
            )
        ).status_code == 201
        assert (
            await client.post(
                f"{BASE}/suggestions",
                json={
                    "title": "Fish Friday",
                    "event_date": "2026-11-06",
                    "venue": "Gouyave",
                    "category": "food",
                    "parish": "st-john",
                },
            )
        ).status_code == 201
    moderator = await user_with_role(db_async, "events-moderator")
    async with client_with_real_roles(moderator) as client:
        report = (await client.get(f"{BASE}/moderation/reports")).json()[0]
        suggestion = (await client.get(f"{BASE}/moderation/suggestions")).json()[0]
        reviewed = await client.patch(
            f"{BASE}/moderation/reports/{report['id']}", json={"status": "actioned"}
        )
        assert reviewed.status_code == 200
        approved = await client.patch(
            f"{BASE}/moderation/suggestions/{suggestion['id']}",
            json={"status": "approved"},
        )
        assert approved.status_code == 200
    rows = await _rows(events_db)
    assert [(row.action, row.actor_id) for row in rows] == [
        ("report.actioned", moderator.id),
        ("suggestion.approved", moderator.id),
    ]
    assert "reason" not in str(rows[0].summary)


@pytest.mark.asyncio
async def test_rows_cannot_be_changed_or_deleted(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        assert (await client.post(MANAGE, json=_payload())).status_code == 201
    async with events_db() as db:
        with pytest.raises(DBAPIError, match="append-only"):
            await db.execute(text("UPDATE activity SET action = 'x'"))
        await db.rollback()
        with pytest.raises(DBAPIError, match="append-only"):
            await db.execute(text("DELETE FROM activity"))
        await db.rollback()
    assert len(await _rows(events_db)) == 1
