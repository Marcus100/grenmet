"""Barrels Events API against a disposable, migrated events database."""

from collections.abc import AsyncGenerator, Callable
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.auth.models import User
from src.events import dependencies as deps
from src.events import service
from src.events.models import (
    Group,
    GroupMember,
    Listing,
    Organiser,
    OrganiserMember,
    TicketTier,
)
from src.main import app
from src.utils.datetime import utc_now

ROOT = Path(__file__).resolve().parents[2]
BASE = "/api/v1/events"


def _user(first: str) -> User:
    return User(
        id=uuid4(),
        email=f"{first.lower()}@example.com",
        username=first.lower(),
        first_name=first,
        last_name="Tester",
        is_active=True,
        is_superuser=False,
    )


ALEX, DANA, KAYLA = _user("Alex"), _user("Dana"), _user("Kayla")


@pytest.fixture
async def events_db(
    fresh_weather_engine: Engine,
) -> AsyncGenerator[Callable[[], AsyncSession]]:
    with fresh_weather_engine.begin() as connection:
        config = Config(str(ROOT / "src/events/alembic.ini"))
        config.attributes["expected_database"] = fresh_weather_engine.url.database
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )

    def factory() -> AsyncSession:
        return AsyncSession(engine, expire_on_commit=False)

    async def session() -> AsyncGenerator[AsyncSession]:
        async with factory() as value:
            yield value

    app.dependency_overrides[deps.get_session] = session
    try:
        yield factory
    finally:
        for dependency in (
            deps.get_session,
            deps.require_member,
            deps.optional_member,
            deps.require_organiser,
            deps.require_moderator,
        ):
            app.dependency_overrides.pop(dependency, None)
        await engine.dispose()


def client_as(
    user: User | None, *, organiser: bool = False, moderator: bool = False
) -> httpx.AsyncClient:
    """Act as ``user`` (None = anonymous) with an Events app session."""

    def member() -> User:
        if user is None:
            from fastapi import HTTPException

            raise HTTPException(401, "Sign in again")
        return user

    app.dependency_overrides[deps.require_member] = member
    app.dependency_overrides[deps.optional_member] = lambda: user

    def not_organiser() -> User:
        from src.events.exceptions import EventsForbidden

        raise EventsForbidden("Organiser access is required")

    app.dependency_overrides[deps.require_organiser] = (
        (lambda: user) if organiser and user is not None else not_organiser
    )

    def not_moderator() -> User:
        from src.events.exceptions import EventsForbidden

        raise EventsForbidden("Moderator access is required")

    app.dependency_overrides[deps.require_moderator] = (
        (lambda: user) if moderator and user is not None else not_moderator
    )
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


async def _seed(factory: Callable[[], AsyncSession]) -> dict[str, UUID]:
    now = utc_now()
    async with factory() as db:
        organiser = Organiser(
            slug="spice-isle-tech", name="Spice Isle Tech", verified=True
        )
        group = Group(
            slug="anse-runners",
            name="Anse Runners",
            category="sport",
            parish="st-george",
        )
        db.add_all([organiser, group])
        await db.flush()
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=DANA.id))
        meetup = Listing(
            slug="tech-meetup",
            title="Tech meetup",
            summary="Talks and demos",
            category="tech",
            parish="st-george",
            venue="Port Louis",
            starts_at=now + timedelta(days=2),
            ends_at=now + timedelta(days=2, hours=2),
            admission="rsvp",
            organiser_id=organiser.id,
            status="published",
        )
        fete = Listing(
            slug="sunset-fete",
            title="Sunset fete",
            summary="Sunset all-inclusive",
            category="fete",
            parish="st-george",
            venue="Stadium",
            starts_at=now + timedelta(days=3),
            ends_at=now + timedelta(days=3, hours=6),
            admission="ticketed",
            capacity=500,
            organiser_id=organiser.id,
            status="published",
        )
        draft = Listing(
            slug="secret-draft",
            title="Secret draft",
            summary="Not yet public",
            category="music",
            parish="st-george",
            venue="Somewhere",
            starts_at=now + timedelta(days=4),
            ends_at=now + timedelta(days=4, hours=2),
            admission="free",
            organiser_id=organiser.id,
            status="draft",
        )
        db.add_all([meetup, fete, draft])
        await db.flush()
        db.add(
            TicketTier(
                listing_id=fete.id, name="General", price_minor=15000, allocation=400
            )
        )
        await db.commit()
        return {"organiser": organiser.id, "group": group.id}


async def _profiles(factory: Callable[[], AsyncSession], *users: User) -> None:
    async with factory() as db:
        for user in users:
            await service.get_or_create_profile(db, user)


@pytest.mark.asyncio
async def test_public_listings_hide_drafts_and_show_prices(events_db):
    await _seed(events_db)
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
    await _seed(events_db)
    async with client_as(None) as client:
        assert (
            await client.put(f"{BASE}/listings/tech-meetup/rsvp")
        ).status_code == 401


