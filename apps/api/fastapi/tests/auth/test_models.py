"""Tests for auth models."""

from sqlmodel import Session

from src.auth.models import Permission, Role, User
from src.auth.schemas import PermissionCreate, RoleCreate, UserCreate
from tests.utils.utils import random_email, random_lower_string


def test_user_model_creation(db: Session) -> None:
    """Test User model creation."""
    _ = db
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        password=password,
        username="testuser",
        first_name="Test",
        last_name="User",
    )
    user = User.model_validate(user_in, update={"hashed_password": "hashed_password"})

    assert user.email == email
    assert user.username == "testuser"
    assert user.first_name == "Test"
    assert user.last_name == "User"
    assert user.is_active is True
    assert user.is_superuser is False


def test_role_model_creation(db: Session) -> None:
    """Test Role model creation."""
    _ = db
    role_in = RoleCreate(name="test_role", description="Test role for testing")
    role = Role.model_validate(role_in)

    assert role.name == "test_role"
    assert role.description == "Test role for testing"


def test_permission_model_creation(db: Session) -> None:
    """Test Permission model creation."""
    _ = db
    permission_in = PermissionCreate(
        key="read:user:own",
        action="read",
        entity="user",
        access="own",
        description="Read own user data",
    )
    permission = Permission.model_validate(permission_in)

    assert permission.key == "read:user:own"
    assert permission.action == "read"
    assert permission.entity == "user"
    assert permission.access == "own"
    assert permission.description == "Read own user data"
