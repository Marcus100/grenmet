"""Keyed hashing of email addresses kept only as consent or suppression proof.

``hash_email`` is HMAC-SHA256 over the normalised (stripped, lower-cased)
address, keyed by the ``EMAIL_HASH_PEPPER`` secret, hex encoded. A database
leak alone cannot be checked against a list of addresses; losing or rotating
the pepper makes every stored hash unmatchable, so treat it like a signing key.
"""

import hashlib
import hmac

from src.config import settings

# Used only when ENVIRONMENT is "local" and no pepper is set, so a fresh
# checkout and the tests work. Never reaches staging or production.
_LOCAL_DEV_PEPPER = "local-development-email-hash-pepper-not-secret"


class EmailHashPepperMissingError(RuntimeError):
    """Raised instead of hashing with an empty key."""


def normalise_email(email: str) -> str:
    return email.strip().lower()


def get_pepper(pepper: str | None = None) -> str:
    """Return the pepper to use; refuse an empty one outside local development."""
    value = pepper if pepper is not None else settings.EMAIL_HASH_PEPPER
    if value:
        return value
    if settings.ENVIRONMENT == "local":
        return _LOCAL_DEV_PEPPER
    raise EmailHashPepperMissingError(
        "EMAIL_HASH_PEPPER is not set; refusing to hash email addresses with an "
        "empty key. Set the EMAIL_HASH_PEPPER secret for this environment."
    )


def hash_email(email: str, *, pepper: str | None = None) -> str:
    key = get_pepper(pepper).encode()
    return hmac.new(key, normalise_email(email).encode(), hashlib.sha256).hexdigest()
