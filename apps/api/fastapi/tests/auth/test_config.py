"""Tests for auth settings validation (SECRET_KEY enforcement)."""

import pytest
from pydantic import ValidationError

from src.auth.config import AuthConfig

# 42 chars, mixed letters+digits -> passes the strength validator.
STRONG_SECRET = "abc123" * 7


@pytest.fixture(autouse=True)
def _isolate_from_test_bcrypt_cost(monkeypatch: pytest.MonkeyPatch) -> None:
    """Drop the suite-wide BCRYPT_ROUNDS override set in the root conftest.

    These tests assert what a *deployed* config does, so they must see the real
    defaults rather than the lowered cost factor the test run exports.
    """
    monkeypatch.delenv("BCRYPT_ROUNDS", raising=False)


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


def test_lowered_bcrypt_rounds_rejected_in_production() -> None:
    """A test-only cost factor must never reach a deployed environment."""
    with pytest.raises(ValidationError, match="BCRYPT_ROUNDS must be at least 12"):
        AuthConfig(
            ENVIRONMENT="production",
            SECRET_KEY=STRONG_SECRET,
            BCRYPT_ROUNDS=4,
            _env_file=None,
        )


def test_lowered_bcrypt_rounds_rejected_in_staging() -> None:
    with pytest.raises(ValidationError, match="BCRYPT_ROUNDS must be at least 12"):
        AuthConfig(
            ENVIRONMENT="staging",
            SECRET_KEY=STRONG_SECRET,
            BCRYPT_ROUNDS=4,
            _env_file=None,
        )


def test_bcrypt_rounds_defaults_to_twelve_outside_local() -> None:
    config = AuthConfig(
        ENVIRONMENT="production", SECRET_KEY=STRONG_SECRET, _env_file=None
    )
    assert config.BCRYPT_ROUNDS == 12


def test_lowered_bcrypt_rounds_allowed_locally() -> None:
    """Only local (which includes CI test runs) may trade cost for speed."""
    config = AuthConfig(ENVIRONMENT="local", BCRYPT_ROUNDS=4, _env_file=None)
    assert config.BCRYPT_ROUNDS == 4
