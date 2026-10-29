"""Social posting logic: intake from the CMS, release to the outbox, dry-run handlers
and the staff view. Routers only call this module."""

import logging
import uuid
from datetime import datetime
from typing import Any, Literal, cast
from urllib.parse import urlsplit

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.outbox import Outbox, OutboxMessage, OutboxStatus
from src.utils.datetime import utc_now

from .config import content_distribution_settings
from .constants import (
    AUTOMATED_PLATFORMS,
    IMAGE_REQUIRED_PLATFORMS,
    STATUS_DEAD,
    STATUS_DRY_RUN_SENT,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_SCHEDULED,
    TOPIC_PREFIX,
    WARNING_COLLECTIONS,
    WARNING_PATH_PREFIXES,
)
from .exceptions import (
    SocialCaptionMissing,
    SocialImageRequired,
    SocialPostingNotConfigured,
    SocialWarningNotAllowed,
)
from .models import ContentDelivery
from .schemas import DeliveryAdmin, DeliveryOutcome, DisplayStatus, PostIn

logger = logging.getLogger(__name__)


def dedupe_key(collection: str, slug: str, platform: str) -> str:
    return f"cms:{collection}:{slug}:{platform}"


def _is_warning_link(url: str) -> bool:
    path = urlsplit(url).path.lower()
    return any(
        path == prefix or path.startswith(f"{prefix}/")
        for prefix in WARNING_PATH_PREFIXES
    )


def check_post_rules(body: PostIn) -> None:
    """Refuse official warnings, and posts missing what a platform needs."""
    if body.collection in WARNING_COLLECTIONS or _is_warning_link(body.url):
        raise SocialWarningNotAllowed()
    for platform in body.platforms:
        if platform in IMAGE_REQUIRED_PLATFORMS and not body.image_url:
            raise SocialImageRequired(platform)
        caption = body.captions.for_platform(platform)
        if caption is None or not caption.strip():
            raise SocialCaptionMissing(platform)


def _content(body: PostIn, platform: str, now: datetime) -> dict[str, Any]:
    caption = body.captions.for_platform(platform) or ""
    return {
        "url": body.url,
        "title": body.title,
        "payload": {
            "platform": platform,
            "caption": caption.strip(),
            "summary": body.summary,
            "url": body.url,
            "imageUrl": body.image_url,
        },
        # No publish time means "manual or immediate": due at the moment it arrived.
        "publish_at": body.publish_at if body.publish_at is not None else now,
    }


async def upsert_post(session: AsyncSession, body: PostIn) -> list[DeliveryOutcome]:
    """Create or update one row per platform. Idempotent by dedupe key.

    A row still pending takes every change. A scheduled row takes new copy but keeps
    its time (it is already released). A row that was sent or died is left alone,
    so a re-save never reposts."""
    check_post_rules(body)
    now = utc_now()
    outcomes: list[DeliveryOutcome] = []
    for platform in body.platforms:
        key = dedupe_key(body.collection, body.slug, platform)
        content = _content(body, platform, now)
        inserted = await session.execute(
            pg_insert(ContentDelivery)
            .values(
                id=uuid.uuid4(),
                dedupe_key=key,
                collection=body.collection,
                slug=body.slug,
                platform=platform,
                status=STATUS_PENDING,
                attempts=0,
                created_at=now,
                updated_at=now,
                **content,
            )
            .on_conflict_do_nothing(index_elements=["dedupe_key"])
            .returning(ContentDelivery.id)
        )
        if inserted.scalar_one_or_none() is not None:
            outcomes.append(
                DeliveryOutcome(
                    platform=platform, status=STATUS_PENDING, outcome="created"
                )
            )
            continue
        row = await session.scalar(
            select(ContentDelivery)
            .where(ContentDelivery.dedupe_key == key)
            .with_for_update()
        )
        if row is None:  # pragma: no cover - deleted between the two statements
            continue
        outcome: Literal["updated", "unchanged"]
        if row.status == STATUS_PENDING:
            _apply(row, content, now)
            outcome = "updated"
        elif row.status == STATUS_SCHEDULED:
            copy = {k: v for k, v in content.items() if k != "publish_at"}
            _apply(row, copy, now)
            outcome = "updated"
        else:
            outcome = "unchanged"
        outcomes.append(
            DeliveryOutcome(platform=platform, status=row.status, outcome=outcome)
        )
    await session.commit()
    return outcomes


def _apply(row: ContentDelivery, values: dict[str, Any], now: datetime) -> None:
    for name, value in values.items():
        setattr(row, name, value)
    row.updated_at = now


