# Imports below the DB-isolation bootstrap are intentionally not at the top of
# the file (env must be set before any `src` import), so E402 is disabled here.
# ruff: noqa: E402
import os
from collections.abc import AsyncGenerator, Generator

# --- Test database isolation -------------------------------------------------
# Every test truncates all application tables between runs, so the suite MUST
# NOT point at the development database. Force a dedicated "<db>_test" database
# BEFORE any `src` module is imported (settings are read at import time), then
# create and migrate it on demand. This makes it impossible for a stray
# `POSTGRES_SERVER=localhost` run to wipe dev data.
os.environ.setdefault("POSTGRES_SERVER", "localhost")
_base_db = os.environ.get("POSTGRES_DB") or "app"
if not _base_db.endswith("_test"):
    os.environ["POSTGRES_DB"] = f"{_base_db}_test"


def _bootstrap_test_database() -> None:
    import psycopg

    from src.config import settings

    target = settings.POSTGRES_DB
    if not target.endswith("_test"):  # hard safety net — never migrate a dev DB
        raise RuntimeError(
            f"Refusing to run tests against non-test database {target!r}"
        )
    admin_dsn = (
        f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/postgres"
    )
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (target,)
        ).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{target}"')

    from alembic.config import Config

    from alembic import command

    command.upgrade(Config("alembic.ini"), "head")


_bootstrap_test_database()

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session, SQLModel

from src.database import (
    async_session_factory,
    engine,
    init_db,
    init_db_async,
)
from src.email_config import email_settings
from src.main import app
from src.rate_limit import limiter
from tests.utils.user import (
    authentication_token_from_email,
    authentication_token_from_email_async,
)
from tests.utils.utils import (
    get_superuser_token_headers,
    get_superuser_token_headers_async,
)


def _clear_database(session: Session) -> None:
    """Clear app tables in dependency order so FK constraints are respected."""
    session.rollback()
    for table in reversed(SQLModel.metadata.sorted_tables):
        session.execute(table.delete())
    session.commit()


async def _clear_database_async(session: AsyncSession) -> None:
    """Clear app tables in dependency order so FK constraints are respected."""
    await session.rollback()
    for table in reversed(SQLModel.metadata.sorted_tables):
        await session.execute(table.delete())
    await session.commit()


@pytest.fixture(scope="session", autouse=True)
def disable_rate_limiting() -> Generator[None, None, None]:
    """Disable rate limiting during tests to prevent 429 errors from rapid login calls."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    """Sync database session (legacy). Prefer async db_async for new tests."""
    with Session(engine) as session:
        _clear_database(session)
        init_db(session)
        yield session
        _clear_database(session)


@pytest.fixture
async def db_async() -> AsyncGenerator[AsyncSession, None]:
    """Async database session. Ensures superuser exists; cleans up users on teardown."""
    async with async_session_factory() as session:
        await _clear_database_async(session)
        await init_db_async(session)
        yield session
        await _clear_database_async(session)


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    """Synchronous FastAPI test client. Prefer async_client for new tests (async routes and DB)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
async def async_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Preferred client for new tests: async HTTP client with ASGI transport (avoids event loop issues)."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    """Sync: superuser headers (legacy). Prefer superuser_token_headers_async."""
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    """Sync: normal user headers (legacy). Prefer normal_user_token_headers_async."""
    return authentication_token_from_email(
        client=client, email=email_settings.EMAIL_TEST_USER, db=db
    )


@pytest.fixture
async def superuser_token_headers_async(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> dict[str, str]:
    """Get superuser authentication headers (async)."""
    _ = db_async
    return await get_superuser_token_headers_async(async_client)


@pytest.fixture
async def normal_user_token_headers_async(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> dict[str, str]:
    """Get normal user authentication headers (async)."""
    return await authentication_token_from_email_async(
        client=async_client,
        email=email_settings.EMAIL_TEST_USER,
        db=db_async,
    )
