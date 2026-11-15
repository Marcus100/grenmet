import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi.concurrency import run_in_threadpool

from src.auth.config import auth_settings
from src.auth.password_policy import BCRYPT_MAX_BYTES

ALGORITHM = "HS256"
# bcrypt cost factor — 12 is the modern recommended minimum, enforced as a
# floor outside local by AuthConfig. Bound at import so DUMMY_PASSWORD_HASH
# below and every issued hash share one cost.
_BCRYPT_ROUNDS = auth_settings.BCRYPT_ROUNDS


def create_session_token() -> str:
    """Create an opaque session secret for browser-facing sessions."""
    return secrets.token_urlsafe(48)


def hash_session_token(session_token: str) -> str:
    """Hash a session secret before persisting it."""
    return hashlib.sha256(session_token.encode("utf-8")).hexdigest()


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta,
    app: str | None = None,
    session_id: str | None = None,
) -> str:
    """Create JWT access token. ``app`` scopes it to one self-service app."""
    expire = datetime.now(UTC) + expires_delta
    to_encode: dict[str, Any] = {"exp": expire, "sub": str(subject)}
    if session_id is not None:
        to_encode["sid"] = session_id
    if app is not None:
        to_encode["app"] = app
    encoded_jwt = jwt.encode(to_encode, auth_settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_password_hash(password: str) -> str:
    """Hash a plain-text password with bcrypt.

    Produces a ``$2b$`` hash identical in format to what passlib[bcrypt]
    produced, so all existing stored hashes remain valid. bcrypt 5 raises
    ``ValueError`` above 72 bytes; schemas refuse such passwords first
    (``password_policy``), so reaching here with one is a bug, not a silent truncation.
    """
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


#: Stored in ``hashed_password`` of an anonymised account (ADR-0058, #1375). It is not
#: a bcrypt hash, so no password can match it, and no user path writes it (every
#: password write hashes the new password). It is a fixed value, so every process
#: and every restart agrees on it, unlike ``DUMMY_PASSWORD_HASH``.
ANONYMISED_PASSWORD_MARKER = "!anonymised"


def _bcrypt_input(password: str) -> bytes:
    """Encode a password the way bcrypt 4 read it: the first 72 bytes only.

    bcrypt 4 truncated silently, so an account whose password was set while it
    could exceed 72 bytes (schemas allowed 128 characters) holds a hash of just
    those 72 bytes. bcrypt 5 raises instead, so truncate here to keep those
    accounts signing in. New passwords over 72 bytes are refused by the schemas.
    """
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a stored bcrypt hash.

    Never raises. Input over 72 bytes is cut to 72 bytes (see ``_bcrypt_input``). A
    stored value that is not a bcrypt hash (the anonymised marker) never matches.
    Every failure path still spends one bcrypt check, so the answer takes as long as a
    real check."""
    candidate = _bcrypt_input(plain_password)
    try:
        return bcrypt.checkpw(candidate, hashed_password.encode("utf-8"))
    except ValueError:
        # A fixed input, not the caller's: if bcrypt refused the candidate itself
        # (for example a NUL byte), the equalising check must not raise again.
        bcrypt.checkpw(b"x", DUMMY_PASSWORD_HASH.encode("utf-8"))
        return False


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
