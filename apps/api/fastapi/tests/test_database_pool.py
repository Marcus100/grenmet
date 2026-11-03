"""The main async pool follows Settings.DB_POOL_* and always pre-pings outside tests."""

import pytest

from src import database
from src.config import settings


def test_pool_options_follow_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DB_POOL_SIZE", 7)
    monkeypatch.setattr(settings, "DB_MAX_OVERFLOW", 3)
    monkeypatch.setattr(settings, "DB_POOL_TIMEOUT", 4)
    monkeypatch.setattr(settings, "DB_POOL_RECYCLE", 600)
    assert database.async_pool_options() == {
        "pool_pre_ping": True,
        "pool_size": 7,
        "max_overflow": 3,
        "pool_timeout": 4,
        "pool_recycle": 600,
    }


def test_pool_defaults_fail_fast_and_recycle() -> None:
    options = database.async_pool_options()
    assert options["pool_timeout"] < 30
    assert options["pool_recycle"] > 0
