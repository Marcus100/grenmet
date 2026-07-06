import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi.concurrency import run_in_threadpool

from src.auth.config import auth_settings

ALGORITHM = "HS256"
# bcrypt cost factor — 12 is the modern recommended minimum
_BCRYPT_ROUNDS = 12


def create_session_token() -> str:
    """Create an opaque session secret for browser-facing sessions."""
    return secrets.token_urlsafe(48)


def hash_session_token(session_token: str) -> str:
    """Hash a session secret before persisting it."""
    return hashlib.sha256(session_token.encode("utf-8")).hexdigest()


def create_access_token(subject: str | Any, expires_delta: timedelta) -> str:
    """Create JWT access token."""
    expire = datetime.now(UTC) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, auth_settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_password_hash(password: str) -> str:
    """Hash a plain-text password with bcrypt.

    Produces a ``$2b$`` hash identical in format to what passlib[bcrypt]
    produced, so all existing stored hashes remain valid.
    """
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a stored bcrypt hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


# Constant-time equalizer for the unknown-user login path: verifying a supplied
# password against this hash costs the same as verifying against a real one, so
# "no such user" and "wrong password" are indistinguishable by response timing.
# Computed once at import; not a credential for any account.
DUMMY_PASSWORD_HASH = get_password_hash(secrets.token_urlsafe(32))


async def get_password_hash_async(password: str) -> str:
    """Hash a password off the event loop (bcrypt is CPU-bound ~50-100ms)."""
    return await run_in_threadpool(get_password_hash, password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """Verify a password off the event loop (bcrypt is CPU-bound ~50-100ms)."""
    return await run_in_threadpool(verify_password, plain_password, hashed_password)
