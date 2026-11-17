"""The default limit covers routes without their own limit and spares exempt ones."""

import httpx
import pytest
from fastapi import FastAPI, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.config import settings
from src.rate_limit import (
    AsyncSafeLimiter,
    DefaultRateLimitMiddleware,
    limiter as app_limiter,
    visitor_address,
)

LIMIT = 3


def _app(limiter: AsyncSafeLimiter) -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(DefaultRateLimitMiddleware, limiter=limiter)

    @app.get("/plain")
    async def plain() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/other")
    async def other() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/utils/health-check/")
    async def health() -> bool:
        return True

    @app.post("/billing/webhooks/stripe")
    async def stripe() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/content-distribution/internal/posts")
    async def internal() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/marked")
    @limiter.exempt
    async def marked() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/own")
    @limiter.limit("100/minute")
    async def own(request: Request) -> dict[str, bool]:
        return {"ok": True}

    return app


def _limiter(storage: str = "memory://") -> AsyncSafeLimiter:
    return AsyncSafeLimiter(
        key_func=visitor_address,
        storage_uri=storage,
        storage_options={"socket_timeout": 0.1, "socket_connect_timeout": 0.1}
        if storage.startswith("redis")
        else {},
        in_memory_fallback_enabled=True,
        swallow_errors=True,
        application_limits=[f"{LIMIT}/minute"],
    )


async def _codes(app: FastAPI, method: str, path: str, n: int) -> list[int]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return [(await client.request(method, path)).status_code for _ in range(n)]


@pytest.mark.asyncio
async def test_unlimited_route_gets_429_after_default() -> None:
    codes = await _codes(_app(_limiter()), "GET", "/plain", LIMIT + 2)
    assert codes == [200, 200, 200, 429, 429]


@pytest.mark.asyncio
async def test_budget_is_shared_across_routes() -> None:
    app = _app(_limiter())
    assert await _codes(app, "GET", "/plain", LIMIT) == [200] * LIMIT
    assert await _codes(app, "GET", "/other", 1) == [429]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/utils/health-check/"),
        ("POST", "/billing/webhooks/stripe"),
        ("POST", "/content-distribution/internal/posts"),
        ("GET", "/marked"),
    ],
)
@pytest.mark.asyncio
async def test_exempt_routes_are_never_limited(method: str, path: str) -> None:
    assert set(await _codes(_app(_limiter()), method, path, LIMIT * 4)) == {200}


@pytest.mark.asyncio
async def test_route_with_own_limit_uses_only_that_limit() -> None:
    assert set(await _codes(_app(_limiter()), "GET", "/own", LIMIT * 3)) == {200}


@pytest.mark.asyncio
async def test_redis_down_fails_open() -> None:
    codes = await _codes(
        _app(_limiter("redis://127.0.0.1:1/0")), "GET", "/plain", LIMIT + 2
    )
    assert 500 not in codes
    assert codes[0] == 200


def test_the_real_limiter_has_the_configured_default() -> None:
    assert settings.DEFAULT_RATE_LIMIT_PER_MINUTE == 300
    assert app_limiter._application_limits
