"""Ticket codes and signed QR tokens (E1).

A ticket's ``code`` is random and opaque. Its QR token is ``BT1.<code>.<tag>``
where ``tag`` is an HMAC of the code under the application secret, so a forged
or mistyped token is rejected before any database lookup. Neither the code nor
the token carries a name, email, event or order: the server looks those up.
"""

import base64
import hashlib
import hmac
import secrets

from src.auth.config import auth_settings

from .exceptions import EventsConflict

#: Crockford base32: no I, L, O or U, so codes are easy to read and type.
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 10
_TOKEN_PREFIX = "BT1"
_TAG_BYTES = 12
_TOKEN_PARTS = 3  # prefix, code, tag
_FOLD = str.maketrans({"O": "0", "I": "1", "L": "1"})


def new_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(CODE_LENGTH))


def display_code(code: str) -> str:
    """``ABCDE-FGHJK`` for people to read aloud or type."""
    half = CODE_LENGTH // 2
    return f"{code[:half]}-{code[half:]}"


def normalise_code(value: str) -> str:
    """Canonical stored form of a typed or scanned code."""
    folded = value.strip().upper().replace("-", "").replace(" ", "").translate(_FOLD)
    if len(folded) != CODE_LENGTH or any(char not in _ALPHABET for char in folded):
        raise EventsConflict("That isn't a valid ticket code")
    return folded


def _tag(code: str) -> str:
    digest = hmac.new(
        auth_settings.SECRET_KEY.encode(),
        f"events-ticket:{code}".encode(),
        hashlib.sha256,
    ).digest()[:_TAG_BYTES]
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def qr_token(code: str) -> str:
    return f"{_TOKEN_PREFIX}.{code}.{_tag(code)}"


def code_from_scan(value: str) -> str:
    """The ticket code from a scanned QR token or a typed code.

    Tokens are verified against the secret; bare codes are accepted for manual
    entry (the code alone is unguessable and the endpoint needs staff access).
    """
    text = value.strip()
    if text.startswith(f"{_TOKEN_PREFIX}."):
        parts = text.split(".")
        if len(parts) != _TOKEN_PARTS:
            raise EventsConflict("That QR code isn't a valid ticket")
        code = normalise_code(parts[1])
        if not hmac.compare_digest(parts[2], _tag(code)):
            raise EventsConflict("That QR code isn't a valid ticket")
        return code
    return normalise_code(text)
