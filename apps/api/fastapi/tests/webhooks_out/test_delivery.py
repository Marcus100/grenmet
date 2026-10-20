"""Fan-out, signed delivery, retry, dead letters and auto-disable on the real outbox."""

import json
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now
from src.utils.signing import verify_timestamped
from src.webhooks_out import service
from src.webhooks_out.models import (
    DeliveryStatus,
    EndpointStatus,
    WebhookDelivery,
    WebhookEndpoint,
)
from src.webhooks_out.schemas import WebhookEndpointCreate
from tests.webhooks_out.support import RECEIVER, Receiver, Resolver, setup_org

TOPIC = service.DELIVER_TOPIC
BOOKING = {"booking_id": "bk_1", "status": "confirmed"}


async def _endpoint(
    db: AsyncSession,
    admin,
    org,
    *,
    url: str = RECEIVER,
    events: list[str] | None = None,
) -> tuple[WebhookEndpoint, str]:
    endpoint, secret = await service.create_endpoint(
        db,
        admin,
        organisation_id=org.id,
        payload=WebhookEndpointCreate(url=url, event_types=events or ["*"]),
    )
    await db.commit()
    return endpoint, secret


async def _drain(db: AsyncSession, now=None) -> int:
    return await outbox.drain(db, only_topics=[TOPIC], now=now)


async def _fresh(db: AsyncSession, model, key: str):
    return await db.scalar(
        select(model).where(model.id == key).execution_options(populate_existing=True)
    )


async def _emit(db: AsyncSession, org, event_type="booking.created", **kwargs) -> int:
    count = await service.emit_event(db, org.id, event_type, BOOKING, **kwargs)
    await db.commit()
    return count


async def _rows(db: AsyncSession, topic: str) -> list[Outbox]:
    return list(
        await db.scalars(
            select(Outbox)
            .where(Outbox.topic == topic)
            .execution_options(populate_existing=True)
        )
    )


# --- fan-out ---------------------------------------------------------------------------


async def test_fan_out_targets_active_matching_endpoints_and_dedupes(
    db_async: AsyncSession, resolver: Resolver
) -> None:
    _ = resolver
    admin, org = await setup_org(db_async)
    star, _s = await _endpoint(db_async, admin, org, events=["*"])
    booking, _s = await _endpoint(
        db_async, admin, org, url="https://b.example.com/h", events=["booking.created"]
    )
    await _endpoint(
        db_async,
        admin,
        org,
        url="https://c.example.com/h",
        events=["payment.succeeded"],
    )
    off, _s = await _endpoint(
        db_async, admin, org, url="https://d.example.com/h", events=["*"]
    )
    off.status = EndpointStatus.DISABLED.value
    await db_async.commit()

    assert await _emit(db_async, org, event_id="evt_fixed") == 2
    rows = await _rows(db_async, TOPIC)
    assert {r.dedupe_key for r in rows} == {
        f"evt_fixed:{star.id}",
        f"evt_fixed:{booking.id}",
    }
    # The same event id again queues nothing.
    assert await _emit(db_async, org, event_id="evt_fixed") == 0
    assert len(await _rows(db_async, TOPIC)) == 2
    deliveries = list(await db_async.scalars(select(WebhookDelivery)))
    assert {d.status for d in deliveries} == {DeliveryStatus.PENDING.value}


async def test_emit_skips_unentitled_organisations_and_rejects_bad_input(
    db_async: AsyncSession, resolver: Resolver
) -> None:
    _ = resolver
    admin, org = await setup_org(db_async)
    await _endpoint(db_async, admin, org)
    _a, other = await setup_org(db_async, "No Hooks Co", apps=())
    assert await _emit(db_async, other) == 0
    with pytest.raises(ValueError, match="Unknown webhook event type"):
        await service.emit_event(db_async, org.id, "booking.exploded", BOOKING)
    with pytest.raises(ValueError):
        await service.emit_event(db_async, org.id, "booking.created", {"nope": 1})


# --- delivery ---------------------------------------------------------------------------


