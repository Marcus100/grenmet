"""Property-based API fuzzing generated from the OpenAPI contract (Schemathesis).

Every read-only (GET) operation is called with generated parameters as the
superuser and must never crash (5xx). The weather domains (wxwatch, wxproducts,
eregister) run against real, freshly migrated databases so their handlers are
exercised. 503 is allowed: janitorial and transport have their own databases and
answer 503 by design when that database is not configured. Hypothesis runs
derandomized with a small example budget so the suite stays deterministic.
"""

import asyncio
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import psycopg
import pytest
import schemathesis
from alembic.config import Config
from hypothesis import HealthCheck, settings
from schemathesis.python import asgi
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from alembic import command
from src.auth import service as auth_service
from src.auth.utils import create_access_token
from src.config import settings as app_settings
from src.database import async_session_factory, init_db_async
from src.eregister import database as eregister_database
from src.eregister.config import eregister_settings
from src.janitorial.config import janitorial_settings
from src.main import app
from src.transport.config import transport_settings
from src.wxproducts import database as wxproducts_database
from src.wxproducts.config import wxproducts_settings
from src.wxwatch import database as wxwatch_database
from src.wxwatch.config import wxwatch_settings

# Skipped by default (pyproject addopts); run with `pytest -m fuzz`.
pytestmark = pytest.mark.fuzz

# Build from app.openapi() directly: fetching the document over ASGI takes longer
# than the client's 10 s timeout on a cold app with ~365 routes.
schema = schemathesis.openapi.from_dict(app.openapi())
schema.app = app
read_only = schema.include(method="GET")

ROOT = Path(__file__).resolve().parents[1]

# Domains whose database stays unset: their routes answer 503 by design.
UNCONFIGURED = (janitorial_settings, transport_settings)
# Weather domains get a real migrated database each (see weather_databases).
WEATHER_DOMAINS: tuple[tuple[Any, Any, Path], ...] = (
    (eregister_settings, eregister_database, ROOT / "src/eregister/alembic.ini"),
    (wxproducts_settings, wxproducts_database, ROOT / "src/wxproducts/alembic.ini"),
    (wxwatch_settings, wxwatch_database, ROOT / "src/wxwatch/alembic.ini"),
)


@pytest.fixture(scope="module", autouse=True)
def unconfigured_domain_databases() -> Iterator[None]:
    # .env.local can point domain databases at Compose hosts that do not resolve
    # outside Compose, and they bypass the suite's per-run test database.
    with pytest.MonkeyPatch.context() as patch:
        for domain_settings in UNCONFIGURED:
            patch.setattr(domain_settings, "DATABASE_URL", None)
        yield


@pytest.fixture(scope="module", autouse=True)
def weather_databases(test_database: None) -> Iterator[None]:
    """Give eregister, wxproducts and wxwatch a throwaway migrated database each.

    The databases are created next to the suite's own test database (same server,
    credentials) and dropped afterwards, so nothing outside the run is touched.
    """
    assert test_database is None
    base = make_url(str(app_settings.SQLALCHEMY_DATABASE_URI))
    admin_url = base.set(database="postgres", drivername="postgresql")
    admin_dsn = admin_url.render_as_string(hide_password=False)
    created: list[str] = []
    with pytest.MonkeyPatch.context() as patch:
        try:
            for domain_settings, database, ini in WEATHER_DOMAINS:
                name = f"fuzz_{ini.parent.name}_{uuid4().hex[:12]}"
                with psycopg.connect(admin_dsn, autocommit=True) as admin:
                    admin.execute(
                        psycopg.sql.SQL("CREATE DATABASE {}").format(
                            psycopg.sql.Identifier(name)
                        )
                    )
                created.append(name)
                url = base.set(database=name)
                engine = create_engine(url.set(drivername="postgresql+psycopg"))
                config = Config(str(ini))
                config.attributes["expected_database"] = name
                try:
                    with engine.begin() as connection:
                        config.attributes["connection"] = connection
                        command.upgrade(config, "head")
                finally:
                    engine.dispose()
                patch.setattr(
                    domain_settings,
                    "DATABASE_URL",
                    url.set(drivername="postgresql").render_as_string(
                        hide_password=False
                    ),
                )
                patch.setattr(database, "_engine", None)
            yield
        finally:
            for _, database, _ in WEATHER_DOMAINS:
                engine = database._engine
                if engine is not None:
                    asyncio.run(engine.dispose())
                    database._engine = None
            with psycopg.connect(admin_dsn, autocommit=True) as admin:
                for name in created:
                    admin.execute(
                        psycopg.sql.SQL(
                            "DROP DATABASE IF EXISTS {} WITH (FORCE)"
                        ).format(psycopg.sql.Identifier(name))
                    )


@pytest.fixture(scope="module")
def superuser_headers(test_database: None) -> dict[str, str]:
    assert test_database is None

    async def mint() -> dict[str, str]:
        async with async_session_factory() as session:
            await init_db_async(session)
            user = await auth_service.get_user_by_email(
                session=session, email=str(app_settings.FIRST_SUPERUSER)
            )
            if user is None:
                raise RuntimeError("Superuser was not created")
            token = create_access_token(user.id, expires_delta=timedelta(hours=1))
            return {"Authorization": f"Bearer {token}"}

    return asyncio.run(mint())


@pytest.fixture(scope="module")
def client() -> Iterator[asgi.ASGIClient]:
    # One client for the module: starting the app per call made the run ~5x slower.
    with asgi.get_client(app) as session:
        yield session


@read_only.parametrize()
@settings(
    max_examples=5,
    derandomize=True,
    deadline=None,
    suppress_health_check=list(HealthCheck),
)
def test_read_operations_never_return_server_errors(
    case: schemathesis.Case,
    client: asgi.ASGIClient,
    superuser_headers: dict[str, str],
) -> None:
    response = case.call(session=client, headers=superuser_headers, timeout=30)
    assert response.status_code < 500 or response.status_code == 503, (
        f"{response.status_code} from {case.method} {case.formatted_path}\n"
        f"{response.text[:500]}\nReproduce: {case.as_curl_command()}"
    )
