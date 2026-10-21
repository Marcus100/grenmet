"""Per-visitor rate limiting behind a trusted web host (issue #468)."""

import random
from typing import Any, cast
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src import rate_limit, turnstile
from src.config import settings
from src.rate_limit import (
    VISITOR_IP_HEADER,
    VISITOR_SECRET_HEADER,
    limiter,
    visitor_address,
)

SECRET = "web-tier-shared-secret-for-tests-0123456789"
API = settings.API_V1_STR


def _request(
    headers: dict[str, str], client: str = "10.0.0.9", path: str = "/x"
) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "server": ("api", 8000),
            "path": path,
            "query_string": b"",
            "headers": [
                (k.lower().encode(), v.encode("latin-1")) for k, v in headers.items()
            ],
            "client": (client, 1234),
        }
    )


def _trusted(ip: str) -> dict[str, str]:
    return {VISITOR_IP_HEADER: ip, VISITOR_SECRET_HEADER: SECRET}


def _random_ip() -> str:
    return f"203.0.{random.randint(0, 255)}.{random.randint(1, 254)}"


@pytest.fixture(autouse=True)
def _secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", SECRET)


def test_trusted_host_names_the_visitor() -> None:
    assert visitor_address(_request(_trusted("203.0.113.7"))) == "203.0.113.7"
    assert visitor_address(_request(_trusted(" 2001:db8::1 "))) == "2001:db8::/64"


@pytest.mark.parametrize(
    "headers",
    [
        {VISITOR_IP_HEADER: "203.0.113.7"},
        {VISITOR_IP_HEADER: "203.0.113.7", VISITOR_SECRET_HEADER: "wrong"},
        {VISITOR_SECRET_HEADER: SECRET},
        _trusted("not-an-ip"),
        {},
    ],
)
def test_untrusted_or_malformed_header_is_ignored(headers: dict[str, str]) -> None:
    assert visitor_address(_request(headers)) == "10.0.0.9"


def test_header_ignored_when_no_secret_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", "")
    assert visitor_address(_request({VISITOR_IP_HEADER: "1.2.3.4"})) == "10.0.0.9"
    assert visitor_address(_request(_trusted("1.2.3.4"))) == "10.0.0.9"
    empty = {VISITOR_IP_HEADER: "1.2.3.4", VISITOR_SECRET_HEADER: ""}
    assert visitor_address(_request(empty)) == "10.0.0.9"


def test_global_limiter_keys_on_visitor_address() -> None:
    assert limiter._key_func is visitor_address


def _tiny_app() -> FastAPI:
    app = FastAPI()
    local = Limiter(key_func=visitor_address, storage_uri="memory://")
    app.state.limiter = local
    app.add_exception_handler(
        RateLimitExceeded,
        cast(Any, _rate_limit_exceeded_handler),
    )

    @app.get("/ping")
    @local.limit("3/minute")
    async def ping(request: Request) -> dict[str, bool]:
        _ = request
        return {"ok": True}

    return app


async def _hits(
    client: httpx.AsyncClient, headers: dict[str, str], n: int
) -> list[int]:
    return [(await client.get("/ping", headers=headers)).status_code for _ in range(n)]


async def test_visitors_behind_one_host_get_separate_buckets() -> None:
    transport = httpx.ASGITransport(app=_tiny_app(), client=("10.0.0.9", 1))
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        assert await _hits(client, _trusted("198.51.100.1"), 4) == [200, 200, 200, 429]
        # A second visitor through the same host is unaffected.
        assert await _hits(client, _trusted("198.51.100.2"), 3) == [200, 200, 200]
        # The first visitor is still limited.
        assert await _hits(client, _trusted("198.51.100.1"), 1) == [429]


async def test_spoofed_header_cannot_dodge_the_limit() -> None:
    transport = httpx.ASGITransport(app=_tiny_app(), client=("10.0.0.9", 1))
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        # Rotating a forged address (no or wrong secret) stays in one bucket.
        codes = []
        for i in range(4):
            forged = {VISITOR_IP_HEADER: f"192.0.2.{i}"}
            if i % 2:
                forged[VISITOR_SECRET_HEADER] = "guess"
            codes.append((await client.get("/ping", headers=forged)).status_code)
        assert codes == [200, 200, 200, 429]


