from uuid import uuid4

import httpx

from src.config import settings


def random_lower_string() -> str:
    return uuid4().hex


def random_email() -> str:
    return f"{random_lower_string()}@{random_lower_string()}.com"


async def get_superuser_token_headers_async(
    client: httpx.AsyncClient,
) -> dict[str, str]:
    """Get superuser auth headers using async client (for async tests)."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = await client.post(f"{settings.API_V1_STR}/auth/token", data=login_data)
    r.raise_for_status()
    tokens = r.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}
