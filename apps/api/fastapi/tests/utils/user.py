from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session

import httpx

from src.auth import service as crud
from src.auth.models import User
from src.auth.schemas import UserCreate, UserUpdate
from src.config import settings
from tests.utils.utils import random_email, random_lower_string


def user_authentication_headers(
    *, client: TestClient, email: str, password: str
) -> dict[str, str]:
    """Get authentication headers for a user."""
    data = {"username": email, "password": password}

    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=data)
    response = r.json()
    auth_token = response["access_token"]
    headers = {"Authorization": f"Bearer {auth_token}"}
    return headers


async def user_authentication_headers_async(
    *, client: httpx.AsyncClient, email: str, password: str
) -> dict[str, str]:
    """Get authentication headers for a user (async client)."""
    data = {"username": email, "password": password}
    r = await client.post(
        f"{settings.API_V1_STR}/login/access-token", data=data
    )
    r.raise_for_status()
    tokens = r.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def authentication_token_from_email_async(
    *, client: httpx.AsyncClient, email: str, db: AsyncSession
) -> dict[str, str]:
    """
    Return a valid token for the user with given email (async).
    If the user doesn't exist it is created first.
    """
    password = random_lower_string()
    user = await crud.get_user_by_email(session=db, email=email)
    if not user:
        user_in_create = UserCreate(
            email=email,
            username=email.split("@")[0],
            password=password,
            first_name="Test",
            last_name="User",
        )
        await crud.create_user(session=db, user_create=user_in_create)
    else:
        user_in_update = UserUpdate(
            email=user.email,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            password=password,
        )
        if not user.id:
            raise Exception("User id not set")
        await crud.update_user(session=db, db_user=user, user_in=user_in_update)
    return await user_authentication_headers_async(
        client=client, email=email, password=password
    )


def create_random_user(db: Session) -> User:
    email = random_email()
    password = random_lower_string()
    username = random_lower_string()
    user_in = UserCreate(
        email=email,
        username=username,
        password=password,
        first_name="Test",
        last_name="User"
    )
    user = crud.create_user(session=db, user_create=user_in)
    return user


def authentication_token_from_email(
    *, client: TestClient, email: str, db: Session
) -> dict[str, str]:
    """
    Return a valid token for the user with given email.

    If the user doesn't exist it is created first.
    """
    password = random_lower_string()
    user = crud.get_user_by_email(session=db, email=email)
    if not user:
        user_in_create = UserCreate(
            email=email,
            username=email.split('@')[0],
            password=password,
            first_name="Test",
            last_name="User"
        )
        user = crud.create_user(session=db, user_create=user_in_create)
    else:
        user_in_update = UserUpdate(
            email=user.email,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            password=password
        )
        if not user.id:
            raise Exception("User id not set")
        user = crud.update_user(session=db, db_user=user, user_in=user_in_update)

    return user_authentication_headers(client=client, email=email, password=password)
