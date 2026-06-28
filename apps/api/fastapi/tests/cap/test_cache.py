"""CAP response cache (src/cap/cache.py) — no-op without Redis, hit/miss/invalidate."""

import pytest
from fakeredis import FakeAsyncRedis

from src.cap import cache


async def test_no_redis_calls_producer_each_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cache, "_get_client", lambda: None)
    calls = 0

    async def produce() -> dict[str, int]:
        nonlocal calls
        calls += 1
        return {"n": calls}

    a = await cache.cached_json("k", 30, produce)
    b = await cache.cached_json("k", 30, produce)
    assert calls == 2
    assert a == {"n": 1}
    assert b == {"n": 2}


async def test_cache_hit_with_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr(cache, "_get_client", lambda: fake)
    calls = 0

    async def produce() -> dict[str, int]:
        nonlocal calls
        calls += 1
        return {"n": calls}

    first = await cache.cached_json("k1", 30, produce)
    second = await cache.cached_json("k1", 30, produce)
    assert calls == 1  # second served from cache
    assert first == second == {"n": 1}


async def test_invalidate_forces_recompute(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr(cache, "_get_client", lambda: fake)
    calls = 0

    async def produce() -> dict[str, int]:
        nonlocal calls
        calls += 1
        return {"n": calls}

    await cache.cached_json("k2", 30, produce)
    await cache.invalidate("k2")
    await cache.cached_json("k2", 30, produce)
    assert calls == 2


async def test_cached_text_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr(cache, "_get_client", lambda: fake)
    calls = 0

    async def produce() -> str:
        nonlocal calls
        calls += 1
        return f"<x>{calls}</x>"

    a = await cache.cached_text("t", 30, produce)
    b = await cache.cached_text("t", 30, produce)
    assert calls == 1
    assert a == b == "<x>1</x>"
