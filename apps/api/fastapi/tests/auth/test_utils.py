"""Tests for auth utilities."""

from datetime import timedelta

from src.auth.utils import create_access_token, get_password_hash, verify_password


def test_password_hashing() -> None:
    """Test password hashing and verification."""
    password = "test_password_123"
    hashed = get_password_hash(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)


def test_access_token_creation() -> None:
    """Test access token creation."""
    token = create_access_token(
        subject="test@barrels.gd", expires_delta=timedelta(minutes=30)
    )

    assert isinstance(token, str)
    assert len(token) > 0
