"""Versioned secret encryption shared by TOTP and organisation secrets."""

import pytest
from cryptography.fernet import Fernet

from src.utils import secret_box


def test_round_trip_and_rotation() -> None:
    old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    stored = secret_box.encrypt("hello", [old])
    assert stored.startswith(secret_box.ENCRYPTED_PREFIX)
    assert secret_box.is_encrypted(stored)
    # A new key goes first; values written with the old key still decrypt.
    assert secret_box.decrypt(stored, [new, old]) == "hello"


def test_failures_raise_secret_box_error() -> None:
    key = Fernet.generate_key().decode()
    stored = secret_box.encrypt("hello", [key])
    with pytest.raises(secret_box.SecretBoxError):
        secret_box.decrypt(stored, [Fernet.generate_key().decode()])
    with pytest.raises(secret_box.SecretBoxError):
        secret_box.decrypt("plaintext", [key])
    with pytest.raises(secret_box.SecretBoxError):
        secret_box.encrypt("hello", [])
    assert not secret_box.is_encrypted(None)


def test_validate_keys_names_the_setting() -> None:
    secret_box.validate_keys([Fernet.generate_key().decode()], "X_KEYS")
    with pytest.raises(ValueError, match="X_KEYS"):
        secret_box.validate_keys(["not-a-key"], "X_KEYS")
