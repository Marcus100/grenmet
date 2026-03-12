import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from src.auth.config import auth_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def create_session_token() -> str:
    """Create an opaque session secret for browser-facing sessions."""
    return secrets.token_urlsafe(48)


def hash_session_token(session_token: str) -> str:
    """Hash a session secret before persisting it."""
    return hashlib.sha256(session_token.encode("utf-8")).hexdigest()


def create_access_token(subject: str | Any, expires_delta: timedelta) -> str:
    """Create JWT access token."""
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, auth_settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate password hash."""
    return pwd_context.hash(password)
