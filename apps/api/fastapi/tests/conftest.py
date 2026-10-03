# Imports below the DB-isolation bootstrap are intentionally not at the top of
# the file (env must be set before any `src` import), so E402 is disabled here.
# ruff: noqa: E402
import os
from collections.abc import AsyncGenerator, Generator
from datetime import timedelta
from uuid import uuid4

# --- Test database isolation -------------------------------------------------
# Every test truncates all application tables between runs, so the suite MUST
# NOT point at the development database. Force a dedicated database per run and worker
# BEFORE any `src` module is imported (settings are read at import time), then
# create and migrate it on demand. This makes it impossible for a stray
# `POSTGRES_SERVER=localhost` run to wipe dev data.
os.environ.setdefault("POSTGRES_SERVER", "localhost")

# --- Password hashing cost ---------------------------------------------------
# Fixtures create and authenticate users on almost every test, so the suite runs
# several bcrypt hash/verify pairs per test. At the production cost factor (12)
# each pair costs ~440ms, which was ~90% of total suite runtime. Cost 4 is
# ~1.8ms and exercises identical code paths. AuthConfig refuses a cost below 12
# outside ENVIRONMENT=local, so this can never weaken a deployed environment.
os.environ.setdefault("BCRYPT_ROUNDS", "4")

# Set the run ID before xdist launches workers; workers inherit it and the base.
from tests.database_target import (
    configure_database,
    require_owned_database,
    template_target,
)

configure_database(os.environ)


def _bootstrap_test_database() -> None:
    import psycopg
    from psycopg.conninfo import make_conninfo

    from src.config import settings

    target = settings.POSTGRES_DB
    template = template_target(
        os.environ["VERIFY_DB_BASE"], os.environ["VERIFY_RUN_ID"]
    )
    require_owned_database(target, os.environ)
    admin_dsn = make_conninfo(
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        dbname="postgres",
    )
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(hashtext(%s))", (template,))
        try:
            template_exists = conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (template,)
            ).fetchone()
            if not template_exists:
                target_exists = conn.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s", (target,)
                ).fetchone()
                if not target_exists:
                    conn.execute(
                        psycopg.sql.SQL("CREATE DATABASE {}").format(
                            psycopg.sql.Identifier(target)
                        )
                    )

                from alembic.config import Config

                from alembic import command

                command.upgrade(Config("alembic.ini"), "head")

                from sqlalchemy.orm import Session

                from src.database import engine, init_db

                with Session(engine) as session:
                    init_db(session)
                engine.dispose()
                conn.execute(
                    psycopg.sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(
                        psycopg.sql.Identifier(template),
                        psycopg.sql.Identifier(target),
                    )
                )

            target_exists = conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (target,)
            ).fetchone()
            if not target_exists:
                conn.execute(
                    psycopg.sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(
                        psycopg.sql.Identifier(target),
                        psycopg.sql.Identifier(template),
                    )
                )
        finally:
            conn.execute("SELECT pg_advisory_unlock(hashtext(%s))", (template,))


_test_database_bootstrapped = False

import httpx
import pytest
from sqlalchemy.engine import URL, Engine
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.config import auth_settings
from src.auth.schemas import UserCreate
from src.auth.utils import create_access_token
from src.config import settings
from src.database import (
    async_session_factory,
    init_db_async,
)
from src.email_config import email_settings
from src.main import app
from src.orm import Base
from src.rate_limit import limiter
from tests.utils.utils import random_lower_string


@pytest.fixture(scope="session")
def weather_template() -> Generator[URL]:
    """Migrate one wxproducts template for per-test database clones."""
    import psycopg
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url

    from tests.wxproducts.test_migrations import migrate

    base_url = make_url(str(settings.SQLALCHEMY_DATABASE_URI))
    admin_url = base_url.set(database="postgres", drivername="postgresql")
    worker = os.environ.get("PYTEST_XDIST_WORKER", "master")
    name = f"weather_template_{os.environ['VERIFY_RUN_ID']}_{worker}"
    with psycopg.connect(
        admin_url.render_as_string(hide_password=False), autocommit=True
    ) as admin:
        admin.execute(
            psycopg.sql.SQL("CREATE DATABASE {} ").format(psycopg.sql.Identifier(name))
        )
    engine = create_engine(base_url.set(database=name))
    try:
        migrate(engine)
        engine.dispose()
        yield base_url.set(database=name)
    finally:
        engine.dispose()
        with psycopg.connect(
            admin_url.render_as_string(hide_password=False), autocommit=True
        ) as admin:
            admin.execute(
                psycopg.sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    psycopg.sql.Identifier(name)
                )
            )


@pytest.fixture
def fresh_weather_engine() -> Generator[Engine]:
    """Provide an empty wxproducts database for migration bootstrap tests."""
    import psycopg
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url

    base_url = make_url(str(settings.SQLALCHEMY_DATABASE_URI))
    admin_url = base_url.set(database="postgres", drivername="postgresql")
    name = f"weather_test_{uuid4().hex}"
    with psycopg.connect(
        admin_url.render_as_string(hide_password=False), autocommit=True
    ) as admin:
        admin.execute(
            psycopg.sql.SQL("CREATE DATABASE {} ").format(psycopg.sql.Identifier(name))
        )
    engine = create_engine(base_url.set(database=name))
    try:
        yield engine
    finally:
        engine.dispose()
        with psycopg.connect(
            admin_url.render_as_string(hide_password=False), autocommit=True
        ) as admin:
            admin.execute(
                psycopg.sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    psycopg.sql.Identifier(name)
                )
            )


