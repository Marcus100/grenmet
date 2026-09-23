"""Staff transport timetable API against a disposable, migrated database."""

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
from src.main import app
from src.transport import database
from src.transport.router import get_session

ROOT = Path(__file__).resolve().parents[2]
SPEC = "/api/v1/transport/spec"

SEED = """
INSERT INTO routes (id, number, name, sort_order) VALUES
  (1, 1, 'St George''s', 1), (2, 2, 'Grenville', 2);
INSERT INTO shifts (id, slug, name, start_time, end_time, sort_order) VALUES
  (1, 'early', 'Early', '05:00', '13:00', 1),
  (2, 'late', 'Late', '13:00', '21:00', 2);
INSERT INTO stops (id, slug, name, sort_order) VALUES
  (1, 'airport', 'Airport', 1), (2, 'market', 'Market Square', 2);
INSERT INTO trips (id, route_id, shift_id, direction, day_type,
                   depart_time, arrive_time, sort_order) VALUES
  (10, 1, 1, 'inbound', 'daily', '04:15', '04:50', 1),
  (11, 1, 1, 'outbound', 'mon_sat', '13:10', NULL, 2);
INSERT INTO trip_stops (trip_id, stop_id, group_time, sort_order) VALUES
  (10, 2, '04:15', 1), (10, 1, NULL, 2);
"""


def _migrate(engine: Engine) -> None:
    config = Config(str(ROOT / "src/transport/alembic.ini"))
    config.attributes["expected_database"] = engine.url.database
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def _staff() -> User:
    return User(
        id=uuid4(),
        email="rider@example.test",
        is_active=True,
        is_superuser=False,
        registration_pending=False,
    )


@pytest.fixture
async def transport_client(
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
    transport_client: Callable[..., httpx.AsyncClient],
) -> None:
    async with transport_client(signed_in=False) as client:
        response = await client.get(SPEC)
    assert response.status_code == 401


async def test_spec_groups_trips_by_route_and_shift(
    transport_client: Callable[..., httpx.AsyncClient],
) -> None:
    async with transport_client() as client:
        response = await client.get(SPEC)
    assert response.status_code == 200
    first, second = response.json()

    # A route with no trips is listed, but only shifts that have trips appear.
    assert second == {"id": 2, "number": 2, "name": "Grenville", "shifts": []}
    assert [shift["name"] for shift in first["shifts"]] == ["Early"]

    early = first["shifts"][0]
    assert early["startTime"] == "05:00:00"
    assert early["endTime"] == "13:00:00"
    inbound, outbound = early["trips"]
    assert inbound == {
        "id": 10,
        "direction": "inbound",
        "dayType": "daily",
        "departTime": "04:15:00",
        "arriveTime": "04:50:00",
        "stops": [
            {
                "id": inbound["stops"][0]["id"],
                "name": "Market Square",
                "groupTime": "04:15:00",
            },
            {"id": inbound["stops"][1]["id"], "name": "Airport", "groupTime": None},
        ],
    }
    assert outbound["dayType"] == "mon_sat"
    assert outbound["arriveTime"] is None
    assert outbound["stops"] == []


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
    assert response.json()["detail"] == "Transport timetable is unavailable"


def test_stop_spelling_migration_corrects_names_and_slugs(
    fresh_weather_engine: Engine,
) -> None:
    config = Config(str(ROOT / "src/transport/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "transport_0001")
        connection.execute(
            text(
                "INSERT INTO stops (slug, name) VALUES "
                "('predmotempts', 'Predmotempts'), ('vincennse', 'Vincennse'), "
                "('winsor-forest', 'Winsor Forest'), ('mt-kuma', 'Mt. Kuma'), "
                "('laura', 'Laura')"
            )
        )
        command.upgrade(config, "transport_0002")
        rows = dict(
            connection.execute(text("SELECT slug, name FROM stops")).tuples().all()
        )
    assert rows == {
        "perdmontemps": "Perdmontemps",
        "vincennes": "Vincennes",
        "windsor-forest": "Windsor Forest",
        "mt-cuma": "Mt. Cuma",
        "laura": "Laura",
    }
