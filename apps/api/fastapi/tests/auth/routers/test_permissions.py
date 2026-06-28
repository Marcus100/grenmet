"""Tests for permissions router."""

import uuid

import httpx

from src.config import settings


async def test_get_permissions(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test getting all permissions."""
    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/permissions/",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200
    content = response.json()
    assert isinstance(content, dict)
    assert "data" in content
    assert "count" in content
    assert isinstance(content["data"], list)


async def test_create_permission(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test creating a new permission."""
    data = {
        "action": "read",
        "entity": "user",
        "access": "own",
        "description": "Read own user data",
    }
    response = await async_client.post(
        f"{settings.API_V1_STR}/auth/permissions/",
        headers=superuser_token_headers_async,
        json=data,
    )
    assert response.status_code == 201
    content = response.json()
    assert content["action"] == "read"
    assert content["entity"] == "user"
    assert content["access"] == "own"


async def test_get_permission(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test getting a specific permission."""
    data = {
        "action": "read",
        "entity": "user",
        "access": "own",
        "description": "Read own user data",
    }
    create_response = await async_client.post(
        f"{settings.API_V1_STR}/auth/permissions/",
        headers=superuser_token_headers_async,
        json=data,
    )
    permission_id = create_response.json()["id"]

    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/permissions/{permission_id}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["action"] == "read"


async def test_get_permission_not_found(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test 404 detail shape for unknown permission ID."""
    missing_id = uuid.uuid4()
    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/permissions/{missing_id}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Permission not found"
