"""Resend bounce and complaint events feed the suppression list (idempotently)."""

import json
import time
import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.email_config import email_settings
from src.notifications.models import EmailSuppression
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from tests.webhooks.test_webhooks import _SECRET, _URL, _headers, _sign


def _address() -> str:
    return f"hook-{uuid.uuid4().hex[:10]}@example.com"


async def _post(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    event: dict[str, object],
    svix_id: str = "msg_1",
) -> httpx.Response:
    monkeypatch.setattr(email_settings, "RESEND_WEBHOOK_SECRET", _SECRET)
    body = json.dumps(event)
    ts = str(int(time.time()))
    sig = _sign(body, svix_id, ts, _SECRET)
    return await client.post(_URL, content=body, headers=_headers(sig, ts, svix_id))


async def _count(db: AsyncSession, email: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(EmailSuppression)
            .where(EmailSuppression.email == email)
        )
        or 0
    )


async def test_hard_bounce_suppresses_address_and_replay_is_idempotent(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = _address()
    event = {
        "type": "email.bounced",
        "data": {
            "email_id": "e1",
            "to": [address.upper()],
            "bounce": {"type": "Permanent"},
        },
    }
    for _ in range(2):  # Svix replays the same event
        resp = await _post(async_client, monkeypatch, event, svix_id="msg_bounce")
        assert resp.status_code == 200

    assert await _count(db_async, address) == 1
    row = await db_async.scalar(
        select(EmailSuppression).where(EmailSuppression.email == address)
    )
    assert row is not None
    assert row.reason == "hard_bounce"
    assert row.source_event_id == "msg_bounce"


async def test_transient_bounce_does_not_suppress(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = _address()
    resp = await _post(
        async_client,
        monkeypatch,
        {
            "type": "email.bounced",
            "data": {
                "email_id": "e2",
                "to": [address],
                "bounce": {"type": "Transient"},
            },
        },
    )
    assert resp.status_code == 200
    assert await _count(db_async, address) == 0


async def test_complaint_suppresses_and_unsubscribes_from_lists(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = _address()
    db_async.add(
        ListSubscription(
            list_key="signal", email=address, status=SubscriptionStatus.CONFIRMED.value
        )
    )
    await db_async.commit()

    resp = await _post(
        async_client,
        monkeypatch,
        {
            "type": "email.complained",
            "data": {"email_id": "e3", "to": f"Reader <{address}>"},
        },
        svix_id="msg_complaint",
    )
    assert resp.status_code == 200

    db_async.expire_all()
    assert await _count(db_async, address) == 1
    sub = await db_async.scalar(
        select(ListSubscription).where(ListSubscription.email == address)
    )
    assert sub is not None
    assert sub.status == SubscriptionStatus.UNSUBSCRIBED.value
    assert sub.unsubscribed_at is not None
