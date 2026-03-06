import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import User
from src.config import settings


async def test_create_user(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Test creating a user via API."""
    r = await async_client.post(
        f"{settings.API_V1_STR}/auth/users/signup",
        json={
            "email": "pollo@listo.com",
            "username": "pollolisto",
            "password": "password123",
            "first_name": "Pollo",
            "last_name": "Listo",
        },
    )

    assert r.status_code == 201

    data = r.json()

    result = await db_async.execute(select(User).where(User.id == data["id"]))
    user = result.scalars().first()

    assert user
    assert user.email == "pollo@listo.com"
    assert user.full_name == "Pollo Listo"
