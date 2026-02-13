from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from src.auth.models import User
from src.config import settings
from src.database import engine, init_db
from src.items.models import Item
from src.main import app
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    """Database session fixture with cleanup."""
    with Session(engine) as session:
        init_db(session)
        yield session
        # Clean up test data
        statement = delete(Item)
        session.execute(statement)
        statement = delete(User)
        session.execute(statement)
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    """FastAPI test client for sync testing."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    """Get superuser authentication headers."""
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    """Get normal user authentication headers."""
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