@pytest.fixture
def weather_engine(request: pytest.FixtureRequest) -> Generator[Engine]:
    """Provide an isolated weather database with the schema each domain needs."""
    import psycopg
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url

    base_url = make_url(str(settings.SQLALCHEMY_DATABASE_URI))
    admin_url = base_url.set(database="postgres", drivername="postgresql")
    name = f"weather_test_{uuid4().hex}"
    template: str | None = None
    if "wxproducts" in str(request.path):
        template = request.getfixturevalue("weather_template").database
    with psycopg.connect(
        admin_url.render_as_string(hide_password=False), autocommit=True
    ) as admin:
        if template:
            admin.execute(
                psycopg.sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(
                    psycopg.sql.Identifier(name), psycopg.sql.Identifier(template)
                )
            )
        else:
            admin.execute(
                psycopg.sql.SQL("CREATE DATABASE {}").format(
                    psycopg.sql.Identifier(name)
                )
            )
    engine = create_engine(base_url.set(database=name))
    try:
        yield engine
    finally:
        engine.dispose()
        with psycopg.connect(
            admin_url.render_as_string(hide_password=False), autocommit=True
        ) as admin:
            admin.execute(
                psycopg.sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    psycopg.sql.Identifier(name)
                )
            )


async def _clear_database_async(session: AsyncSession) -> None:
    """Clear app tables in dependency order so FK constraints are respected."""
    await session.rollback()
    for table in reversed(Base.metadata.sorted_tables):
        await session.execute(table.delete())
    await session.commit()


def _cleanup_test_database() -> None:
    if not _test_database_bootstrapped:
        return

    import psycopg
    from psycopg.conninfo import make_conninfo

    target = settings.POSTGRES_DB
    require_owned_database(target, os.environ)
    dsn = make_conninfo(
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        dbname="postgres",
    )
    with psycopg.connect(dsn, autocommit=True) as connection:
        connection.execute(
            psycopg.sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                psycopg.sql.Identifier(target)
            )
        )
        template = template_target(
            os.environ["VERIFY_DB_BASE"], os.environ["VERIFY_RUN_ID"]
        )
        if os.environ.get("PYTEST_XDIST_WORKER") in {None, "gw0"}:
            connection.execute(
                psycopg.sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                    psycopg.sql.Identifier(template)
                )
            )


@pytest.fixture(scope="session")
def test_database() -> Generator[None]:
    """Lazily create the application test database for integration tests."""
    global _test_database_bootstrapped
    _bootstrap_test_database()
    _test_database_bootstrapped = True
    try:
        yield
    finally:
        _cleanup_test_database()


@pytest.fixture(scope="session", autouse=True)
def disable_rate_limiting() -> Generator[None]:
    """Disable rate limiting during tests to prevent 429 errors from rapid login calls."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
async def db_async(test_database: None) -> AsyncGenerator[AsyncSession]:
    """Async database session. Ensures superuser exists; cleans up users on teardown."""
    assert test_database is None
    async with async_session_factory() as session:
        await _clear_database_async(session)
        await init_db_async(session)
        yield session
        await _clear_database_async(session)


@pytest.fixture
async def async_client(test_database: None) -> AsyncGenerator[httpx.AsyncClient]:
    """Preferred client for new tests: async HTTP client with ASGI transport (avoids event loop issues)."""
    assert test_database is None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Classify tests by whether they request the real application database."""
    integration_fixtures = {
        "async_client",
        "db_async",
        "test_database",
        "weather_engine",
        "fresh_weather_engine",
        "image_database",
        "profile_session",
    }
    for item in items:
        marker = (
            "integration"
            if integration_fixtures.intersection(item.fixturenames)
            else "unit"
        )
        item.add_marker(marker)


@pytest.fixture
async def superuser_token_headers_async(
    db_async: AsyncSession,
) -> dict[str, str]:
    """Mint a superuser JWT without exercising the login endpoint per test."""
    user = await auth_service.get_user_by_email(
        session=db_async, email=str(settings.FIRST_SUPERUSER)
    )
    if user is None or user.id is None:
        raise RuntimeError("Test template did not contain the superuser")
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def normal_user_token_headers_async(
    db_async: AsyncSession,
) -> dict[str, str]:
    """Create the test user if needed, then mint a JWT without HTTP/bcrypt."""
    user = await auth_service.get_user_by_email(
        session=db_async, email=email_settings.EMAIL_TEST_USER
    )
    if user is None:
        user = await auth_service.create_user(
            session=db_async,
            user_create=UserCreate(
                email=email_settings.EMAIL_TEST_USER,
                username=email_settings.EMAIL_TEST_USER.split("@")[0],
                password=random_lower_string(),
                first_name="Test",
                last_name="User",
            ),
        )
    if user.id is None:
        raise RuntimeError("Test user has no ID")
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"Authorization": f"Bearer {token}"}
