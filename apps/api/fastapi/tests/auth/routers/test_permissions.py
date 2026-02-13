"""Tests for permissions router."""

from fastapi.testclient import TestClient

from src.config import settings


def test_get_permissions(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Test getting all permissions."""
    response = client.get(
        f"{settings.API_V1_STR}/auth/permissions/",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert isinstance(content, dict)
    assert "data" in content
    assert "count" in content
    assert isinstance(content["data"], list)


def test_create_permission(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Test creating a new permission."""
    data = {
        "action": "read",
        "entity": "user",
        "access": "own",
        "description": "Read own user data"
    }
    response = client.post(
        f"{settings.API_V1_STR}/auth/permissions/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["action"] == "read"
    assert content["entity"] == "user"
    assert content["access"] == "own"


def test_get_permission(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Test getting a specific permission."""
    # First create a permission
    data = {
        "action": "read",
        "entity": "user",
        "access": "own",
        "description": "Read own user data"
    }
    create_response = client.post(
        f"{settings.API_V1_STR}/auth/permissions/",
        headers=superuser_token_headers,
        json=data,
    )
    permission_id = create_response.json()["id"]
    
    # Then get it
    response = client.get(
        f"{settings.API_V1_STR}/auth/permissions/{permission_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["action"] == "read"