async def release_due(
    session: AsyncSession, *, now: datetime | None = None, limit: int = 100
) -> int:
    """Queue due automated rows on the platform outbox. The caller commits.

    WhatsApp rows are never released: they wait for an editor to copy them."""
    moment = now or utc_now()
    rows = (
        await session.scalars(
            select(ContentDelivery)
            .where(
                ContentDelivery.status == STATUS_PENDING,
                ContentDelivery.publish_at <= moment,
                ContentDelivery.platform.in_(AUTOMATED_PLATFORMS),
            )
            .order_by(ContentDelivery.publish_at, ContentDelivery.dedupe_key)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    ).all()
    for row in rows:
        await outbox.enqueue(
            session,
            topic=f"{TOPIC_PREFIX}{row.platform}",
            dedupe_key=row.dedupe_key,
            payload={"delivery_id": str(row.id)},
            run_at=moment,
        )
        row.status = STATUS_SCHEDULED
        row.updated_at = moment
    return len(rows)


async def publish(delivery: ContentDelivery) -> str:
    """Post one row to its platform. Dry run: record it and return a dry-run id.

    Live posting is refused until it is built, so the flag alone cannot send."""
    if content_distribution_settings.SOCIAL_POSTING_LIVE:
        raise SocialPostingNotConfigured()
    logger.info(
        "Dry-run social post recorded",
        extra={"platform": delivery.platform, "delivery_id": str(delivery.id)},
    )
    return f"dry-run:{delivery.id}"


async def _locked(
    session: AsyncSession, message: OutboxMessage
) -> ContentDelivery | None:
    row: ContentDelivery | None = await session.scalar(
        select(ContentDelivery)
        .where(ContentDelivery.id == uuid.UUID(message.payload["delivery_id"]))
        .with_for_update()
    )
    return row


async def post_delivery(session: AsyncSession, message: OutboxMessage) -> None:
    """Outbox handler body for social.post.<platform>. Idempotent: a row that is
    no longer scheduled is left alone, so a retry never reposts."""
    row = await _locked(session, message)
    if row is None or row.status != STATUS_SCHEDULED:
        return
    external_id = await publish(row)
    now = utc_now()
    row.status = STATUS_DRY_RUN_SENT
    row.attempts = message.attempts + 1
    row.external_id = external_id
    row.error = None
    row.processed_at = now
    row.updated_at = now


async def dead_letter(
    session: AsyncSession, message: OutboxMessage, error: Exception
) -> None:
    """Runs when the outbox gives up on a row: record why for the editor."""
    row = await _locked(session, message)
    if row is None or row.status != STATUS_SCHEDULED:
        return
    row.status = STATUS_DEAD
    row.attempts = message.attempts + 1
    row.error = (
        error.message[:300]
        if isinstance(error, SocialPostingNotConfigured)
        else type(error).__name__
    )
    row.updated_at = utc_now()


def display_status(
    stored: str, outbox_status: str | None, outbox_attempts: int | None
) -> str:
    """A scheduled row whose outbox has failed at least once is shown as failed
    (the outbox is retrying it). Everything else shows its stored status."""
    if (
        stored == STATUS_SCHEDULED
        and outbox_status == OutboxStatus.PENDING.value
        and (outbox_attempts or 0) > 0
    ):
        return STATUS_FAILED
    return stored


async def list_deliveries(
    session: AsyncSession,
    *,
    offset: int,
    limit: int,
    slug: str | None = None,
    collection: str | None = None,
) -> tuple[list[DeliveryAdmin], int]:
    filters = []
    if slug is not None:
        filters.append(ContentDelivery.slug == slug)
    if collection is not None:
        filters.append(ContentDelivery.collection == collection)
    total = await session.scalar(
        select(func.count()).select_from(ContentDelivery).where(*filters)
    )
    # The outbox join is by topic and dedupe key, so no outbox payload is loaded.
    statement = (
        select(
            ContentDelivery,
            Outbox.status,
            Outbox.attempts,
            Outbox.last_error,
        )
        .outerjoin(
            Outbox,
            and_(
                Outbox.topic == func.concat(TOPIC_PREFIX, ContentDelivery.platform),
                Outbox.dedupe_key == ContentDelivery.dedupe_key,
            ),
        )
        .where(*filters)
        .order_by(ContentDelivery.publish_at.desc(), ContentDelivery.dedupe_key)
        .offset(offset)
        .limit(limit)
    )
    rows = (await session.execute(statement)).all()
    items = []
    for delivery, outbox_status, outbox_attempts, last_error in rows:
        status = display_status(delivery.status, outbox_status, outbox_attempts)
        error = delivery.error
        if status == STATUS_FAILED:
            error = last_error
        items.append(
            DeliveryAdmin(
                id=delivery.id,
                collection=delivery.collection,
                slug=delivery.slug,
                platform=delivery.platform,
                url=delivery.url,
                title=delivery.title,
                status=cast(DisplayStatus, status),
                automated=delivery.platform in AUTOMATED_PLATFORMS,
                attempts=delivery.attempts,
                external_id=delivery.external_id,
                error=error,
                publish_at=delivery.publish_at,
                processed_at=delivery.processed_at,
                updated_at=delivery.updated_at,
            )
        )
    return items, int(total or 0)
