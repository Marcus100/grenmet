import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.config import settings

SIGNUP = f"{settings.API_V1_STR}/auth/users/signup"
START = f"{settings.API_V1_STR}/auth/email-code/start"
BODY = {
    "username": "janeperson",
    "password": "password123456",
    "first_name": "A",
    "last_name": "B",
}


async def test_password_signup_is_retired_and_creates_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The retired password sign-up never creates an account (#958)."""
    response = await async_client.post(
        SIGNUP, json={**BODY, "email": "pollo@listo.com"}
    )
    assert response.status_code == 200
    count = await db_async.scalar(
        select(func.count()).select_from(User).where(User.email == "pollo@listo.com")
    )
    assert count == 0


async def test_retired_signup_replies_exactly_like_code_start(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """No enumeration oracle: known, unknown and code-start replies are identical."""
    from tests.factories import make_user

    existing = await make_user(db_async, email="known.person@example.com")
    known = await async_client.post(SIGNUP, json={**BODY, "email": existing.email})
    unknown = await async_client.post(
        SIGNUP, json={**BODY, "email": "brand.new@example.com"}
    )
    start = await async_client.post(START, json={"email": "brand.new@example.com"})
    assert known.status_code == unknown.status_code == start.status_code == 200
    assert known.json() == unknown.json() == start.json()
