"""Tests for global Settings validation (CORS wildcard guard)."""

from typing import Any

import pytest
from pydantic import ValidationError

from src.config import Settings


def _required(**overrides: Any) -> dict[str, Any]:
    """Minimum required fields with production-strength secrets."""
    base: dict[str, Any] = {
        "PROJECT_NAME": "test",
        "POSTGRES_SERVER": "localhost",
        "POSTGRES_USER": "user",
        "POSTGRES_PASSWORD": "abc123" * 3,  # 18 chars, mixed
        "FIRST_SUPERUSER": "admin@example.com",
        "FIRST_SUPERUSER_PASSWORD": "abc123" * 2,  # 12 chars, mixed
    }
    base.update(overrides)
    return base


def test_wildcard_cors_rejected_in_production() -> None:
    """FRONTEND_HOST is a raw str, so a wildcard reaches all_cors_origins -> reject."""
    with pytest.raises(ValidationError, match="Wildcard CORS"):
        Settings(
            ENVIRONMENT="production", FRONTEND_HOST="*", _env_file=None, **_required()
        )


def test_explicit_cors_allowed_in_production() -> None:
    settings = Settings(
        ENVIRONMENT="production",
        FRONTEND_HOST="https://app.weather.gd",
        _env_file=None,
        **_required(),
    )
    assert "https://app.weather.gd" in settings.all_cors_origins


def test_wildcard_cors_allowed_locally() -> None:
    # Local must not raise on a wildcard. (Ambient env may inject other origins,
    # so assert membership rather than exact equality.)
    settings = Settings(
        ENVIRONMENT="local", FRONTEND_HOST="*", _env_file=None, **_required()
    )
    assert "*" in settings.all_cors_origins
