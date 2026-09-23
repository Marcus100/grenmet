"""Exercise the existing observation contract against a disposable database."""

from collections.abc import AsyncGenerator
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister.dependencies import get_session
from src.main import app

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
async def register_client(
    fresh_weather_engine: Engine,
) -> AsyncGenerator[httpx.AsyncClient]:
    # Reuse the empty disposable-database fixture, installing only eRegister.
    config = Config(str(ROOT / "src/eregister/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )

    async def session() -> AsyncGenerator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as value:
            yield value

    user = User(
        id=uuid4(),
        email="observer@example.test",
        is_active=True,
        is_superuser=True,
        registration_pending=False,
    )
    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_browser_or_token_user] = lambda: user
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


async def test_observation_save_and_reopen_preserves_structured_values(
    register_client: httpx.AsyncClient,
) -> None:
    record = {
        "station_id": " 78958 ",
        "kind": "SYNOP",
        "observed_at": "2026-09-23T08:00:00-04:00",
        "issued_at": "2026-09-23T12:05:00Z",
        "body": {"workbook": {"air_temp": "28.5", "notes": "Test only"}},
        "bufr": {"status": "not_generated"},
        "iwxxm": None,
    }
    response = await register_client.post("/api/v1/eregister/observations", json=record)
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["station_id"] == "78958"
    assert saved["body"] == record["body"]
    assert saved["bufr"] == record["bufr"]
    assert saved["iwxxm"] is None
    assert saved["observed_at"] == "2026-09-23T12:00:00Z"
    assert saved["state"] == "draft"
    reopened = await register_client.get(
        "/api/v1/eregister/observations", params={"station_id": "78958"}
    )
    assert reopened.status_code == 200
    assert reopened.json()["observations"] == [saved]
    assert "no-store" in reopened.headers["cache-control"]


async def test_anonymous_observation_write_is_denied(
    register_client: httpx.AsyncClient,
) -> None:
    app.dependency_overrides.pop(get_browser_or_token_user)
    response = await register_client.post(
        "/api/v1/eregister/observations",
        json={
            "station_id": "78958",
            "kind": "SYNOP",
            "observed_at": "2026-09-23T12:00:00Z",
        },
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "changes",
    [
        {"station_id": "   "},
        {"observed_at": "2026-09-23T12:00:00"},
        {"issued_at": "2026-09-23T12:00:00"},
        {"unknown_field": "typo"},
    ],
)
async def test_invalid_observation_is_not_persisted(
    register_client: httpx.AsyncClient, changes: dict
) -> None:
    response = await register_client.post(
        "/api/v1/eregister/observations",
        json={
            "station_id": "78958",
            "kind": "SYNOP",
            "observed_at": "2026-09-23T12:00:00Z",
            **changes,
        },
    )
    assert response.status_code == 422, response.text
    records = await register_client.get("/api/v1/eregister/observations")
    assert records.json()["observations"] == []
