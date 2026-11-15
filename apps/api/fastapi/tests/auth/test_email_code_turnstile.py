"""Cloudflare Turnstile on the emailed sign-in code start step (#959).

``AUTH_TURNSTILE_SECRET_KEY`` unset: no check, so local dev and tests work.
Set: ``POST /auth/email-code/start`` needs a token Cloudflare accepts, and the
refusal is the same generic 400 for every address. Cloudflare is never called
for real: the verifier's transport is a mock.
"""

from collections.abc import Callable

import httpx
import pytest

from src import turnstile
from src.auth import app_service

BASE = "/api/v1/auth"
START = f"{BASE}/email-code/start"
SIGNUP = f"{BASE}/users/signup"

type Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture(autouse=True)
def _no_mail_and_count_codes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    monkeypatch.setattr(app_service, "send_email", lambda **_: None)
    issued: list[str] = []
    real = app_service._issue_code

    async def counting(*args, **kwargs):
        issued.append(kwargs.get("target", ""))
        return await real(*args, **kwargs)

    monkeypatch.setattr(app_service, "_issue_code", counting)
    return issued


def _cloudflare(monkeypatch: pytest.MonkeyPatch, *, accepts: bool) -> list[str]:
    """Route siteverify to a mock; returns the tokens it was asked about."""
    tokens: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        form = httpx.QueryParams(request.content.decode())
        tokens.append(form.get("response", ""))
        assert form.get("secret") == "auth-secret"
        return httpx.Response(200, json={"success": accepts})

    monkeypatch.setattr(turnstile, "_transport", httpx.MockTransport(handler))
    return tokens


def _enable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        turnstile.turnstile_settings, "AUTH_TURNSTILE_SECRET_KEY", "auth-secret"
    )


@pytest.mark.asyncio
async def test_no_secret_skips_the_check(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes
):
    _ = db_async
    monkeypatch.setattr(turnstile.turnstile_settings, "AUTH_TURNSTILE_SECRET_KEY", None)
    tokens = _cloudflare(monkeypatch, accepts=False)

    response = await async_client.post(START, json={"email": "free@example.com"})

    assert response.status_code == 200
    assert tokens == []
    assert _no_mail_and_count_codes == ["free@example.com"]


@pytest.mark.asyncio
async def test_global_form_switch_does_not_turn_on_the_sign_in_check(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes
):
    """The contact-form switch stays separate: sign-in needs its own secret."""
    _ = db_async
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", "forms")
    monkeypatch.setattr(turnstile.turnstile_settings, "AUTH_TURNSTILE_SECRET_KEY", None)

    response = await async_client.post(START, json={"email": "forms@example.com"})

    assert response.status_code == 200
    assert _no_mail_and_count_codes == ["forms@example.com"]


@pytest.mark.asyncio
@pytest.mark.parametrize("body_extra", [{}, {"turnstile_token": ""}])
async def test_secret_set_refuses_a_missing_token(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes, body_extra
):
    _ = db_async
    _enable(monkeypatch)
    tokens = _cloudflare(monkeypatch, accepts=True)

    response = await async_client.post(
        START, json={"email": "bot@example.com", **body_extra}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Verification failed"
    assert tokens == []
    assert _no_mail_and_count_codes == []


@pytest.mark.asyncio
async def test_secret_set_refuses_a_rejected_token_generically(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes
):
    """Known and unknown addresses get the same refusal: nothing is revealed."""
    _ = db_async
    _enable(monkeypatch)
    tokens = _cloudflare(monkeypatch, accepts=False)

    replies = [
        await async_client.post(
            START, json={"email": email, "turnstile_token": "forged"}
        )
        for email in ("nobody@example.com", "admin@example.com")
    ]

    assert [reply.status_code for reply in replies] == [400, 400]
    assert replies[0].json() == replies[1].json()
    assert tokens == ["forged", "forged"]
    assert _no_mail_and_count_codes == []


@pytest.mark.asyncio
async def test_secret_set_accepts_a_valid_token(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes
):
    _ = db_async
    _enable(monkeypatch)
    tokens = _cloudflare(monkeypatch, accepts=True)

    response = await async_client.post(
        START, json={"email": "human@example.com", "turnstile_token": "good"}
    )

    assert response.status_code == 200
    assert tokens == ["good"]
    assert _no_mail_and_count_codes == ["human@example.com"]


@pytest.mark.asyncio
async def test_secret_set_closes_the_retired_signup_route(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes
):
    """The retired sign-up also sends a code and cannot carry a token."""
    _ = db_async
    _enable(monkeypatch)
    _cloudflare(monkeypatch, accepts=True)

    response = await async_client.post(
        SIGNUP,
        json={
            "email": "legacy@example.com",
            "username": "legacyperson",
            "password": "password123456",
            "first_name": "Lee",
            "last_name": "Gacy",
        },
    )

    assert response.status_code == 400
    assert _no_mail_and_count_codes == []


@pytest.mark.asyncio
async def test_app_scoped_start_is_not_affected(
    async_client, db_async, monkeypatch, _no_mail_and_count_codes
):
    """Per-app sign-in (Events) keeps its own flow; the check is the account's."""
    _ = db_async
    _enable(monkeypatch)
    tokens = _cloudflare(monkeypatch, accepts=False)

    response = await async_client.post(
        f"{BASE}/apps/events/email-code/start", json={"email": "fan@example.com"}
    )

    assert response.status_code == 200
    assert tokens == []
