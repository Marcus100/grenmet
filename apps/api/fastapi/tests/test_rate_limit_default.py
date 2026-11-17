"""The default limit covers routes without their own limit and spares exempt ones."""

import logging
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.config import settings
from src.rate_limit import (
    AsyncSafeLimiter,
    DefaultRateLimitMiddleware,
    visitor_address,
)

LIMIT = 3
SECRET = "web-tier-shared-secret-for-tests-0123456789"


@pytest.fixture(autouse=True)
def _enforce(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_RATE_LIMIT_MODE", "enforce")


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

    @app.get("/items/{name}")
    async def item(name: str) -> dict[str, str]:
        return {"name": name}

    @app.get("/own")
    @limiter.limit("100/minute")
    async def own(request: Request) -> dict[str, bool]:
        return {"ok": isinstance(request, Request)}

    return app


def _limiter() -> AsyncSafeLimiter:
    return AsyncSafeLimiter(
        key_func=visitor_address,
        storage_uri="memory://",
        application_limits=[f"{LIMIT}/minute"],
    )


async def _codes(
    app: FastAPI,
    method: str,
    path: str,
    n: int,
    headers: dict[str, str] | None = None,
    client_addr: tuple[str, int] = ("203.0.113.9", 5000),
) -> list[int]:
    transport = httpx.ASGITransport(app=app, client=client_addr)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://t", headers=headers
    ) as client:
        return [(await client.request(method, path)).status_code for _ in range(n)]


@pytest.mark.asyncio
async def test_unlimited_route_gets_429_after_default() -> None:
    assert await _codes(_app(_limiter()), "GET", "/plain", LIMIT + 2) == [
        200,
        200,
        200,
        429,
        429,
    ]


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
    limiter = AsyncSafeLimiter(
        key_func=visitor_address,
        storage_uri="redis://127.0.0.1:1/0",
        storage_options={"socket_timeout": 0.1, "socket_connect_timeout": 0.1},
        in_memory_fallback_enabled=True,
        swallow_errors=True,
        application_limits=[f"{LIMIT}/minute"],
    )
    codes = await _codes(_app(limiter), "GET", "/plain", LIMIT + 2)
    assert 500 not in codes
    assert codes[0] == 200


def test_the_real_app_limits_unlimited_routes_by_default() -> None:
    from src.config import settings
    from src.rate_limit import limiter

    assert settings.DEFAULT_RATE_LIMIT_PER_MINUTE == 1000
    assert limiter._application_limits


@pytest.mark.asyncio
@pytest.mark.parametrize("word", ["ready", "webhooks", "internal", "health-check"])
async def test_path_parameter_with_an_exempt_word_is_still_limited(word: str) -> None:
    codes = await _codes(_app(_limiter()), "GET", f"/items/{word}", LIMIT + 1)
    assert codes[-1] == 429


@pytest.mark.asyncio
async def test_wrong_method_is_counted() -> None:
    codes = await _codes(_app(_limiter()), "POST", "/plain", LIMIT + 1)
    assert codes == [405, 405, 405, 429]


@pytest.mark.asyncio
async def test_unknown_path_is_counted() -> None:
    codes = await _codes(_app(_limiter()), "GET", "/nope", LIMIT + 1)
    assert codes == [404, 404, 404, 429]


@pytest.mark.asyncio
async def test_trusted_host_call_without_visitor_is_exempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", SECRET)
    app = _app(_limiter())
    host = {"X-Visitor-Secret": SECRET}
    assert set(await _codes(app, "GET", "/plain", LIMIT * 3, host)) == {200}
    wrong = {"X-Visitor-Secret": "x" * 40}
    assert (await _codes(_app(_limiter()), "GET", "/plain", LIMIT + 1, wrong))[
        -1
    ] == 429