@pytest.mark.asyncio
async def test_rsvp_and_save_show_in_plans_and_going_list(events_db):
    await _seed(events_db)
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
    await _seed(events_db)
    await _profiles(events_db, ALEX, DANA, KAYLA)
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
    await _seed(events_db)
    await _profiles(events_db, ALEX, DANA)
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
    await _seed(events_db)
    await _profiles(events_db, ALEX, KAYLA)
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
    ids = await _seed(events_db)
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
    await _seed(events_db)
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
async def test_moderation_queues_need_the_moderator_permission(events_db):
    _ = events_db
    async with client_as(ALEX) as client:
        for path in ("moderation/reports", "moderation/suggestions"):
            assert (await client.get(f"{BASE}/{path}")).status_code == 403
        refused = await client.patch(
            f"{BASE}/moderation/reports/{uuid4()}", json={"status": "dismissed"}
        )
        assert refused.status_code == 403


@pytest.mark.asyncio
async def test_reports_are_queued_and_resolved_by_moderators(events_db):
    await _seed(events_db)
    await _profiles(events_db, ALEX, DANA)
    async with client_as(ALEX) as client:
        created = await client.post(
            f"{BASE}/reports",
            json={"subject_type": "profile", "subject_id": "dana", "reason": "Spam"},
        )
        assert created.status_code == 201, created.text
    async with client_as(KAYLA, moderator=True) as client:
        queue = (await client.get(f"{BASE}/moderation/reports")).json()
        assert len(queue) == 1
        report = queue[0]
        assert report["subject_id"] == "dana"
        assert report["status"] == "open"
        # Moderators see what was reported, never who reported it.
        assert "reporter_id" not in report
        reopen = await client.patch(
            f"{BASE}/moderation/reports/{report['id']}", json={"status": "open"}
        )
        assert reopen.status_code == 422
        resolved = await client.patch(
            f"{BASE}/moderation/reports/{report['id']}", json={"status": "dismissed"}
        )
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "dismissed"
        assert (await client.get(f"{BASE}/moderation/reports")).json() == []
        missing = await client.patch(
            f"{BASE}/moderation/reports/{uuid4()}", json={"status": "actioned"}
        )
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_suggestions_are_reviewed_by_moderators(events_db):
    _ = events_db
    async with client_as(None) as client:
        created = await client.post(
            f"{BASE}/suggestions",
            json={
                "title": "Fish Friday",
                "event_date": "2026-11-06",
                "venue": "Gouyave",
                "category": "food",
                "parish": "st-john",
            },
        )
        assert created.status_code == 201
    async with client_as(KAYLA, moderator=True) as client:
        queue = (await client.get(f"{BASE}/moderation/suggestions")).json()
        assert [row["title"] for row in queue] == ["Fish Friday"]
        approved = await client.patch(
            f"{BASE}/moderation/suggestions/{queue[0]['id']}",
            json={"status": "approved"},
        )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert (await client.get(f"{BASE}/moderation/suggestions")).json() == []
        missing = await client.patch(
            f"{BASE}/moderation/suggestions/{uuid4()}", json={"status": "rejected"}
        )
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_organisers_cannot_edit_another_organisers_listing(events_db):
    await _seed(events_db)
    async with events_db() as db:
        rival = Organiser(slug="harbour-co", name="Harbour Co")
        db.add(rival)
        await db.flush()
        db.add(OrganiserMember(organiser_id=rival.id, user_id=KAYLA.id))
        theirs = Listing(
            slug="harbour-night",
            title="Harbour night",
            summary="Boats and music",
            category="music",
            parish="st-george",
            venue="Carenage",
            starts_at=utc_now() + timedelta(days=5),
            ends_at=utc_now() + timedelta(days=5, hours=3),
            admission="free",
            organiser_id=rival.id,
            status="published",
        )
        db.add(theirs)
        await db.commit()
        theirs_id = theirs.id
    async with client_as(DANA, organiser=True) as client:
        hijack = await client.put(
            f"{BASE}/manage/listings/{theirs_id}",
            json=_listing_payload(title="Hijacked", status="cancelled"),
        )
        assert hijack.status_code == 404
    async with events_db() as db:
        row = await db.get(Listing, theirs_id)
        assert row is not None
        assert (row.title, row.status) == ("Harbour night", "published")


@pytest.mark.asyncio
async def test_listing_updates_validate_and_cancelling_unpublishes(events_db):
    await _seed(events_db)
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
        unpriced = await client.put(
            f"{BASE}/manage/listings/{listing_id}",
            json=_listing_payload(
                admission="ticketed",
                tiers=[{"name": "Free", "price_minor": 0, "allocation": 10}],
            ),
        )
        assert unpriced.status_code == 409
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
    await _seed(events_db)
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
