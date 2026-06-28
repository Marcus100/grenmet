"""TOTP (RFC 6238) helpers for two-factor authentication.

The secret is stored on ``User.totp_secret``. For v1 it is stored as plaintext; a
follow-up should encrypt it at rest (e.g. application-level Fernet with a KMS key).
"""

from __future__ import annotations

import pyotp

ISSUER = "GrenMet GMS"


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(*, secret: str, account_name: str) -> str:
    """otpauth:// URI for authenticator apps (render as a QR on the client)."""
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=ISSUER)


def verify_code(*, secret: str, code: str) -> bool:
    """Verify a 6-digit code, allowing one step of clock skew either side."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
