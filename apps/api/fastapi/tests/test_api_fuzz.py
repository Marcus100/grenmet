"""Property-based API fuzzing generated from the OpenAPI contract (Schemathesis).

Every read-only (GET) operation is called with generated parameters as the
superuser and must never crash (5xx). 503 is allowed: domains with their own
database (wxwatch, wxproducts, eregister, janitorial, transport) answer
503 by design when that database is not configured. Hypothesis runs
derandomized with a small example budget so the suite stays deterministic.
"""

import asyncio
from collections.abc import Iterator
from datetime import timedelta

import pytest
import schemathesis
from hypothesis import HealthCheck, settings
from schemathesis.python import asgi

from src.auth import service as auth_service
from src.auth.utils import create_access_token
from src.config import settings as app_settings
from src.database import async_session_factory, init_db_async
from src.eregister.config import eregister_settings
from src.janitorial.config import janitorial_settings
from src.main import app
from src.transport.config import transport_settings
from src.wxproducts.config import wxproducts_settings
from src.wxwatch.config import wxwatch_settings

# Skipped by default (pyproject addopts); run with `pytest -m fuzz`.
pytestmark = pytest.mark.fuzz

# Build from app.openapi() directly: fetching the document over ASGI takes longer
# than the client's 10 s timeout on a cold app with ~365 routes.
schema = schemathesis.openapi.from_dict(app.openapi())
schema.app = app
read_only = schema.include(method="GET")

# Domain databases are configured per domain (WXPRODUCTS_DATABASE_URL, ...) and
# .env.local can point them at Compose hosts such as grenmet-postgres, which do
# not resolve outside Compose. They also bypass the suite's per-run test database
# (tests/conftest.py). Leave them unset, as CI does, so those routes answer 503 by
# design. The main database stays on the suite's POSTGRES_* settings.
DOMAIN_DATABASE_SETTINGS = (
    eregister_settings,
    janitorial_settings,
    transport_settings,
    wxproducts_settings,
    wxwatch_settings,
)


@pytest.fixture(scope="module", autouse=True)
def unconfigured_domain_databases() -> Iterator[None]:
    with pytest.MonkeyPatch.context() as patch:
        for domain_settings in DOMAIN_DATABASE_SETTINGS:
            patch.setattr(domain_settings, "DATABASE_URL", None)
        yield


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
