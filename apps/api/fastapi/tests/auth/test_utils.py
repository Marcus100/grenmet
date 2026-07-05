"""Tests for auth utilities."""

from datetime import timedelta

from src.auth.utils import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    get_password_hash,
    get_password_hash_async,
    verify_password,
    verify_password_async,
)


def test_password_hashing() -> None:
    """Test password hashing and verification."""
    password = "test_password_123"
    hashed = get_password_hash(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)


async def test_password_hash_async_roundtrip() -> None:
    """Async wrappers hash/verify identically to the sync originals."""
    password = "test_password_123"
    hashed = await get_password_hash_async(password)

    assert hashed != password
    assert await verify_password_async(password, hashed)
    assert not await verify_password_async("wrong_password", hashed)
    # Wrapper output must remain compatible with the sync verifier.
    assert verify_password(password, hashed)


def test_dummy_password_hash_is_bcrypt() -> None:
    """The timing-equalizer constant is a real bcrypt hash matching no known secret."""
    assert DUMMY_PASSWORD_HASH.startswith("$2b$12$")
    assert not verify_password("", DUMMY_PASSWORD_HASH)


def test_access_token_creation() -> None:
    """Test access token creation."""
    token = create_access_token(
        subject="test@weather.gd", expires_delta=timedelta(minutes=30)
    )

    assert isinstance(token, str)
    assert len(token) > 0
