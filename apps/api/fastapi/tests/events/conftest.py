"""Disposable, migrated Events database shared by every Events test."""

from collections.abc import AsyncGenerator

import pytest
from alembic.config import Config
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.events import dependencies as deps
from src.main import app
from tests.events.support import OVERRIDDEN, ROOT, SessionFactory


@pytest.fixture
async def events_db(fresh_weather_engine: Engine) -> AsyncGenerator[SessionFactory]:
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
        for dependency in OVERRIDDEN:
            app.dependency_overrides.pop(dependency, None)
        await engine.dispose()
