# Imports below the DB-isolation bootstrap are intentionally not at the top of
# the file (env must be set before any `src` import), so E402 is disabled here.
# ruff: noqa: E402
import os
import smtplib
import sys
from collections.abc import AsyncGenerator, Awaitable, Callable, Generator
from datetime import timedelta
from typing import TYPE_CHECKING, Protocol, TypedDict
from uuid import uuid4

if TYPE_CHECKING:
    from tests.bookings.memory_code_store import MemoryCodeStore

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

from tests.sharding import parse_shard, shard_of


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
import resend
from sqlalchemy import text
from sqlalchemy.engine import URL, Engine
from sqlalchemy.ext.asyncio import AsyncSession

from src import email as email_module
from src.auth import service as auth_service
from src.auth.config import auth_settings
from src.auth.models import User
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
    # The rewards ledger refuses DELETE by trigger; test cleanup lifts it inside
    # this one transaction (DDL is transactional) and restores it before commit.
    ledger = "rewards.entry"
    await session.execute(
        text(f"ALTER TABLE {ledger} DISABLE TRIGGER entry_append_only")
    )
    payments_ledger = "payments.ledger_entry"
    await session.execute(
        text(f"ALTER TABLE {payments_ledger} DISABLE TRIGGER ledger_entry_append_only")
    )
    events_activity = "events.activity"
    await session.execute(
        text(f"ALTER TABLE {events_activity} DISABLE TRIGGER activity_append_only")
    )
    for table in reversed(Base.metadata.sorted_tables):
        await session.execute(table.delete())
    await session.execute(
        text(f"ALTER TABLE {ledger} ENABLE TRIGGER entry_append_only")
    )
    await session.execute(
        text(f"ALTER TABLE {payments_ledger} ENABLE TRIGGER ledger_entry_append_only")
    )
    await session.execute(
        text(f"ALTER TABLE {events_activity} ENABLE TRIGGER activity_append_only")
    )
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
def mfa_admin(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> Callable[[], Awaitable[tuple[User, dict[str, str]]]]:
    """Factory for a superuser with an enrolled authenticator and an MFA-verified
    session: ``user, headers = await mfa_admin()``."""
    from cryptography.fernet import Fernet

    from src.auth import totp
    from src.utils.datetime import utc_now
    from tests.factories import make_user

    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )

    async def make() -> tuple[User, dict[str, str]]:
        admin = await make_user(db_async, superuser=True)
        admin.totp_secret = totp.encrypt_secret(totp.generate_secret())
        admin.totp_enabled = True
        await db_async.commit()
        stored, _ = await auth_service.create_session(
            session=db_async,
            user=admin,
            app_name=None,
            enforce_approval=False,
            mfa_verified_at=utc_now(),
        )
        token, _ = auth_service.issue_access_token_for_user(
            user=admin, db_session=stored
        )
        return admin, {"Authorization": f"Bearer {token}"}

    return make


@pytest.fixture
async def async_client(test_database: None) -> AsyncGenerator[httpx.AsyncClient]:
    """Preferred client for new tests: async HTTP client with ASGI transport (avoids event loop issues)."""
    assert test_database is None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--shard",
        default=None,
        metavar="INDEX/TOTAL",
        help="Run one of TOTAL balanced, file-aligned slices of the selected tests (1-based).",
    )


class _ShardSelector:
    """Deselects tests outside this shard, after ``-m`` and other filters ran."""

    def __init__(self, index: int, total: int) -> None:
        self.index = index
        self.total = total

    @pytest.hookimpl(trylast=True)
    def pytest_collection_modifyitems(
        self, config: pytest.Config, items: list[pytest.Item]
    ) -> None:
        mine = shard_of(
            [item.path.as_posix() for item in items], self.index, self.total
        )
        kept = [item for item in items if item.path.as_posix() in mine]
        dropped = [item for item in items if item.path.as_posix() not in mine]
        if dropped:
            config.hook.pytest_deselected(items=dropped)
        items[:] = kept


def pytest_configure(config: pytest.Config) -> None:
    shard = config.getoption("--shard")
    if shard:
        index, total = parse_shard(shard)
        config.pluginmanager.register(_ShardSelector(index, total), "shard-selector")


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


@pytest.fixture(autouse=True)
def code_store() -> Generator[MemoryCodeStore]:
    """Booking email-code store in memory so tests need no Redis (and stay isolated)."""
    from src.bookings import email_code
    from tests.bookings.memory_code_store import MemoryCodeStore

    store = MemoryCodeStore()
    previous = email_code.set_store(store)
    yield store
    email_code.set_store(previous)


class EmailSendCall(TypedDict):
    email_to: str
    subject: str
    html_content: str


class EmailSender(Protocol):
    def __call__(
        self, *, email_to: str, subject: str = "", html_content: str = ""
    ) -> None: ...


@pytest.fixture(autouse=True)
def outbound_email_calls() -> list[EmailSendCall]:
    return []


@pytest.fixture(autouse=True)
def stub_email_sender(
    monkeypatch: pytest.MonkeyPatch,
    outbound_email_calls: list[EmailSendCall],
) -> EmailSender:
    """Record provider sends so test runs never contact a real email service."""
    original_sender = email_module.send_email

    def record_send(
        *, email_to: str, subject: str = "", html_content: str = ""
    ) -> None:
        outbound_email_calls.append(
            {"email_to": email_to, "subject": subject, "html_content": html_content}
        )

    def block_provider(*_args: object, **_kwargs: object) -> None:
        raise AssertionError(
            "Real email transport called in tests; mock the provider explicitly."
        )

    # Patch the canonical sender first so any module imported later gets the stub.
    monkeypatch.setattr(email_module, "send_email", record_send)
    # Patch modules already holding ``from src.email import send_email`` aliases.
    for module in tuple(sys.modules.values()):
        if (
            module is not None
            and getattr(module, "__name__", "").startswith("src.")
            and getattr(module, "send_email", None) is original_sender
        ):
            monkeypatch.setattr(module, "send_email", record_send)

    # Guard transport entry points too, so an unpatched alias fails closed.
    monkeypatch.setattr(resend.Emails, "send", block_provider)
    monkeypatch.setattr(smtplib, "SMTP", block_provider)
    monkeypatch.setattr(smtplib, "SMTP_SSL", block_provider)
    return record_send


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
async def second_superuser_headers_async(
    db_async: AsyncSession,
) -> dict[str, str]:
    """A different superuser, for flows that need a second person (CAP approval)."""
    from tests.factories import make_user

    user = await make_user(db_async, superuser=True)
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
