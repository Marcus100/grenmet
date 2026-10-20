"""Signed delivery of webhook events and the ``webhook.deliver`` outbox handler.

Request: ``POST`` JSON ``{id, type, created_at, organisation_id, data}`` with
``Barrels-Signature: t=<unix>,v1=<hmac-sha256 of "t.body">``, ``Barrels-Event-Id``
and ``Barrels-Event-Type``; 10 second timeout; redirects are never followed.
Every attempt resolves the host again, requires public addresses only and connects
to the address it validated (the hostname still travels as ``Host`` and TLS server
name), so DNS rebinding cannot steer a delivery to an internal address.

Outcomes: 2xx succeeds. 410 disables the endpoint. Anything else is a failed
attempt: the handler records it and raises ``WebhookDeliveryError`` so the outbox
backs off (60 s doubling to 1 h, dead after ``outbox.MAX_ATTEMPTS``). After
``service.AUTO_DISABLE_AFTER`` failed attempts in a row across deliveries the
endpoint is disabled and its owners and admins are emailed.

Failure bookkeeping is committed before raising, because the outbox rolls the
handler's transaction back on an exception. Neither logs nor ``last_error`` hold
response bodies, payloads or secrets.
"""

import json
import logging
import time
from dataclasses import dataclass
from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.utils import secret_box
from src.utils.datetime import utc_now
from src.utils.signing import sign_timestamped

from . import events, service, ssrf
from .exceptions import WebhookDeliveryError
from .models import DeliveryStatus, EndpointStatus, WebhookDelivery, WebhookEndpoint

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10.0
USER_AGENT = "Barrels-Webhooks/1"
_ERROR_LENGTH = 300


@dataclass(frozen=True)
class SendResult:
    response_status: int | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.response_status is not None and 200 <= self.response_status < 300


def build_body(
    *,
    event_id: str,
    event_type: str,
    created_at: str,
    organisation_id: str,
    data: dict[str, object],
) -> bytes:
    return json.dumps(
        {
            "id": event_id,
            "type": event_type,
            "created_at": created_at,
            "organisation_id": organisation_id,
            "data": data,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()


def _client() -> httpx.AsyncClient:
    """One client per delivery; tests replace this to inject a mock transport."""
    return httpx.AsyncClient(follow_redirects=False, trust_env=False)


def _pinned_url(url: str, address: str) -> str:
    parts = ssrf.parse_url(url)
    host = f"[{address}]" if ":" in address else address
    netloc = f"{host}:{parts.port}" if parts.port else host
    return parts._replace(netloc=netloc).geturl()


async def send(
    *,
    url: str,
    secret: str,
    body: bytes,
    event_id: str,
    event_type: str,
) -> SendResult:
    """One signed POST. Never raises for network or guard failures."""
    try:
        parts = ssrf.parse_url(url)
        assert parts.hostname is not None
        addresses = await ssrf.public_addresses(parts.hostname)
    except ssrf.UnsafeTargetError as exc:
        return SendResult(error=f"blocked: {exc}"[:_ERROR_LENGTH])
    host_header = parts.hostname if not parts.port else f"{parts.hostname}:{parts.port}"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Host": host_header,
        "Barrels-Signature": sign_timestamped(secret, body, int(time.time())),
        "Barrels-Event-Id": event_id,
        "Barrels-Event-Type": event_type,
    }
    try:
        async with _client() as client:
            response = await client.post(
                _pinned_url(url, addresses[0]),
                content=body,
                headers=headers,
                timeout=TIMEOUT_SECONDS,
                extensions={"sni_hostname": parts.hostname},
            )
    except httpx.TimeoutException:
        return SendResult(error="timeout")
    except httpx.HTTPError as exc:
        return SendResult(error=type(exc).__name__)
    error = None
    if not response.is_success:
        error = (
            "redirect not followed"
            if response.is_redirect
            else f"HTTP {response.status_code}"
        )
    return SendResult(response_status=response.status_code, error=error)


async def send_ping(
    endpoint: WebhookEndpoint, *, secret: str
) -> tuple[SendResult, int]:
    """Synchronous test delivery through the same signer. Returns the result and
    the elapsed milliseconds. Does not touch failure counters."""
    event_id = "evt_ping"
    body = build_body(
        event_id=event_id,
        event_type=events.PING,
        created_at=utc_now().isoformat(timespec="seconds") + "Z",
        organisation_id=endpoint.organisation_id,
        data=events.validated_data(events.PING, {}),
    )
    started = time.monotonic()
    result = await send(
        url=endpoint.url,
        secret=secret,
        body=body,
        event_id=event_id,
        event_type=events.PING,
    )
    return result, int((time.monotonic() - started) * 1000)


@outbox.handler(service.DELIVER_TOPIC)
async def deliver(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    payload = message.payload
    delivery = await session.scalar(
        select(WebhookDelivery).where(WebhookDelivery.id == payload["delivery_id"])
    )
    endpoint = await session.scalar(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.id == payload["endpoint_id"])
        .with_for_update()
    )
    if delivery is None or endpoint is None:
        return  # endpoint deleted since the event was queued
    now = utc_now()
    if endpoint.status != EndpointStatus.ACTIVE.value:
        delivery.status = DeliveryStatus.DEAD.value
        delivery.last_error = "endpoint disabled"
        delivery.next_attempt_at = None
        return
    try:
        secret = service.decrypt_secret(endpoint)
    except secret_box.SecretBoxError:
        result = SendResult(error="signing secret cannot be decrypted")
    else:
        body = build_body(
            event_id=payload["event_id"],
            event_type=payload["event_type"],
            created_at=payload["created_at"],
            organisation_id=endpoint.organisation_id,
            data=payload["data"],
        )
        result = await send(
            url=endpoint.url,
            secret=secret,
            body=body,
            event_id=payload["event_id"],
            event_type=payload["event_type"],
        )

    delivery.attempts += 1
    delivery.response_status = result.response_status
    if result.ok:
        delivery.status = DeliveryStatus.SUCCEEDED.value
        delivery.last_error = None
        delivery.next_attempt_at = None
        endpoint.consecutive_failures = 0
        return
    delivery.last_error = (result.error or "failed")[:_ERROR_LENGTH]
    if result.response_status == 410:
        delivery.status = DeliveryStatus.DEAD.value
        delivery.next_attempt_at = None
        await service.disable_endpoint(
            session, endpoint, reason="The receiver answered 410 Gone"
        )
        return

    endpoint.consecutive_failures += 1
    if endpoint.consecutive_failures >= service.AUTO_DISABLE_AFTER:
        delivery.status = DeliveryStatus.DEAD.value
        delivery.next_attempt_at = None
        await service.disable_endpoint(
            session,
            endpoint,
            reason=(
                f"Disabled after {service.AUTO_DISABLE_AFTER} failed deliveries "
                "in a row"
            ),
        )
        return  # finished: nothing more to retry for a disabled endpoint
    error = delivery.last_error
    if message.attempts + 1 >= outbox.MAX_ATTEMPTS:
        delivery.status = DeliveryStatus.DEAD.value
        delivery.next_attempt_at = None
    else:
        delivery.status = DeliveryStatus.FAILED.value
        delivery.next_attempt_at = now + timedelta(
            seconds=outbox.retry_delay_seconds(message.attempts + 1)
        )
    # The outbox rolls back on an exception; keep the failure record.
    await session.commit()
    raise WebhookDeliveryError(error)
