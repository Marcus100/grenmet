"""CAP email channel: one non-transactional email per confirmed subscriber.

Runs as the ``publish.email`` job. Idempotent per (alert identifier, subscriber)
through the outbox ``dedupe_key``, so a retried job never mails anyone twice.
Suppressed addresses are skipped here and again when the outbox sends.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.notifications.models import EmailSuppression
from src.subscriptions import service as subscription_service
from src.subscriptions.constants import CAP_ALERTS_LIST_KEY, MAILING_LISTS
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.worker.cap_content import load_content
from src.worker.publishers import PublishError, _resolve_alert

logger = logging.getLogger(__name__)

TEMPLATE = "cap-alert"


async def publish_email(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    _ = http_client
    alert = await _resolve_alert(session=session, job=job)
    content = await load_content(session=session, alert=alert)
    if content is None:
        raise PublishError({"error": "alert has no info block to email"})

    subscribers = (
        await session.scalars(
            select(ListSubscription)
            .outerjoin(
                EmailSuppression,
                # New suppressions keep only the keyed hash; legacy rows the address.
                or_(
                    EmailSuppression.email_hash == ListSubscription.email_hash,
                    EmailSuppression.email == ListSubscription.email,
                ),
            )
            .where(
                ListSubscription.list_key == CAP_ALERTS_LIST_KEY,
                ListSubscription.status == SubscriptionStatus.CONFIRMED.value,
                ListSubscription.email.is_not(None),
                EmailSuppression.id.is_(None),
            )
            .order_by(ListSubscription.created_at)
        )
    ).all()
    list_name = MAILING_LISTS[CAP_ALERTS_LIST_KEY].name
    subject = f"{content.label}: {content.headline}"
    queued = 0
    for subscription in subscribers:
        if subscription.email is None:  # unreachable after the filter; narrows the type
            continue
        created = await notification_service.enqueue_email_once(
            session=session,
            to_email=subscription.email,
            subject=subject,
            dedupe_key=f"cap-alert:{content.identifier}:{subscription.id}",
            template=TEMPLATE,
            props={
                "projectName": email_settings.PROJECT_NAME,
                "listName": list_name,
                "label": content.label,
                "headline": content.headline,
                "event": content.event,
                "severity": content.severity,
                "urgency": content.urgency,
                "certainty": content.certainty,
                "areas": content.areas,
                "effective": content.effective,
                "expires": content.expires,
                "instruction": content.instruction,
                "alertLink": content.alert_link,
                "capLink": content.cap_link,
                "unsubscribeLink": subscription_service.unsubscribe_link(
                    subscription.id
                ),
            },
        )
        queued += int(created)
    logger.info(
        "CAP alert emails queued",
        extra={"queued": queued, "subscribers": len(subscribers)},
    )
    return {
        "queued": queued,
        "already_queued": len(subscribers) - queued,
        "subscribers": len(subscribers),
    }