async def test_delivery_is_signed_pinned_and_clears_the_payload(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    endpoint, secret = await _endpoint(db_async, admin, org)
    endpoint.consecutive_failures = 3
    await db_async.commit()
    await _emit(db_async, org, event_id="evt_ok")

    assert await _drain(db_async) == 1
    request = receiver.requests[0]
    body = request.content
    assert request.headers["Barrels-Event-Id"] == "evt_ok"
    assert request.headers["Barrels-Event-Type"] == "booking.created"
    assert verify_timestamped(secret, body, request.headers["Barrels-Signature"])
    assert not verify_timestamped(
        "whsec_other", body, request.headers["Barrels-Signature"]
    )
    payload = json.loads(body)
    assert set(payload) == {"id", "type", "created_at", "organisation_id", "data"}
    assert payload["organisation_id"] == org.id
    assert payload["data"]["booking_id"] == "bk_1"
    # Connected to the validated address; the hostname rides in Host.
    assert request.url.host == "93.184.216.34"
    assert request.headers["Host"] == "hooks.example.com"

    delivery = (await db_async.scalars(select(WebhookDelivery))).one()
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.SUCCEEDED.value
    assert delivery.attempts == 1
    assert delivery.response_status == 200
    assert (
        await _fresh(db_async, WebhookEndpoint, endpoint.id)
    ).consecutive_failures == 0
    (row,) = await _rows(db_async, TOPIC)
    assert row.status == OutboxStatus.DONE.value
    assert row.payload == {}


async def test_failure_backs_off_then_goes_dead_through_the_outbox(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    endpoint, _s = await _endpoint(db_async, admin, org)
    receiver.handler = lambda _: httpx.Response(500, text="secret body is not stored")
    await _emit(db_async, org)
    start = utc_now()

    assert await _drain(db_async, start) == 0
    delivery = (await db_async.scalars(select(WebhookDelivery))).one()
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.FAILED.value
    assert delivery.attempts == 1
    assert delivery.response_status == 500
    assert delivery.last_error == "HTTP 500"
    assert delivery.next_attempt_at is not None
    # Not due again straight away: the outbox backs off 60 s.
    assert await _drain(db_async, start + timedelta(seconds=30)) == 0
    assert len(receiver.requests) == 1

    moment = start
    for _ in range(outbox.MAX_ATTEMPTS - 1):
        moment += timedelta(hours=2)
        await _drain(db_async, moment)
    assert len(receiver.requests) == outbox.MAX_ATTEMPTS
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.DEAD.value
    (row,) = await _rows(db_async, TOPIC)
    assert row.status == OutboxStatus.DEAD.value
    assert (
        await _fresh(db_async, WebhookEndpoint, endpoint.id)
    ).consecutive_failures == 5


async def test_redirects_are_not_followed(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    await _endpoint(db_async, admin, org)
    receiver.handler = lambda _: httpx.Response(
        302, headers={"Location": "https://169.254.169.254/latest/meta-data"}
    )
    await _emit(db_async, org)
    await _drain(db_async)
    assert len(receiver.requests) == 1
    delivery = (await db_async.scalars(select(WebhookDelivery))).one()
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.FAILED.value
    assert delivery.last_error == "redirect not followed"


async def test_dns_rebinding_is_caught_at_delivery(
    db_async: AsyncSession, receiver: Receiver, resolver: Resolver
) -> None:
    admin, org = await setup_org(db_async)
    await _endpoint(db_async, admin, org)  # public when registered
    resolver.answers["hooks.example.com"] = ["127.0.0.1"]  # then it flips
    await _emit(db_async, org)
    await _drain(db_async)
    assert receiver.requests == []
    delivery = (await db_async.scalars(select(WebhookDelivery))).one()
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.FAILED.value
    assert (delivery.last_error or "").startswith("blocked")


async def test_a_mixed_dns_answer_is_refused(
    db_async: AsyncSession, receiver: Receiver, resolver: Resolver
) -> None:
    admin, org = await setup_org(db_async)
    await _endpoint(db_async, admin, org)
    resolver.answers["hooks.example.com"] = ["93.184.216.34", "10.0.0.5"]
    await _emit(db_async, org)
    await _drain(db_async)
    assert receiver.requests == []


async def test_410_disables_the_endpoint_and_tells_the_admins(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    endpoint, _s = await _endpoint(db_async, admin, org)
    receiver.handler = lambda _: httpx.Response(410)
    await _emit(db_async, org)
    assert await _drain(db_async) == 1
    refreshed = await _fresh(db_async, WebhookEndpoint, endpoint.id)
    assert refreshed.status == EndpointStatus.DISABLED.value
    assert "410" in (refreshed.disabled_reason or "")
    delivery = (await db_async.scalars(select(WebhookDelivery))).one()
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.DEAD.value
    recipients = [r.payload["to_email"] for r in await _rows(db_async, "email.send")]
    assert recipients == [admin.email.lower()]

    # Later events skip the disabled endpoint.
    assert await _emit(db_async, org) == 0


async def test_auto_disable_after_fifteen_failures_in_a_row(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    endpoint, _s = await _endpoint(db_async, admin, org)
    receiver.handler = lambda _: httpx.Response(503)
    moment = utc_now()
    for _ in range(3):  # three events x five attempts
        await _emit(db_async, org)
    for _ in range(outbox.MAX_ATTEMPTS):
        moment += timedelta(hours=2)
        await _drain(db_async, moment)
    refreshed = await _fresh(db_async, WebhookEndpoint, endpoint.id)
    assert refreshed.status == EndpointStatus.DISABLED.value
    assert refreshed.disabled_reason is not None
    assert "15" in refreshed.disabled_reason
    assert len(receiver.requests) == 15
    # The 15th failure finished its delivery instead of leaving it to retry.
    statuses = [row.status for row in await _rows(db_async, TOPIC)]
    assert OutboxStatus.PENDING.value not in statuses
    emails = await _rows(db_async, "email.send")
    assert [r.payload["to_email"] for r in emails] == [admin.email.lower()]
    assert emails[0].payload["transactional"] is True
    assert endpoint.id in emails[0].payload["html"]

    # A repeat attempt on a disabled endpoint sends nothing.
    await _emit(db_async, org)
    assert len(receiver.requests) == 15


async def test_a_success_resets_the_failure_streak(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    endpoint, _s = await _endpoint(db_async, admin, org)
    receiver.handler = lambda _: httpx.Response(500)
    await _emit(db_async, org)
    moment = utc_now()
    await _drain(db_async, moment)
    assert (
        await _fresh(db_async, WebhookEndpoint, endpoint.id)
    ).consecutive_failures == 1
    receiver.handler = lambda _: httpx.Response(204)
    await _drain(db_async, moment + timedelta(hours=2))
    assert (
        await _fresh(db_async, WebhookEndpoint, endpoint.id)
    ).consecutive_failures == 0


async def test_deleted_endpoint_drops_queued_events(
    db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    endpoint, _s = await _endpoint(db_async, admin, org)
    await _emit(db_async, org)
    await service.delete_endpoint(
        db_async, admin, organisation_id=org.id, endpoint_id=endpoint.id
    )
    await db_async.commit()
    assert await _drain(db_async) == 1
    assert receiver.requests == []
