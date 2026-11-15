"""The placeholder identity of an anonymised account (ADR-0058, issue #1375).

An anonymised account keeps a random email and username in this reserved form.
Sign-up refuses the form, so nobody can register the placeholder of a person who
deleted their account, and the form marks an account as anonymised. The token is
drawn from the random source, never from the user id, which other people can see.
"""

import secrets

from src.exceptions import AppException

PLACEHOLDER_PREFIX = "deleted-"
PLACEHOLDER_DOMAIN = "example.com"


def new_placeholder_token() -> str:
    return secrets.token_hex(16)


def placeholder_email(token: str) -> str:
    return f"{PLACEHOLDER_PREFIX}{token}@{PLACEHOLDER_DOMAIN}"


def placeholder_username(token: str) -> str:
    return f"{PLACEHOLDER_PREFIX}{token}"


def is_placeholder_email(email: str) -> bool:
    local, _, domain = email.strip().lower().rpartition("@")
    return domain == PLACEHOLDER_DOMAIN and local.startswith(PLACEHOLDER_PREFIX)


def is_placeholder_username(username: str) -> bool:
    return username.strip().lower().startswith(PLACEHOLDER_PREFIX)


def require_usable_identity(*, email: str | None, username: str | None) -> None:
    """Refuse the reserved placeholder form on any write that sets an email or a
    username (sign-up, profile edits, admin create and update, activation). Only the
    deletion flow may hold these values (ADR-0058, #1375)."""
    if email is not None and is_placeholder_email(email):
        raise AppException("That email address can't be used. Use another.", 400)
    if username is not None and is_placeholder_username(username):
        raise AppException("That username can't be used. Choose another.", 400)
