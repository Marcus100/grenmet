"""The 72-byte bcrypt limit (bcrypt 5 raises above it; bcrypt 4 truncated silently)."""

import bcrypt
import pytest
from pydantic import ValidationError

from src.auth.password_policy import BCRYPT_MAX_BYTES, TOO_LONG_MESSAGE
from src.auth.schemas import NewPassword, UpdatePassword, UserCreate, UserRegister
from src.auth.utils import (
    ANONYMISED_PASSWORD_MARKER,
    get_password_hash,
    verify_password,
    verify_password_async,
)
from tests.factories import make_user

LIMIT_PASSWORD = "a" * 72
OVER_LIMIT_PASSWORD = "a" * 73


def test_72_byte_password_is_accepted_and_73_is_refused() -> None:
    assert NewPassword(token="t", new_password=LIMIT_PASSWORD)
    with pytest.raises(ValidationError, match="at most 72 bytes"):
        NewPassword(token="t", new_password=OVER_LIMIT_PASSWORD)


def test_multibyte_characters_count_as_bytes() -> None:
    # 36 two-byte characters = 72 bytes, 36 characters.
    assert NewPassword(token="t", new_password="é" * 36)
    # 37 characters, 74 bytes: well under the 128-character cap, still refused.
    with pytest.raises(ValidationError) as caught:
        NewPassword(token="t", new_password="é" * 37)
    assert TOO_LONG_MESSAGE in str(caught.value)
    # 18 four-byte characters = 72 bytes; 19 = 76.
    assert NewPassword(token="t", new_password="😀" * 18)
    with pytest.raises(ValidationError):
        NewPassword(token="t", new_password="😀" * 19)


def test_every_new_password_schema_applies_the_rule() -> None:
    with pytest.raises(ValidationError, match="at most 72 bytes"):
        UpdatePassword(current_password="x", new_password=OVER_LIMIT_PASSWORD)
    with pytest.raises(ValidationError, match="at most 72 bytes"):
        UserCreate(
            email="a@example.com", username="someone", password=OVER_LIMIT_PASSWORD
        )
    with pytest.raises(ValidationError, match="at most 72 bytes"):
        UserRegister(
            email="a@example.com",
            username="someone",
            password=OVER_LIMIT_PASSWORD,
            first_name="A",
            last_name="B",
        )


async def test_over_long_new_password_is_422(async_client) -> None:
    response = await async_client.post(
        "/api/v1/auth/password/reset",
        json={"token": "whatever", "new_password": "é" * 40},
    )
    assert response.status_code == 422
    assert "at most 72 bytes" in response.text


def test_get_password_hash_refuses_over_long_input() -> None:
    assert verify_password(LIMIT_PASSWORD, get_password_hash(LIMIT_PASSWORD))
    with pytest.raises(ValueError, match="72"):
        get_password_hash(OVER_LIMIT_PASSWORD)


def test_hash_stored_by_bcrypt_4_still_verifies() -> None:
    """bcrypt 4 hashed only the first 72 bytes of a longer password."""
    long_password = "correct horse battery staple " * 4  # 116 bytes
    stored = bcrypt.hashpw(
        long_password.encode()[:BCRYPT_MAX_BYTES], bcrypt.gensalt(rounds=4)
    ).decode()

    assert verify_password(long_password, stored)
    assert verify_password(long_password[:BCRYPT_MAX_BYTES], stored)
    assert not verify_password("a different password entirely", stored)


def test_verify_never_raises_for_odd_input() -> None:
    stored = get_password_hash("a-normal-password")
    for candidate in ("", "x" * 500, "é" * 300, "😀" * 200, "\x00" * 100):
        assert verify_password(candidate, stored) is False
    for stored_value in (ANONYMISED_PASSWORD_MARKER, "", "not-a-hash"):
        for candidate in ("", "pw", "x" * 500, "é" * 300):
            assert verify_password(candidate, stored_value) is False


async def test_verify_async_over_long_and_marker() -> None:
    stored = get_password_hash("a-normal-password")
    assert await verify_password_async("z" * 128, stored) is False
    assert await verify_password_async("z" * 128, ANONYMISED_PASSWORD_MARKER) is False


async def test_login_with_over_long_password_is_a_normal_failure(
    async_client, db_async
) -> None:
    user = await make_user(db_async, password="valid-password-1")
    for email in (user.email, "nobody@example.com"):
        response = await async_client.post(
            "/api/v1/auth/sessions",
            json={"email": email, "password": "é" * 128},
        )
        assert response.status_code in (400, 401), response.text
