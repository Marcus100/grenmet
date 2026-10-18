"""Organiser workspace behind the real ``events.organiser.manage`` check."""

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events.models import Listing, Organiser, OrganiserMember
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
    seed,
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
        "admission": "ticketed",
        "capacity": 300,
        "status": "published",
        "tiers": [{"name": "General", "price_minor": 8000, "allocation": 250}],
    }
    body.update(changes)
    return body


async def _organiser(
    factory: SessionFactory, db_async: AsyncSession, slug: str = "harbour-crew"
) -> User:
    """A real ``events-organiser`` user who is a member of organiser ``slug``."""
    user = await user_with_role(db_async, "events-organiser")
    async with factory() as db:
        organiser = Organiser(
            slug=slug, name=slug.replace("-", " ").title(), verified=True
        )
        db.add(organiser)
        await db.flush()
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=user.id))
        await db.commit()
    return user


@pytest.mark.asyncio
async def test_managing_needs_the_permission_and_an_organiser_membership(
    events_db: SessionFactory, db_async: AsyncSession
):
    member = await user_with_role(db_async, "events-member")
    async with client_with_real_roles(member) as client:
        assert (await client.get(f"{BASE}/manage")).status_code == 403
        assert (await client.post(MANAGE, json=_payload())).status_code == 403
    unattached = await user_with_role(db_async, "events-organiser")
    async with client_with_real_roles(unattached) as client:
        response = await client.post(MANAGE, json=_payload())
        assert response.status_code == 403
        assert "not a member of an organiser" in response.text
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        assert (await client.post(MANAGE, json=_payload())).status_code == 201


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        (
            {"ends_at": "2030-01-01T10:00:00Z", "starts_at": "2030-01-01T10:00:00Z"},
            "End time must be after the start time",
        ),
        ({"tiers": []}, "Ticketed events need at least one priced tier"),
        (
            {"tiers": [{"name": "Free", "price_minor": 0, "allocation": 10}]},
            "Ticketed events need at least one priced tier",
        ),
        ({"capacity": 100}, "Tier allocations exceed capacity"),
    ],
)
async def test_invalid_listings_are_rejected(
    events_db: SessionFactory, db_async: AsyncSession, changes, detail
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        response = await client.post(MANAGE, json=_payload(**changes))
        assert response.status_code == 409
        assert detail in response.text
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Listing)) == 0


@pytest.mark.asyncio
async def test_slugs_stay_unique_when_titles_collide(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        first = (await client.post(MANAGE, json=_payload())).json()["slug"]
        second = (await client.post(MANAGE, json=_payload())).json()["slug"]
    assert first == "harbour-lights-fete"
    assert second.startswith("harbour-lights-fete-") and second != first


@pytest.mark.asyncio
async def test_organisers_cannot_edit_another_organisers_listing(
    events_db: SessionFactory, db_async: AsyncSession
):
    await seed(events_db)  # Spice Isle Tech owns tech-meetup
    async with events_db() as db:
        theirs = await db.scalar(
            select(Listing.id).where(Listing.slug == "tech-meetup")
        )
    assert theirs is not None
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        response = await client.put(f"{MANAGE}/{theirs}", json=_payload())
        assert response.status_code == 404
    async with client_as(None) as client:
        detail = (await client.get(f"{BASE}/listings/tech-meetup")).json()
        assert detail["title"] == "Tech meetup"


@pytest.mark.asyncio
async def test_status_and_visibility_changes_control_public_access(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        created = (await client.post(MANAGE, json=_payload(status="draft"))).json()
    path = f"{BASE}/listings/{created['slug']}"

    async def public_view() -> tuple[int, list[str]]:
        async with client_as(None) as client:
            status = (await client.get(path)).status_code
            slugs = [
                row["slug"]
                for row in (await client.get(f"{BASE}/listings")).json()["data"]
            ]
        return status, slugs

    assert await public_view() == (404, [])

    async with client_with_real_roles(organiser) as client:
        await client.put(f"{MANAGE}/{created['id']}", json=_payload(status="published"))
    assert await public_view() == (200, [created["slug"]])

    async with client_with_real_roles(organiser) as client:
        updated = await client.put(
            f"{MANAGE}/{created['id']}",
            json=_payload(visibility="unlisted", admission="free"),
        )
        assert updated.json()["tiers"] == []  # tiers only apply to ticketed events
    assert await public_view() == (200, [])  # opens by slug, never listed


@pytest.mark.asyncio
async def test_only_verified_organisers_can_publish(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await user_with_role(db_async, "events-organiser")
    async with events_db() as db:
        organiser = Organiser(slug="new-crew", name="New Crew")
        db.add(organiser)
        await db.flush()
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=user.id))
        await db.commit()
    async with client_with_real_roles(user) as client:
        refused = await client.post(MANAGE, json=_payload())
        assert refused.status_code == 403
        assert "Only verified organisers can publish" in refused.text
        draft = await client.post(MANAGE, json=_payload(status="draft"))
        assert draft.status_code == 201
        listing_id = draft.json()["id"]
        refused = await client.put(f"{MANAGE}/{listing_id}", json=_payload())
        assert refused.status_code == 403
        # Drafts stay editable, and nothing went public.
        assert (
            await client.put(f"{MANAGE}/{listing_id}", json=_payload(status="draft"))
        ).status_code == 200
    async with events_db() as db:
        row = await db.scalar(select(Organiser))
        assert row is not None
        row.verified = True
        await db.commit()
    async with client_with_real_roles(user) as client:
        done = await client.put(f"{MANAGE}/{listing_id}", json=_payload())
        assert done.status_code == 200
        assert done.json()["status"] == "published"
