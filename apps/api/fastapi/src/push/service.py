"""Web Push subscriptions: store, remove, and send to one browser."""

import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi.concurrency import run_in_threadpool
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.utils.datetime import utc_now

from .config import push_settings
from .models import PushSubscription
from .schemas import PushSubscribeRequest

logger = logging.getLogger(__name__)

SUBSCRIBED_MESSAGE = "Browser notifications are on for this device."
UNSUBSCRIBED_MESSAGE = "Browser notifications are off for this device."
_GONE = frozenset({404, 410})
_SEND_TIMEOUT_SECONDS = 10
_TTL_SECONDS = 3600


class PushDisabledError(AppException):
    def __init__(self) -> None:
        super().__init__("Browser notifications are not available.", 503)


async def subscribe(*, session: AsyncSession, body: PushSubscribeRequest) -> None:
    if not push_settings.enabled:
        raise PushDisabledError()
    values = {
        "p256dh": body.keys.p256dh,
        "auth": body.keys.auth,
        "failure_count": 0,
    }
    await session.execute(
        pg_insert(PushSubscription)
        .values(
            id=uuid.uuid4(),
            list_key=body.list_key,
            endpoint=body.endpoint,
            created_at=utc_now(),
            **values,
        )
        .on_conflict_do_update(
            constraint="push_subscription_list_key_endpoint_key", set_=values
        )
    )
    await session.commit()


async def unsubscribe(*, session: AsyncSession, endpoint: str) -> None:
    """Remove the browser everywhere; unknown endpoints are not an error."""
    await session.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    await session.commit()


async def list_subscriptions(
    *, session: AsyncSession, list_key: str
) -> list[PushSubscription]:
    result = await session.scalars(
        select(PushSubscription)
        .where(PushSubscription.list_key == list_key)
        .order_by(PushSubscription.created_at)
    )
    return list(result.all())


@dataclass(frozen=True)
class SendOutcome:
    ok: bool
    gone: bool = False
    error: str | None = None


def _send_blocking(
    subscription: PushSubscription, payload: dict[str, Any]
) -> SendOutcome:
    private = push_settings.WEBPUSH_VAPID_PRIVATE_KEY
    if not (push_settings.enabled and private):
        return SendOutcome(ok=False, error="web push not configured")
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=private.get_secret_value(),
            # webpush() adds the audience to this dict, so never share one.
            vapid_claims={"sub": push_settings.WEBPUSH_CONTACT},
            ttl=_TTL_SECONDS,
            timeout=_SEND_TIMEOUT_SECONDS,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in _GONE:
            return SendOutcome(ok=False, gone=True, error=f"HTTP {status}")
        return SendOutcome(ok=False, error=f"HTTP {status}" if status else "failed")
    except (OSError, ValueError, TypeError, KeyError) as exc:
        return SendOutcome(ok=False, error=type(exc).__name__)
    return SendOutcome(ok=True)


async def send(subscription: PushSubscription, payload: dict[str, Any]) -> SendOutcome:
    """Send one notification. Never raises; the outcome says what happened."""
    return await run_in_threadpool(_send_blocking, subscription, payload)


async def record_outcome(
    *, session: AsyncSession, subscription: PushSubscription, outcome: SendOutcome
) -> str:
    """Update delivery state; returns 'sent', 'removed' or 'failed'. Caller commits."""
    if outcome.ok:
        subscription.last_success_at = utc_now()
        subscription.failure_count = 0
        session.add(subscription)
        return "sent"
    subscription.failure_count += 1
    if outcome.gone or subscription.failure_count >= push_settings.WEBPUSH_MAX_FAILURES:
        await session.delete(subscription)
        return "removed"
    session.add(subscription)
    return "failed"
