"""Resend webhook receiver (src/webhooks/router.py): Svix signature verification.

Covers constant-time verification, tamper rejection, and the fail-closed policy
when RESEND_WEBHOOK_SECRET is unset outside the local environment.
"""

import base64
import hashlib
import hmac
import json
import time

import httpx
import pytest

from src.config import settings
from src.email_config import email_settings

_URL = "/api/v1/webhooks/resend"
_SECRET = "whsec_" + base64.b64encode(b"test-signing-secret-0123456789").decode()
_BODY = json.dumps({"type": "email.delivered", "data": {"email_id": "abc"}})


def _sign(body: str, svix_id: str, ts: str, secret: str) -> str:
    raw_key = base64.b64decode(secret.removeprefix("whsec_"))
    to_sign = f"{svix_id}.{ts}.{body}"
    digest = hmac.new(raw_key, to_sign.encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def _headers(signature: str, ts: str, svix_id: str = "msg_1") -> dict[str, str]:
    return {
        "svix-id": svix_id,
        "svix-timestamp": ts,
        "svix-signature": signature,
        "content-type": "application/json",
    }


async def test_valid_signature_accepted(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", _SECRET)
    ts = str(int(time.time()))
    sig = _sign(_BODY, "msg_1", ts, _SECRET)

    resp = await async_client.post(_URL, content=_BODY, headers=_headers(sig, ts))
    assert resp.status_code == 200
    assert resp.json() == {"received": True}


async def test_tampered_signature_rejected(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", _SECRET)
    ts = str(int(time.time()))
    sig = _sign(_BODY, "msg_1", ts, _SECRET)
    tampered = sig[:-4] + ("aaaa" if not sig.endswith("aaaa") else "bbbb")

    resp = await async_client.post(_URL, content=_BODY, headers=_headers(tampered, ts))
    assert resp.status_code == 401


async def test_missing_headers_rejected(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", _SECRET)
    resp = await async_client.post(
        _URL, content=_BODY, headers={"content-type": "application/json"}
    )
    assert resp.status_code == 401


async def test_stale_timestamp_rejected(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", _SECRET)
    stale = str(int(time.time()) - 10_000)
    sig = _sign(_BODY, "msg_1", stale, _SECRET)

    resp = await async_client.post(_URL, content=_BODY, headers=_headers(sig, stale))
    assert resp.status_code == 401


async def test_unset_secret_fails_closed_outside_local(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", None)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    resp = await async_client.post(
        _URL, content=_BODY, headers={"content-type": "application/json"}
    )
    assert resp.status_code == 401


async def test_unset_secret_allowed_in_local(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", None)
    monkeypatch.setattr(settings, "ENVIRONMENT", "local")

    resp = await async_client.post(
        _URL, content=_BODY, headers={"content-type": "application/json"}
    )
    assert resp.status_code == 200