async def _saturate(
    client: httpx.AsyncClient, url: str, limit: int, headers: dict[str, str]
) -> tuple[int, int]:
    """Return the status of request ``limit`` and of request ``limit + 1``."""
    last_ok = 0
    for _ in range(limit):
        last_ok = (await client.get(url, headers=headers)).status_code
    return last_ok, (await client.get(url, headers=headers)).status_code


async def test_public_flag_route_still_limited_at_600_per_minute(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    url = f"{API}/feature-flags/public/evaluate?keys=a-flag"
    last_ok, over = await _saturate(async_client, url, 600, _trusted(_random_ip()))
    assert last_ok == 200
    assert over == 429
    # Another visitor through the same host still gets through.
    other = (await async_client.get(url, headers=_trusted(_random_ip()))).status_code
    assert other == 200


async def test_public_booking_route_still_limited_at_60_per_minute(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    url = f"{API}/bookings/public/no-such-business"
    last_ok, over = await _saturate(async_client, url, 60, _trusted(_random_ip()))
    assert last_ok == 404
    assert over == 429


def test_non_ascii_secret_fails_open_without_error() -> None:
    headers = {VISITOR_IP_HEADER: "203.0.113.7", VISITOR_SECRET_HEADER: "caf\xe9" * 12}
    assert visitor_address(_request(headers)) == "10.0.0.9"


def test_ipv6_keys_on_the_64_and_ipv4_mapped_maps_to_ipv4() -> None:
    one = visitor_address(_request(_trusted("2001:db8:1:2::1")))
    two = visitor_address(_request(_trusted("2001:db8:1:2:ffff::9")))
    other = visitor_address(_request(_trusted("2001:db8:1:3::1")))
    assert one == two == "2001:db8:1:2::/64"
    assert other != one
    mapped = visitor_address(_request(_trusted("::ffff:1.2.3.4")))
    assert mapped == visitor_address(_request(_trusted("1.2.3.4"))) == "1.2.3.4"


def test_scope_id_is_rejected() -> None:
    assert visitor_address(_request(_trusted("fe80::1%eth0"))) == "10.0.0.9"


def test_auth_routes_ignore_the_visitor_header() -> None:
    for path in (f"{API}/auth/login", f"{API}/auth/onboarding/issue", f"{API}/auth"):
        assert visitor_address(_request(_trusted("203.0.113.7"), path=path)) == (
            "10.0.0.9"
        )
    other = f"{API}/authors"
    assert visitor_address(_request(_trusted("203.0.113.7"), path=other)) == (
        "203.0.113.7"
    )


def test_short_secret_is_treated_as_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", "short")
    headers = {VISITOR_IP_HEADER: "203.0.113.7", VISITOR_SECRET_HEADER: "short"}
    assert visitor_address(_request(headers)) == "10.0.0.9"


def test_short_secret_logs_one_startup_warning_without_the_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", "tooshortvalue")
    logged = MagicMock()
    monkeypatch.setattr(rate_limit, "logger", logged)
    assert rate_limit.warn_if_secret_too_short() is True
    logged.warning.assert_called_once()
    assert "tooshortvalue" not in str(logged.warning.call_args)
    monkeypatch.setattr(settings, "TRUSTED_WEB_SECRET", "")
    assert rate_limit.warn_if_secret_too_short() is False


async def test_turnstile_survives_non_ascii_secret_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[str | None] = []

    async def fake_verify(
        _token: str, ip: str | None, _secret: str | None = None
    ) -> bool:
        seen.append(ip)
        return True

    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", "k")
    monkeypatch.setattr(turnstile, "verify_turnstile", fake_verify)
    headers = {VISITOR_IP_HEADER: "203.0.113.7", VISITOR_SECRET_HEADER: "caf\xe9" * 12}
    await turnstile.require_turnstile(_request(headers), "tok")
    assert seen == ["10.0.0.9"]


async def test_non_ascii_secret_header_gets_a_normal_response(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    url = f"{API}/bookings/public/no-such-business"
    bad = [
        (VISITOR_IP_HEADER.encode(), b"203.0.113.7"),
        (VISITOR_SECRET_HEADER.encode(), b"caf\xe9" * 12),
    ]
    assert (await async_client.get(url, headers=bad)).status_code == 404
