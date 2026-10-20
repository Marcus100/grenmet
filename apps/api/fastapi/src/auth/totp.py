"""TOTP helpers and versioned authenticated encryption of stored secrets."""

from __future__ import annotations

from binascii import Error as Base32Error

import pyotp
from cryptography.fernet import Fernet, MultiFernet

from src.auth.config import auth_settings
from src.exceptions import AppException
from src.utils import secret_box

ISSUER = "Barrels account"
ENCRYPTED_PREFIX = secret_box.ENCRYPTED_PREFIX


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(*, secret: str, account_name: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=ISSUER)


def cipher() -> MultiFernet:
    if not auth_settings.AUTH_TOTP_ENCRYPTION_KEYS:
        raise AppException(
            "Authenticator setup is unavailable; contact the platform operator", 503
        )
    return MultiFernet(
        [Fernet(key.encode()) for key in auth_settings.AUTH_TOTP_ENCRYPTION_KEYS]
    )


def encrypt_secret(secret: str) -> str:
    cipher()  # 503 when no keys are configured
    return secret_box.encrypt(secret, auth_settings.AUTH_TOTP_ENCRYPTION_KEYS)


def is_encrypted(secret: str | None) -> bool:
    return secret_box.is_encrypted(secret)


def decrypt_secret(secret: str) -> str:
    if not is_encrypted(secret):
        # Compatibility during enrolment rollout; never accept plaintext in enforce mode.
        if auth_settings.AUTH_PRIVILEGED_MFA_MODE == "enforce":
            raise AppException(
                "Authenticator storage must be upgraded by the platform operator", 503
            )
        return secret
    cipher()  # 503 when no keys are configured
    try:
        return secret_box.decrypt(secret, auth_settings.AUTH_TOTP_ENCRYPTION_KEYS)
    except secret_box.SecretBoxError:
        raise AppException(
            "Authenticator storage is unavailable; contact the platform operator", 503
        ) from None


def verify_code(*, secret: str, code: str) -> bool:
    """Verify a six-digit code, allowing one step of clock skew either side."""
    if not secret or not code:
        return False
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except ValueError, TypeError, Base32Error:
        return False
