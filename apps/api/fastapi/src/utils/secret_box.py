"""Versioned authenticated encryption for secrets stored in the database.

Values are Fernet tokens with a ``fernet:v1:`` prefix. Keys are a list so a new
key can be put first while older ones still decrypt (``MultiFernet`` rotation).
Each domain owns its key setting (TOTP: ``AUTH_TOTP_ENCRYPTION_KEYS``,
organisation secrets: ``ORG_SECRET_ENCRYPTION_KEYS``) and its error policy.
"""

from collections.abc import Sequence

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

ENCRYPTED_PREFIX = "fernet:v1:"


class SecretBoxError(Exception):
    """No keys are configured, or a value cannot be decrypted with them."""


def validate_keys(keys: Sequence[str], setting: str) -> None:
    """Raise ``ValueError`` naming ``setting`` unless every key is a Fernet key."""
    for key in keys:
        try:
            Fernet(key.encode())
        except ValueError, TypeError:
            raise ValueError(f"{setting} must contain Fernet keys") from None


def _cipher(keys: Sequence[str]) -> MultiFernet:
    if not keys:
        raise SecretBoxError("No encryption keys are configured")
    return MultiFernet([Fernet(key.encode()) for key in keys])


def encrypt(value: str, keys: Sequence[str]) -> str:
    return ENCRYPTED_PREFIX + _cipher(keys).encrypt(value.encode()).decode()


def is_encrypted(value: str | None) -> bool:
    return bool(value and value.startswith(ENCRYPTED_PREFIX))


def decrypt(value: str, keys: Sequence[str]) -> str:
    """Decrypt a prefixed value. Raises ``SecretBoxError`` on any failure."""
    if not is_encrypted(value):
        raise SecretBoxError("Value is not encrypted")
    try:
        return (
            _cipher(keys)
            .decrypt(value.removeprefix(ENCRYPTED_PREFIX).encode())
            .decode()
        )
    except InvalidToken, UnicodeError:
        raise SecretBoxError(
            "Value cannot be decrypted with the configured keys"
        ) from None
