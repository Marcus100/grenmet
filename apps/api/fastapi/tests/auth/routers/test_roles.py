"""Tests for roles router."""

import uuid

from fastapi.testclient import TestClient

from src.config import settings


def test_get_roles(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Test getting all roles."""
    response = client.get(
        f"{settings.API_V1_STR}/auth/roles/",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert isinstance(content, dict)
    assert "data" in content
    assert "count" in content
    assert isinstance(content["data"], list)


def test_create_role(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Test creating a new role."""
    unique_name = f"test_role_{uuid.uuid4().hex[:8]}"
    data = {
        "name": unique_name,
        "description": "Test role for testing"
    }
    response = client.post(
        f"{settings.API_V1_STR}/auth/roles/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == unique_name
    assert content["description"] == "Test role for testing"


def test_get_role(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Test getting a specific role."""
    # First create a role
    unique_name = f"test_role_{uuid.uuid4().hex[:8]}"
    data = {
        "name": unique_name,
        "description": "Test role for testing"
    }
    create_response = client.post(
        f"{settings.API_V1_STR}/auth/roles/",
        headers=superuser_token_headers,
        json=data,
    )
    role_id = create_response.json()["id"]
    
    # Then get it
    response = client.get(
        f"{settings.API_V1_STR}/auth/roles/{role_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == unique_name
