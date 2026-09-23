"""Janitorial catalogue API against a disposable, migrated database."""

from collections.abc import AsyncGenerator, Callable
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.janitorial import database
from src.janitorial.router import get_session
from src.main import app

ROOT = Path(__file__).resolve().parents[2]
SPEC = "/api/v1/janitorial/spec"

SEED = """
INSERT INTO buildings (id, name, code, sort_order) VALUES
  (1, 'Terminal', 'T', 1), (2, 'Hangar', 'H', 2);
INSERT INTO sections (id, building_id, name, sort_order) VALUES
  (10, 1, 'Arrivals', 1);
INSERT INTO areas (id, building_id, section_id, name, sort_order) VALUES
  (100, 1, NULL, 'Lobby', 1),
  (101, 1, 10, 'Baggage hall', 2);
INSERT INTO activities (id, slug, name) VALUES
  (1, 'mop', 'Mop floor'), (2, 'bins', 'Empty bins');
INSERT INTO area_tasks (area_id, activity_id, freq_count, freq_period_value,
                        freq_period_unit, mode, sort_order) VALUES
  (101, 1, 2, 1, 'day', 'routine', 1);
INSERT INTO task_bundles (id, slug, name) VALUES (5, 'restroom', 'Restroom set');
INSERT INTO task_bundle_items (bundle_id, activity_id, freq_count,
                               freq_period_value, freq_period_unit, sort_order) VALUES
  (5, 2, 1, 30, 'minute', 1);
INSERT INTO area_bundle_refs (area_id, bundle_id, sort_order) VALUES (100, 5, 1);
"""


def _migrate(engine: Engine) -> None:
    config = Config(str(ROOT / "src/janitorial/alembic.ini"))
    config.attributes["expected_database"] = engine.url.database
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def _staff() -> User:
    return User(
        id=uuid4(),
        email="cleaner@example.test",
        is_active=True,
        is_superuser=False,
        registration_pending=False,
    )


@pytest.fixture
async def janitorial_client(
    fresh_weather_engine: Engine,
) -> AsyncGenerator[Callable[..., httpx.AsyncClient]]:
    _migrate(fresh_weather_engine)
    with fresh_weather_engine.begin() as connection:
        connection.execute(text(SEED))
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )

    async def session() -> AsyncGenerator[AsyncSession]:
        async with AsyncSession(engine) as value:
            yield value

    app.dependency_overrides[get_session] = session

    def client(*, signed_in: bool = True) -> httpx.AsyncClient:
        if signed_in:
            app.dependency_overrides[get_browser_or_token_user] = _staff
        else:
            app.dependency_overrides.pop(get_browser_or_token_user, None)
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


async def test_spec_requires_a_signed_in_user(
    janitorial_client: Callable[..., httpx.AsyncClient],
) -> None:
    async with janitorial_client(signed_in=False) as client:
        response = await client.get(SPEC)
    assert response.status_code == 401


async def test_spec_nests_sections_areas_tasks_and_bundles(
    janitorial_client: Callable[..., httpx.AsyncClient],
) -> None:
    async with janitorial_client() as client:
        response = await client.get(SPEC)
    assert response.status_code == 200
    terminal, hangar = response.json()

    # A building with no sections or areas still appears, with one empty group.
    assert hangar == {
        "id": 2,
        "name": "Hangar",
        "sections": [{"id": None, "name": None, "areas": []}],
    }

    # Areas without a section are grouped first; sectioned areas follow.
    unsectioned, arrivals = terminal["sections"]
    assert unsectioned["id"] is None
    lobby = unsectioned["areas"][0]
    assert lobby["name"] == "Lobby"
    assert lobby["tasks"] == []
    assert lobby["bundles"] == [
        {
            "id": 5,
            "name": "Restroom set",
            "items": [
                {
                    "activity": "Empty bins",
                    "frequency": {
                        "count": 1,
                        "periodValue": 30,
                        "periodUnit": "minute",
                    },
                }
            ],
        }
    ]

    assert arrivals["name"] == "Arrivals"
    baggage = arrivals["areas"][0]
    assert baggage["bundles"] == []
    assert baggage["tasks"][0]["activity"] == "Mop floor"
    assert baggage["tasks"][0]["mode"] == "routine"
    assert baggage["tasks"][0]["frequency"] == {
        "count": 2,
        "periodValue": 1,
        "periodUnit": "day",
    }


async def test_spec_is_unavailable_without_a_configured_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(database, "create_session", lambda: None)
    app.dependency_overrides[get_browser_or_token_user] = _staff
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(SPEC)
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)
    assert response.status_code == 503
    assert response.json()["detail"] == "Janitorial catalogue is unavailable"
