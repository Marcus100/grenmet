"""Tests for auth settings validation (SECRET_KEY enforcement)."""

import pytest
from pydantic import ValidationError

from src.auth.config import AuthConfig

# 42 chars, mixed letters+digits -> passes the strength validator.
STRONG_SECRET = "abc123" * 7


def test_secret_key_required_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing SECRET_KEY must fail rather than fall back to the ephemeral default."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError, match="SECRET_KEY must be set explicitly"):
        AuthConfig(ENVIRONMENT="production", _env_file=None)


def test_secret_key_required_in_staging(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError, match="SECRET_KEY must be set explicitly"):
        AuthConfig(ENVIRONMENT="staging", _env_file=None)


def test_secret_key_explicit_passes_in_production() -> None:
    config = AuthConfig(
        ENVIRONMENT="production", SECRET_KEY=STRONG_SECRET, _env_file=None
    )
    assert config.SECRET_KEY == STRONG_SECRET


def test_secret_key_default_allowed_locally(monkeypatch: pytest.MonkeyPatch) -> None:
    """Local development may use the generated default."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    config = AuthConfig(ENVIRONMENT="local", _env_file=None)
    assert config.SECRET_KEY
