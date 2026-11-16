"""Signed-in routes key their rate limit on the account, not on the connecting address.

A web host calls the API server-side, so every signed-in user of that host shares one
connecting address. These tests need no database: the account is faked through the
``get_account_user`` dependency.
"""

from types import SimpleNamespace
from typing import Any, cast

import httpx
from fastapi import FastAPI, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.dependencies import RateLimitedAccountUser, get_account_user
from src.rate_limit import (
    AsyncSafeLimiter,
    account_address,
    remember_account,
    visitor_address,
)

ACCOUNT_HEADER = "x-test-account"


def _request(client: str = "10.0.0.9") -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "server": ("api", 8000),
            "path": "/x",
            "query_string": b"",
            "headers": [],
            "client": (client, 1234),
        }
    )


def test_account_key_names_the_remembered_account() -> None:
    request = _request()
    remember_account(request, "0b1c3e5a")
    assert account_address(request) == "account:0b1c3e5a"


def test_account_key_falls_back_to_the_visitor_address() -> None:
    assert account_address(_request()) == visitor_address(_request()) == "10.0.0.9"


async def _as_account(request: Request) -> SimpleNamespace:
    return SimpleNamespace(id=request.headers[ACCOUNT_HEADER])


def _tiny_app() -> FastAPI:
    app = FastAPI()
    limiter = AsyncSafeLimiter(key_func=visitor_address, storage_uri="memory://")
    app.state.limiter = limiter
    app.add_exception_handler(
        RateLimitExceeded, cast(Any, _rate_limit_exceeded_handler)
    )
    app.dependency_overrides[get_account_user] = _as_account

    @app.post("/limited")
    @limiter.limit("2/minute", key_func=account_address)
    async def limited(
        *, request: Request, current_user: RateLimitedAccountUser
    ) -> dict[str, bool]:
        _ = request
        return {"ok": bool(current_user.id)}

    return app


async def test_limit_is_per_account_and_accounts_do_not_share_a_bucket() -> None:
    transport = httpx.ASGITransport(app=_tiny_app(), client=("10.0.0.9", 1))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        async def call(account: str) -> int:
            response = await client.post("/limited", headers={ACCOUNT_HEADER: account})
            return response.status_code

        assert [await call("alice"), await call("alice")] == [200, 200]
        assert await call("alice") == 429
        # Same connecting address as alice, so a shared bucket would refuse this one.
        assert await call("bob") == 200
