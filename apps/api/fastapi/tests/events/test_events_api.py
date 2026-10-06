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


def client_as(user: User | None, *, organiser: bool = False) -> httpx.AsyncClient:
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


def test_weekend_window_uses_grenada_dates():
    # Saturday 3 Oct 2026, 23:30 in Grenada = Sunday 03:30 UTC.
    start, end = service.when_window("weekend", datetime(2026, 10, 4, 3, 30))
    assert start == datetime(2026, 10, 3, 4, 0)  # Saturday 00:00 Grenada
    assert end == datetime(2026, 10, 5, 4, 0)  # Monday 00:00 Grenada
    wed_start, wed_end = service.when_window("weekend", datetime(2026, 9, 30, 12, 0))
    assert wed_start == datetime(2026, 10, 2, 4, 0)
    assert wed_end == datetime(2026, 10, 5, 4, 0)
