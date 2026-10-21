"""Events tests run on the main test database (the ``events`` schema, ADR-0003)."""

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory
from src.events import dependencies as deps
from src.main import app
from tests.events.support import OVERRIDDEN, SessionFactory


@pytest.fixture
async def events_db(db_async: AsyncSession) -> AsyncGenerator[SessionFactory]:
    """A factory for sessions on the cleaned main database; the Events session
    dependency is overridden so each request gets a fresh one."""
    assert db_async is not None

    def factory() -> AsyncSession:
        return async_session_factory()

    async def session() -> AsyncGenerator[AsyncSession]:
        async with factory() as value:
            yield value

    app.dependency_overrides[deps.get_session] = session
    try:
        yield factory
    finally:
        for dependency in OVERRIDDEN:
            app.dependency_overrides.pop(dependency, None)
