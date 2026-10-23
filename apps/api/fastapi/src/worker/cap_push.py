"""CAP browser-push channel: one Web Push per subscribed browser.

Runs as the ``publish.push`` job. Browsers that already received the alert on an
earlier attempt (``job.result["delivered"]``) are not pushed again. A 404/410
removes the subscription; other failures are retried by the dispatcher.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent
from src.push import service as push_service
from src.push.config import push_settings
from src.subscriptions.constants import CAP_ALERTS_LIST_KEY
from src.worker.cap_content import AlertContent, load_content
from src.worker.publishers import PublishError, _prior_delivered, _resolve_alert

logger = logging.getLogger(__name__)

_BODY_LIMIT = 140


def build_payload(content: AlertContent) -> dict[str, str]:
    if content.msg_type == "Cancel":
        detail = f"Cancelled. {content.areas}".strip()
    elif content.areas:
        detail = f"{content.severity}: {content.areas}"
    else:
        detail = content.severity
    return {
        "title": content.headline[:120],
        "body": detail[:_BODY_LIMIT],
        "url": content.alert_link,
        "tag": content.identifier[:100],
    }


async def publish_push(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    _ = http_client
    if not push_settings.enabled:
        return {"skipped": True, "reason": "web push not configured", "kind": job.kind}
    alert = await _resolve_alert(session=session, job=job)
    content = await load_content(session=session, alert=alert)
    if content is None:
        raise PublishError({"error": "alert has no info block to push"})
    payload = build_payload(content)

    already = _prior_delivered(job.result)
    delivered: list[str] = list(already)
    removed = 0
    failures: list[dict[str, str]] = []
    subscriptions = await push_service.list_subscriptions(
        session=session, list_key=CAP_ALERTS_LIST_KEY
    )
    try:
        for subscription in subscriptions:
            sub_id = str(subscription.id)
            if sub_id in already:
                continue
            outcome = await push_service.send(subscription, payload)
            state = await push_service.record_outcome(
                session=session, subscription=subscription, outcome=outcome
            )
            if state == "sent":
                delivered.append(sub_id)
            elif state == "removed":
                removed += 1
            else:
                failures.append(
                    {"subscription_id": sub_id, "error": outcome.error or ""}
                )
    except Exception as exc:  # noqa: BLE001 - keep the delivered list for the retry
        raise PublishError(
            {
                "delivered": delivered,
                "removed": removed,
                "failures": failures,
                "error": type(exc).__name__,
            }
        ) from exc
    if failures:
        raise PublishError(
            {"delivered": delivered, "removed": removed, "failures": failures}
        )
    return {"delivered": delivered, "count": len(delivered), "removed": removed}
