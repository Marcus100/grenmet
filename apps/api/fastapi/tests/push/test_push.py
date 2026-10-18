"""Web Push: public endpoints, VAPID key generation and per-browser sending."""

import json
import uuid
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pydantic import SecretStr
from pywebpush import WebPushException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.push import service
from src.push.cli import generate_vapid
from src.push.config import push_settings
from src.push.models import PushSubscription

_URL = "/api/v1/push/subscriptions"
_GOOD_ENDPOINT = "https://fcm.googleapis.com/fcm/send/"


def _body(endpoint: str | None = None) -> dict[str, Any]:
    return {
        "list_key": "gms-alerts",
        "endpoint": endpoint or f"{_GOOD_ENDPOINT}{uuid.uuid4().hex}",
        "keys": {"p256dh": "BPubKeyAAAAAAAAAA", "auth": "authsecretAAAA"},
    }


@pytest.fixture
def push_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(push_settings, "WEBPUSH_VAPID_PUBLIC_KEY", "pub-key")
    monkeypatch.setattr(
        push_settings, "WEBPUSH_VAPID_PRIVATE_KEY", SecretStr("priv-key")
    )
    monkeypatch.setattr(push_settings, "WEBPUSH_CONTACT", "mailto:ops@example.test")


@pytest.fixture
def push_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(push_settings, "WEBPUSH_VAPID_PUBLIC_KEY", None)
    monkeypatch.setattr(push_settings, "WEBPUSH_VAPID_PRIVATE_KEY", None)
    monkeypatch.setattr(push_settings, "WEBPUSH_CONTACT", None)


def test_generate_vapid_returns_base64url_pair() -> None:
    public, private = generate_vapid()
    assert len(public) == 87 and public.startswith("B")
    assert len(private) == 43
    assert "=" not in public + private


@pytest.mark.usefixtures("push_off")
async def test_vapid_key_disabled_when_unset(async_client: httpx.AsyncClient) -> None:
    resp = await async_client.get("/api/v1/push/vapid-public-key")
    assert resp.status_code == 200
    assert resp.json() == {"enabled": False, "public_key": None}


@pytest.mark.usefixtures("push_on")
async def test_vapid_key_returned_when_configured(
    async_client: httpx.AsyncClient,
) -> None:
    resp = await async_client.get("/api/v1/push/vapid-public-key")
    assert resp.json() == {"enabled": True, "public_key": "pub-key"}


@pytest.mark.usefixtures("push_off")
async def test_subscribe_is_unavailable_when_disabled(
    async_client: httpx.AsyncClient,
) -> None:
    resp = await async_client.post(_URL, json=_body())
    assert resp.status_code == 503


@pytest.mark.usefixtures("push_on")
async def test_subscribe_stores_and_upserts(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    body = _body()
    assert (await async_client.post(_URL, json=body)).status_code == 201
    body["keys"]["auth"] = "rotatedsecretAA"
    assert (await async_client.post(_URL, json=body)).status_code == 201

    db_async.expire_all()
    rows = (
        await db_async.scalars(
            select(PushSubscription).where(
                PushSubscription.endpoint == body["endpoint"]
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].auth == "rotatedsecretAA"
    assert rows[0].failure_count == 0


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/x",
        "https://169.254.169.254/latest/meta-data",
        "https://evil.example.com/fcm.googleapis.com",
        "https://notfcm.googleapis.com.evil.test/x",
    ],
)
@pytest.mark.usefixtures("push_on")
async def test_subscribe_rejects_unknown_push_services(
    async_client: httpx.AsyncClient, endpoint: str
) -> None:
    resp = await async_client.post(_URL, json=_body(endpoint))
    assert resp.status_code == 422


@pytest.mark.usefixtures("push_on")
async def test_unsubscribe_removes_and_is_idempotent(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    body = _body()
    await async_client.post(_URL, json=body)
    for _ in range(2):
        resp = await async_client.request(
            "DELETE", _URL, json={"endpoint": body["endpoint"]}
        )
        assert resp.status_code == 200
    db_async.expire_all()
    assert (
        await db_async.scalar(
            select(PushSubscription).where(
                PushSubscription.endpoint == body["endpoint"]
            )
        )
    ) is None


def _subscription() -> PushSubscription:
    return PushSubscription(
        list_key="gms-alerts",
        endpoint=f"{_GOOD_ENDPOINT}{uuid.uuid4().hex}",
        p256dh="BPubKeyAAAAAAAAAA",
        auth="authsecretAAAA",
    )


@pytest.mark.usefixtures("push_on")
async def test_send_success_passes_payload_and_vapid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(service, "webpush", lambda **kw: calls.append(kw))
    outcome = await service.send(_subscription(), {"title": "t", "body": "b"})
    assert outcome.ok
    assert json.loads(calls[0]["data"]) == {"title": "t", "body": "b"}
    assert calls[0]["vapid_private_key"] == "priv-key"
    assert calls[0]["vapid_claims"] == {"sub": "mailto:ops@example.test"}


@pytest.mark.parametrize("status", [404, 410])
@pytest.mark.usefixtures("push_on")
async def test_send_marks_gone_on_404_and_410(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    def boom(**_kw: Any) -> None:
        raise WebPushException("gone", response=SimpleNamespace(status_code=status))

    monkeypatch.setattr(service, "webpush", boom)
    outcome = await service.send(_subscription(), {})
    assert outcome.gone and not outcome.ok


@pytest.mark.usefixtures("push_on")
async def test_send_other_failures_are_not_gone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(**_kw: Any) -> None:
        raise WebPushException("busy", response=SimpleNamespace(status_code=503))

    monkeypatch.setattr(service, "webpush", boom)
    outcome = await service.send(_subscription(), {})
    assert not outcome.ok and not outcome.gone and outcome.error == "HTTP 503"


@pytest.mark.usefixtures("push_off")
async def test_send_does_nothing_when_disabled() -> None:
    outcome = await service.send(_subscription(), {})
    assert not outcome.ok and outcome.error == "web push not configured"
