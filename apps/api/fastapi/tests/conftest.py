from collections.abc import AsyncGenerator, Generator

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session, delete

from src.auth.models import Session as AuthSession
from src.auth.models import User
from src.database import async_session_factory, engine, init_db, init_db_async
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


@pytest.fixture(scope="session", autouse=True)
def disable_rate_limiting() -> Generator[None, None, None]:
    """Disable rate limiting during tests to prevent 429 errors from rapid login calls."""
    limiter._enabled = False
    yield
    limiter._enabled = True


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    """Sync database session (legacy). Prefer async db_async for new tests."""
    with Session(engine) as session:
        init_db(session)
        yield session
        session.execute(delete(AuthSession))
        statement = delete(User)
        session.execute(statement)
        session.commit()


@pytest.fixture
async def db_async() -> AsyncGenerator[AsyncSession, None]:
    """Async database session. Ensures superuser exists; cleans up users on teardown."""
    async with async_session_factory() as session:
        await init_db_async(session)
        yield session
        await session.execute(delete(AuthSession))
        await session.execute(delete(User))
        await session.commit()


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
