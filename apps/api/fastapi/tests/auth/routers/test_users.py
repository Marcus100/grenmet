import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.config import settings


async def test_password_signup_is_retired_and_creates_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The public password sign-up answers 410 and never creates an account (#958)."""
    response = await async_client.post(
        f"{settings.API_V1_STR}/auth/users/signup",
        json={
            "email": "pollo@listo.com",
            "username": "pollolisto",
            "password": "password123456",
            "first_name": "Pollo",
            "last_name": "Listo",
        },
    )
    assert response.status_code == 410
    assert "emailed code" in response.json()["detail"]
    count = await db_async.scalar(
        select(func.count()).select_from(User).where(User.email == "pollo@listo.com")
    )
    assert count == 0


async def test_retired_signup_replies_the_same_for_new_and_existing_addresses(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """No enumeration oracle: known and unknown addresses get byte-identical replies."""
    from tests.factories import make_user

    existing = await make_user(db_async, email="known.person@example.com")
    body = {
        "username": "x",
        "password": "password123456",
        "first_name": "A",
        "last_name": "B",
    }
    known = await async_client.post(
        f"{settings.API_V1_STR}/auth/users/signup",
        json={**body, "email": existing.email},
    )
    unknown = await async_client.post(
        f"{settings.API_V1_STR}/auth/users/signup",
        json={**body, "email": "brand.new@example.com"},
    )
    assert known.status_code == unknown.status_code == 410
    assert known.json() == unknown.json()
