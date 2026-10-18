"""Shared helpers for the Events API tests (the fixture lives in conftest.py)."""

from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events import dependencies as deps
from src.events import service
from src.events.exceptions import EventsForbidden
from src.events.models import (
    Group,
    Listing,
    Organiser,
    OrganiserMember,
    TicketTier,
)
from src.main import app
from src.utils.datetime import utc_now

ROOT = Path(__file__).resolve().parents[2]
BASE = "/api/v1/events"

#: Every dependency an Events test may override; the fixture clears them all.
OVERRIDDEN = (
    deps.get_session,
    deps.require_member,
    deps.optional_member,
    deps.require_organiser,
    deps.organiser_scope,
    deps.require_moderator,
)

SessionFactory = Callable[[], AsyncSession]


def make_user(first: str) -> User:
    return User(
        id=uuid4(),
        email=f"{first.lower()}@example.com",
        username=first.lower(),
        first_name=first,
        last_name="Tester",
        is_active=True,
        is_superuser=False,
    )


ALEX, DANA, KAYLA = make_user("Alex"), make_user("Dana"), make_user("Kayla")


def _act_as(user: User | None) -> None:
    def member() -> User:
        if user is None:
            raise HTTPException(401, "Sign in again")
        return user

    app.dependency_overrides[deps.require_member] = member
    app.dependency_overrides[deps.optional_member] = lambda: user


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


def no_platform_scope() -> list[str]:
    return []


def client_as(user: User | None, *, organiser: bool = False) -> httpx.AsyncClient:
    """Act as ``user`` (None = anonymous) with an Events app session."""
    _act_as(user)

    def not_organiser() -> User:
        raise EventsForbidden("Organiser access is required")

    app.dependency_overrides[deps.require_organiser] = (
        (lambda: user) if organiser and user is not None else not_organiser
    )
    app.dependency_overrides[deps.organiser_scope] = no_platform_scope
    return _client()


def client_with_real_roles(user: User) -> httpx.AsyncClient:
    """Act as ``user`` but leave the organiser and moderator gates real.

    ``require_organiser`` / ``require_moderator`` then check permissions in the
    main auth database, so ``user`` must exist there with its roles assigned.
    """
    _act_as(user)
    app.dependency_overrides.pop(deps.require_organiser, None)
    app.dependency_overrides.pop(deps.organiser_scope, None)
    app.dependency_overrides.pop(deps.require_moderator, None)
    return _client()


async def seed(factory: SessionFactory) -> dict[str, UUID]:
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


async def profiles(factory: SessionFactory, *users: User) -> None:
    async with factory() as db:
        for user in users:
            await service.get_or_create_profile(db, user)


async def connect(a: User, b_handle: str, b: User) -> None:
    """``a`` requests ``b`` and ``b`` accepts, through the API."""
    async with client_as(a) as client:
        sent = await client.post(f"{BASE}/connections", json={"handle": b_handle})
        assert sent.status_code == 200, sent.text
    async with client_as(b) as client:
        network = (await client.get(f"{BASE}/me/network")).json()
        request = next(
            row for row in network["connections"] if row["state"] == "received"
        )
        accepted = await client.post(f"{BASE}/connections/{request['id']}/accept")
        assert accepted.status_code == 204
