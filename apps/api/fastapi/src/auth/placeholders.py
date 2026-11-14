"""The placeholder identity of an anonymised account (ADR-0058, issue #1375).

An anonymised account keeps a random email and username in this reserved form.
Sign-up refuses the form, so nobody can register the placeholder of a person who
deleted their account, and the form marks an account as anonymised. The token is
drawn from the random source, never from the user id, which other people can see.
"""

import secrets

PLACEHOLDER_PREFIX = "deleted-"
PLACEHOLDER_DOMAIN = "example.com"


def new_placeholder_token() -> str:
    return secrets.token_hex(16)


def placeholder_email(token: str) -> str:
    return f"{PLACEHOLDER_PREFIX}{token}@{PLACEHOLDER_DOMAIN}"


def placeholder_username(token: str) -> str:
    return f"{PLACEHOLDER_PREFIX}{token}"


def is_placeholder_email(email: str) -> bool:
    local, _, domain = email.lower().rpartition("@")
    return domain == PLACEHOLDER_DOMAIN and local.startswith(PLACEHOLDER_PREFIX)


def is_placeholder_username(username: str) -> bool:
    return username.lower().startswith(PLACEHOLDER_PREFIX)
