"""The main async pool follows Settings.DB_POOL_* and always pre-pings outside tests."""

from collections.abc import Awaitable, Callable
from types import SimpleNamespace

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


async def test_shutdown_closes_every_engine_even_if_one_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src import main
    from src.eregister import database as eregister_database
    from src.janitorial import database as janitorial_database
    from src.transport import database as transport_database
    from src.wxproducts import database as wxproducts_database
    from src.wxwatch import database as wxwatch_database

    closed: list[str] = []

    async def broken() -> None:
        raise RuntimeError("socket gone")

    def recorder(name: str) -> Callable[[], Awaitable[None]]:
        async def close() -> None:
            closed.append(name)

        return close

    monkeypatch.setattr(wxproducts_database, "close_engine", broken)
    for name, module in (
        ("eregister", eregister_database),
        ("wxwatch", wxwatch_database),
        ("janitorial", janitorial_database),
        ("transport", transport_database),
    ):
        monkeypatch.setattr(module, "close_engine", recorder(name))
    monkeypatch.setattr(
        database, "async_engine", SimpleNamespace(dispose=recorder("main"))
    )
    async with main.lifespan(main.app):
        pass
    assert closed == ["eregister", "wxwatch", "janitorial", "transport", "main"]
