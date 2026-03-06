"""Tests for roles router."""

import uuid

import httpx

from src.config import settings


async def test_get_roles(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test getting all roles."""
    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/roles/",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200
    content = response.json()
    assert isinstance(content, dict)
    assert "data" in content
    assert "count" in content
    assert isinstance(content["data"], list)


async def test_create_role(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test creating a new role."""
    unique_name = f"test_role_{uuid.uuid4().hex[:8]}"
    data = {
        "name": unique_name,
        "description": "Test role for testing",
    }
    response = await async_client.post(
        f"{settings.API_V1_STR}/auth/roles/",
        headers=superuser_token_headers_async,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == unique_name
    assert content["description"] == "Test role for testing"


async def test_get_role(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test getting a specific role."""
    unique_name = f"test_role_{uuid.uuid4().hex[:8]}"
    data = {
        "name": unique_name,
        "description": "Test role for testing",
    }
    create_response = await async_client.post(
        f"{settings.API_V1_STR}/auth/roles/",
        headers=superuser_token_headers_async,
        json=data,
    )
    role_id = create_response.json()["id"]

    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/roles/{role_id}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == unique_name


async def test_get_role_not_found(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Test 404 detail shape for unknown role ID."""
    missing_id = uuid.uuid4()
    response = await async_client.get(
        f"{settings.API_V1_STR}/auth/roles/{missing_id}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Role not found"
