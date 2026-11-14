"""The limiter never blocks the event loop and fails open when Redis is down."""

import threading
import time
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.rate_limit import AsyncSafeLimiter, visitor_address

UNREACHABLE_REDIS = "redis://127.0.0.1:1/0"


def _app(limiter: AsyncSafeLimiter) -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.get("/limited")
    @limiter.limit("2/minute")
    async def limited(request: Request) -> dict[str, bool]:
        return {"ok": True}

    return app


async def _hit(app: FastAPI, n: int) -> list[int]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return [(await client.get("/limited")).status_code for _ in range(n)]


@pytest.mark.asyncio
async def test_redis_down_fails_open_without_500() -> None:
    limiter = AsyncSafeLimiter(
        key_func=visitor_address,
        storage_uri=UNREACHABLE_REDIS,
        storage_options={"socket_timeout": 0.1, "socket_connect_timeout": 0.1},
        in_memory_fallback_enabled=True,
        swallow_errors=True,
    )
    start = time.monotonic()
    codes = await _hit(_app(limiter), 3)
    assert 500 not in codes
    assert codes[0] == 200
    assert time.monotonic() - start < 5


@pytest.mark.asyncio
async def test_limiter_still_limits_with_working_storage() -> None:
    limiter = AsyncSafeLimiter(key_func=visitor_address, storage_uri="memory://")
    assert await _hit(_app(limiter), 3) == [200, 200, 429]


@pytest.mark.asyncio
async def test_check_runs_off_the_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limiter = AsyncSafeLimiter(key_func=visitor_address, storage_uri="memory://")
    checked: list[int] = []
    original = limiter._check_request_limit

    def spy(*args: Any, **kwargs: Any) -> None:
        checked.append(threading.get_ident())
        original(*args, **kwargs)

    monkeypatch.setattr(limiter, "_check_request_limit", spy)
    await _hit(_app(limiter), 1)
    assert checked
    assert checked[0] != threading.get_ident()
