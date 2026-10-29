"""Daily climate newsletter fan-out: the ``send_daily_newsletter`` job (07:30 Grenada).

Copies the shape of ``cap_email.py``: one non-transactional email per confirmed,
unsuppressed subscriber, idempotent per (day, subscriber) through the outbox
``dedupe_key``, and sent by the platform outbox with its retries. Batches are
paced with ``run_at`` so a large list drains over minutes. Nothing is queued
unless ``NEWSLETTER_DIGEST_ENABLED`` is set, and a day with nothing to say sends
nothing.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import service as notification_service
from src.notifications.models import EmailSuppression
from src.subscriptions import newsletter
from src.subscriptions import service as subscription_service
from src.subscriptions.config import subscriptions_settings
from src.subscriptions.constants import NEWSLETTER_LIST_KEY, NEWSLETTER_TEMPLATE
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)


async def queue_daily(
    session: AsyncSession, digest: newsletter.Digest, *, now: datetime
) -> int:
    """Queue the digest for every confirmed, unsuppressed subscriber. Caller commits."""
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
                ListSubscription.list_key == NEWSLETTER_LIST_KEY,
                ListSubscription.status == SubscriptionStatus.CONFIRMED.value,
                ListSubscription.email.is_not(None),
                EmailSuppression.id.is_(None),
            )
            .order_by(ListSubscription.created_at, ListSubscription.id)
        )
    ).all()
    batch = subscriptions_settings.NEWSLETTER_BATCH_SIZE
    interval = subscriptions_settings.NEWSLETTER_BATCH_INTERVAL_SECONDS
    # Outbox timestamps are naive UTC (src.utils.datetime.utc_now).
    base = now.astimezone(UTC).replace(tzinfo=None) if now.tzinfo else now
    queued = 0
    # One origin lookup for the whole run; each reader's link differs only by token.
    preferences_base = await subscription_service.site_url_for(
        session, NEWSLETTER_LIST_KEY
    )
    for index, subscription in enumerate(subscribers):
        if subscription.email is None:  # unreachable after the filter; narrows the type
            continue
        created = await notification_service.enqueue_email_once(
            session=session,
            to_email=subscription.email,
            subject=digest.subject,
            dedupe_key=f"newsletter:{digest.day.isoformat()}:{subscription.id}",
            template=NEWSLETTER_TEMPLATE,
            props=newsletter.props(
                digest,
                unsubscribe_link=subscription_service.unsubscribe_link(subscription.id),
                preferences_link=subscription_service.preferences_link(
                    preferences_base, subscription.id
                ),
            ),
            run_at=base + timedelta(seconds=(index // batch) * interval),
        )
        queued += int(created)
    logger.info(
        "Newsletter digest queued",
        extra={"queued": queued, "subscribers": len(subscribers)},
    )
    return queued


async def run_daily(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    alerts_loader: newsletter.AlertsLoader | None = None,
    forecast_loader: newsletter.ForecastLoader | None = None,
    posts_loader: newsletter.PostsLoader | None = None,
) -> int:
    """Compose today's digest and queue it. Returns how many mails were queued."""
    if not subscriptions_settings.NEWSLETTER_DIGEST_ENABLED:
        return 0
    now = now or utc_now()
    digest = await newsletter.compose(
        session,
        now=now,
        alerts_loader=alerts_loader,
        forecast_loader=forecast_loader,
        posts_loader=posts_loader,
    )
    if digest is None:
        logger.info("Newsletter skipped: nothing to say today")
        return 0
    queued = await queue_daily(session, digest, now=now)
    await session.commit()
    return queued
