"""Turnstile verifier and enforcement on every public form."""

import json
import uuid
from collections.abc import Callable
from unittest.mock import MagicMock
from urllib.parse import parse_qs

import httpx
import pytest
from starlette.requests import Request

from src import turnstile

type Handler = Callable[[httpx.Request], httpx.Response]
type Form = tuple[str, dict[str, object]]


def _request(ip: str = "203.0.113.9") -> Request:
    return Request({"type": "http", "headers": [], "client": (ip, 1234)})


def _use(monkeypatch: pytest.MonkeyPatch, handler: Handler) -> None:
    monkeypatch.setattr(turnstile, "_transport", httpx.MockTransport(handler))


def _enable(monkeypatch: pytest.MonkeyPatch, secret: str | None = "s3cret") -> None:
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", secret)


def _ok(_: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"success": True})


def _rejected(_: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200, json={"success": False, "error-codes": ["invalid-input-response"]}
    )


async def test_verify_success_posts_secret_token_and_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _ok(request)

    _enable(monkeypatch)
    _use(monkeypatch, handler)
    assert await turnstile.verify_turnstile("tok", "203.0.113.9") is True
    [request] = seen
    assert str(request.url) == turnstile.SITEVERIFY_URL
    assert parse_qs(request.content.decode()) == {
        "secret": ["s3cret"],
        "response": ["tok"],
        "remoteip": ["203.0.113.9"],
    }


async def test_verify_rejected_token(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable(monkeypatch)
    _use(monkeypatch, _rejected)
    assert await turnstile.verify_turnstile("tok", None) is False


async def test_verify_timeout_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    _enable(monkeypatch)
    _use(monkeypatch, handler)
    assert await turnstile.verify_turnstile("tok", None) is False


async def test_verify_server_error_and_bad_body_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable(monkeypatch)
    _use(monkeypatch, lambda _: httpx.Response(500))
    assert await turnstile.verify_turnstile("tok", None) is False
    _use(monkeypatch, lambda _: httpx.Response(200, text="not json"))
    assert await turnstile.verify_turnstile("tok", None) is False


async def test_disabled_skips_the_check(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", False)

    def handler(_: httpx.Request) -> httpx.Response:
        raise AssertionError("Cloudflare must not be called when disabled")

    _use(monkeypatch, handler)
    await turnstile.require_turnstile(_request(), None)


async def test_enabled_without_secret_is_503(monkeypatch: pytest.MonkeyPatch) -> None:
    # Patch the module logger, not caplog: other tests in a shard may
    # reconfigure logging, and the alert must not depend on test order.
    logged = MagicMock()
    monkeypatch.setattr(turnstile, "logger", logged)
    _enable(monkeypatch, secret=None)
    with pytest.raises(turnstile.VerificationUnavailableError) as info:
        await turnstile.require_turnstile(_request(), "tok")
    assert info.value.status_code == 503
    assert "TURNSTILE_SECRET_KEY" in logged.error.call_args.args[0]


async def test_enabled_requires_a_token(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable(monkeypatch)
    _use(monkeypatch, _ok)
    with pytest.raises(turnstile.VerificationFailedError):
        await turnstile.require_turnstile(_request(), None)


def _forms() -> list[Form]:
    """Every public form. Tests that post them take ``db_async``, which seeds the
    default public sites (``barrels``, ``signal``) the site routes need."""
    unique = uuid.uuid4().hex[:10]
    return [
        (
            "/api/v1/contact/messages",
            {
                "site": "mbia",
                "name": "Jane Reader",
                "email": f"jane-{unique}@example.com",
                "subject": f"Turnstile {unique}",
                "message": "Please check the bot gate works.",
            },
        ),
        (
            "/api/v1/contact/data-requests",
            {
                "name": "Dr Ada Researcher",
                "email": f"ada-{unique}@example.com",
                "organisation": f"Org {unique}",
                "purpose": "Flood risk study for the south coast.",
                "parameters": ["rainfall"],
                "stations": "Maurice Bishop International Airport",
                "period_start": "2000-01-01",
                "period_end": "2020-12-31",
                "data_format": "csv",
                "intended_use": "academic",
                "consent": True,
            },
        ),
        (
            "/api/v1/subscriptions",
            {"list_key": "signal", "email": f"reader-{unique}@example.com"},
        ),
        (
            "/api/v1/contact/public/barrels/messages",
            {
                "name": "Jane Reader",
                "email": f"jane-site-{unique}@example.com",
                "subject": f"Site turnstile {unique}",
                "message": "Please check the site bot gate works.",
            },
        ),
        (
            "/api/v1/subscriptions/public/signal",
            {"email": f"reader-site-{unique}@example.com"},
        ),
        (
            "/api/v1/feedback",
            {"site": "docs", "page_path": f"/turnstile/{unique}", "helpful": True},
        ),
    ]


@pytest.mark.usefixtures("db_async")
async def test_every_form_enforces_when_enabled(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable(monkeypatch)
    _use(monkeypatch, _rejected)
    for url, payload in _forms():
        missing = await async_client.post(url, json=payload)
        assert missing.status_code == 400, url
        assert missing.json() == {"detail": "Verification failed"}, url
        rejected = await async_client.post(
            url, json={**payload, "turnstile_token": "bad"}
        )
        assert rejected.status_code == 400, url
        assert "error-codes" not in json.dumps(rejected.json()), url


@pytest.mark.usefixtures("db_async")
async def test_every_form_accepts_a_verified_token(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable(monkeypatch)
    _use(monkeypatch, _ok)
    for url, payload in _forms():
        resp = await async_client.post(url, json={**payload, "turnstile_token": "ok"})
        assert resp.status_code == 202, (url, resp.text)


@pytest.mark.usefixtures("db_async")
async def test_forms_open_when_disabled(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", False)
    for url, payload in _forms():
        resp = await async_client.post(url, json=payload)
        assert resp.status_code == 202, (url, resp.text)


@pytest.mark.usefixtures("db_async")
async def test_cloudflare_outage_blocks_forms(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    _enable(monkeypatch)
    _use(monkeypatch, handler)
    for url, payload in _forms():
        resp = await async_client.post(url, json={**payload, "turnstile_token": "ok"})
        assert resp.status_code == 400, url


class _Policy:
    def __init__(self, mode: str, secret: str | None = None) -> None:
        self.mode = mode
        self.secret = secret


async def test_site_policy_off_skips_even_when_globally_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable(monkeypatch)
    _use(monkeypatch, _rejected)
    await turnstile.require_turnstile(_request(), None, _Policy("off"))


async def test_site_policy_enforce_uses_the_site_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", False)
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _ok(request)

    _use(monkeypatch, handler)
    await turnstile.require_turnstile(_request(), "tok", _Policy("enforce", "site-s"))
    assert parse_qs(seen[0].content.decode())["secret"] == ["site-s"]
    with pytest.raises(turnstile.VerificationFailedError):
        await turnstile.require_turnstile(
            _request(), None, _Policy("enforce", "site-s")
        )


async def test_site_policy_enforce_without_secret_is_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable(monkeypatch)
    with pytest.raises(turnstile.VerificationUnavailableError):
        await turnstile.require_turnstile(_request(), "tok", _Policy("enforce"))


async def test_site_policy_inherit_follows_global_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", False)
    await turnstile.require_turnstile(_request(), None, _Policy("inherit"))
    _enable(monkeypatch)
    with pytest.raises(turnstile.VerificationFailedError):
        await turnstile.require_turnstile(_request(), None, _Policy("inherit"))