@pytest.mark.asyncio
async def test_trusted_host_with_visitor_is_limited_per_visitor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", SECRET)
    app = _app(_limiter())
    one = {"X-Visitor-Secret": SECRET, "X-Visitor-IP": "198.51.100.1"}
    two = {"X-Visitor-Secret": SECRET, "X-Visitor-IP": "198.51.100.2"}
    assert (await _codes(app, "GET", "/plain", LIMIT + 1, one))[-1] == 429
    assert await _codes(app, "GET", "/plain", 1, two) == [200]


@pytest.mark.asyncio
async def test_direct_internal_call_is_exempt() -> None:
    internal = ("172.31.250.7", 4000)
    codes = await _codes(
        _app(_limiter()), "GET", "/plain", LIMIT * 3, client_addr=internal
    )
    assert set(codes) == {200}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "header",
    [
        {"X-Forwarded-For": "203.0.113.9"},
        {"X-Forwarded-For": "172.31.250.7"},
        {"Forwarded": "for=203.0.113.9"},
        {"X-Real-IP": "203.0.113.9"},
    ],
)
async def test_proxied_or_outside_call_never_looks_internal(
    header: dict[str, str],
) -> None:
    app = _app(_limiter())
    internal = ("172.31.250.7", 4000)
    assert (await _codes(app, "GET", "/plain", LIMIT + 1, header, internal))[-1] == 429
    # outside address with no header is limited too
    assert (await _codes(_app(_limiter()), "GET", "/plain", LIMIT + 1))[-1] == 429


@pytest.mark.asyncio
async def test_log_mode_never_returns_429(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "DEFAULT_RATE_LIMIT_MODE", "log")
    with caplog.at_level(logging.WARNING, logger="src.rate_limit.default"):
        codes = await _codes(_app(_limiter()), "GET", "/plain", LIMIT + 3)
    assert set(codes) == {200}
    ours = [
        r.getMessage() for r in caplog.records if r.name == "src.rate_limit.default"
    ]
    assert ours
    assert all("bucket_kind=connecting route=/plain" in m for m in ours)
    assert all("203.0.113.9" not in m for m in ours)


@pytest.mark.asyncio
async def test_off_mode_does_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_RATE_LIMIT_MODE", "off")
    assert set(await _codes(_app(_limiter()), "GET", "/plain", LIMIT * 3)) == {200}


@pytest.mark.asyncio
async def test_log_mode_logs_once_a_minute_with_suppressed_count(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "DEFAULT_RATE_LIMIT_MODE", "log")
    clock = [1000.0]
    monkeypatch.setattr("src.rate_limit.time.monotonic", lambda: clock[0])
    app = _app(_limiter())
    with caplog.at_level(logging.WARNING, logger="src.rate_limit.default"):
        await _codes(app, "GET", "/plain", LIMIT + 6)  # 6 requests over the limit
        clock[0] += 61
        await _codes(app, "GET", "/plain", 1)
    ours = [
        r.getMessage() for r in caplog.records if r.name == "src.rate_limit.default"
    ]
    assert len(ours) == 2
    assert ours[0].endswith("suppressed=0")
    assert ours[1].endswith("suppressed=5")


@pytest.mark.asyncio
async def test_unknown_paths_do_not_walk_every_route_or_keep_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limiter = _limiter()
    app = _app(limiter)
    for i in range(60):
        app.add_api_route(f"/filler{i}/x", _filler, methods=["GET"])
    middleware = DefaultRateLimitMiddleware(app, limiter=limiter)
    counts = [0]
    for route in app.routes:
        original = route.matches

        def counted(scope: Any, _original: Any = original) -> Any:
            counts[0] += 1
            return _original(scope)

        monkeypatch.setattr(route, "matches", counted)
    hot = middleware._resolve(app, "GET", "/plain")
    assert hot[1] == "/plain"
    counts[0] = 0
    for i in range(500):
        assert middleware._resolve(app, "GET", f"/nope-{i}/a/b") == (None, "")
    # A miss tries only routes that start with a path parameter, never all ~70.
    assert counts[0] <= 500 * 2
    assert middleware._resolve(app, "GET", "/plain") == hot
    assert middleware._resolve(app, "GET", "/items/ready")[1] == "/items/{name}"


async def _filler() -> None:
    return None
