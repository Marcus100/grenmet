"""Social posting logic: intake from the CMS, release to the outbox, the post handlers
(live or dry run, decided per post) and the staff view. Routers only call this module."""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Literal, cast
from urllib.parse import urlsplit

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.feature_flags import service as flag_service
from src.outbox import Outbox, OutboxMessage, OutboxStatus
from src.utils.datetime import utc_now

from . import meta_graph
from .config import PlatformCredentials, content_distribution_settings
from .constants import (
    AUTOMATED_PLATFORMS,
    ERROR_OUTCOME_UNKNOWN,
    IMAGE_REQUIRED_PLATFORMS,
    PLATFORM_FACEBOOK,
    REASON_FLAG_OFF,
    REASON_NO_IMAGE,
    REASON_NOT_CONFIGURED,
    REASON_TOKEN_MALFORMED,
    SOCIAL_LIVE_FLAG,
    STATUS_DEAD,
    STATUS_DRY_RUN_SENT,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_POSTED,
    STATUS_SCHEDULED,
    STATUS_SKIPPED,
    TOPIC_PREFIX,
    WARNING_COLLECTIONS,
    WARNING_PATH_PREFIXES,
)
from .exceptions import (
    SocialCaptionMissing,
    SocialHostNotAllowed,
    SocialImageRequired,
    SocialWarningNotAllowed,
)
from .models import ContentDelivery
from .schemas import DeliveryAdmin, DeliveryOutcome, DisplayStatus, PostIn

# A live publish holds its outbox row this long, so a second worker cannot pick the
# row up while the first is still waiting on Meta (the first commits mid-handler).
IN_FLIGHT_LEASE = timedelta(minutes=10)

logger = logging.getLogger(__name__)


def dedupe_key(collection: str, slug: str, platform: str) -> str:
    return f"cms:{collection}:{slug}:{platform}"


def _is_warning_link(url: str) -> bool:
    path = urlsplit(url).path.lower()
    return any(
        path == prefix or path.startswith(f"{prefix}/")
        for prefix in WARNING_PATH_PREFIXES
    )


def _host(url: str) -> str | None:
    # urlsplit lower-cases the hostname; None for a URL with no host.
    return urlsplit(url).hostname


def check_post_rules(body: PostIn) -> None:
    """Refuse official warnings, links and images on unapproved hosts, and posts
    missing what a platform needs. The approved hosts are settings, so an empty
    list refuses every post (fail closed)."""
    if body.collection in WARNING_COLLECTIONS or _is_warning_link(body.url):
        raise SocialWarningNotAllowed()
    link_host = _host(body.url)
    if link_host not in content_distribution_settings.link_hosts():
        raise SocialHostNotAllowed("link", link_host)
    if body.image_url is not None:
        image_host = _host(body.image_url)
        if image_host not in content_distribution_settings.image_hosts():
            raise SocialHostNotAllowed("image", image_host)
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


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _error_text(error: Exception) -> str:
    """What staff see for a give-up: the safe Meta message, else the exception type."""
    if isinstance(error, meta_graph.GraphError):
        return error.message[:300]
    return type(error).__name__


def _settle(
    row: ContentDelivery,
    message: OutboxMessage,
    *,
    status: str,
    external_id: str | None = None,
    reason: str | None = None,
    error: str | None = None,
) -> None:
    """Record the final outcome of one attempt. The caller commits (or the outbox does)."""
    now = utc_now()
    row.status = status
    row.attempts = message.attempts + 1
    row.external_id = external_id
    row.reason = reason
    row.error = error
    row.processed_at = now
    row.updated_at = now


async def _call_meta(
    client: meta_graph.GraphClient,
    row: ContentDelivery,
    account_id: str,
    image_url: str | None,
) -> str:
    caption = _text(row.payload.get("caption")) or ""
    if row.platform == PLATFORM_FACEBOOK:
        return await meta_graph.publish_facebook(
            client,
            page_id=account_id,
            message=caption,
            link=_text(row.payload.get("url")) or "",
            image_url=image_url,
        )
    if image_url is None:
        # post_delivery skips Instagram rows without an image before this point.
        raise meta_graph.GraphRejected("Instagram posts need an image")
    return await meta_graph.publish_instagram(
        client, account_id=account_id, caption=caption, image_url=image_url
    )


async def _publish_live(
    session: AsyncSession,
    row: ContentDelivery,
    message: OutboxMessage,
    credentials: PlatformCredentials,
    image_url: str | None,
) -> None:
    """Send one post to Meta and record the answer.

    The attempt is committed before the request. If the process dies, or Meta's
    answer is lost, the next attempt sees the marker and gives the row up instead of
    sending it again. A row is only sent again after Meta has answered without
    publishing (retryable), and that answer clears the marker first."""
    now = utc_now()
    row.publish_started_at = now
    row.updated_at = now
    # The handler commits mid-way, which releases the outbox row lock. Hold the row
    # for the lease so a second worker cannot pick it up while Meta is being called.
    await session.execute(
        update(Outbox)
        .where(Outbox.id == message.id)
        .values(next_attempt_at=now + IN_FLIGHT_LEASE)
    )
    await session.commit()

    client = meta_graph.GraphClient(
        access_token=credentials.access_token,
        api_version=content_distribution_settings.META_GRAPH_API_VERSION,
    )
    context = {"platform": row.platform, "delivery_id": str(row.id)}
    try:
        external_id = await _call_meta(client, row, credentials.account_id, image_url)
    except meta_graph.GraphOutcomeUnknown:
        logger.error("Social post outcome unknown; not sent again", extra=context)
        _settle(row, message, status=STATUS_DEAD, error=ERROR_OUTCOME_UNKNOWN)
        return
    except meta_graph.GraphRejected as exc:
        logger.warning("Meta rejected a social post", extra=context)
        _settle(row, message, status=STATUS_DEAD, error=exc.message)
        return
    except meta_graph.GraphRetryable as exc:
        logger.warning("Social post not sent; the outbox will retry", extra=context)
        row.publish_started_at = None
        row.error = exc.message
        row.updated_at = utc_now()
        await session.commit()
        raise
    logger.info("Social post published", extra=context)
    _settle(row, message, status=STATUS_POSTED, external_id=external_id)


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
    """Outbox handler body for social.post.<platform>.

    Idempotent: a row that is no longer scheduled is left alone, so a retry never
    reposts. Live posting needs both the feature flag ``social-live-posting`` and the
    Meta settings. Without either, the row is a dry run that says why. An Instagram
    row without an image is skipped, with the reason."""
    row = await _locked(session, message)
    if row is None or row.status != STATUS_SCHEDULED:
        return
    if row.publish_started_at is not None:
        # An earlier attempt sent the publish request and never recorded an answer.
        # Sending it again could post twice, so the row is given up for a person to check.
        logger.error(
            "Social post left in flight by an earlier attempt; not sent again",
            extra={"platform": row.platform, "delivery_id": str(row.id)},
        )
        _settle(row, message, status=STATUS_DEAD, error=ERROR_OUTCOME_UNKNOWN)
        return
    image_url = _text(row.payload.get("imageUrl"))
    if row.platform in IMAGE_REQUIRED_PLATFORMS and image_url is None:
        _settle(row, message, status=STATUS_SKIPPED, reason=REASON_NO_IMAGE)
        return
    credentials = content_distribution_settings.platform_credentials(row.platform)
    live_on = await flag_service.is_enabled(session, SOCIAL_LIVE_FLAG)
    if not live_on or credentials is None:
        if not live_on:
            reason = REASON_FLAG_OFF
        elif content_distribution_settings.token_looks_malformed():
            reason = REASON_TOKEN_MALFORMED
        else:
            reason = REASON_NOT_CONFIGURED
        logger.info(
            "Dry-run social post recorded",
            extra={"platform": row.platform, "delivery_id": str(row.id)},
        )
        _settle(
            row,
            message,
            status=STATUS_DRY_RUN_SENT,
            external_id=f"dry-run:{row.id}",
            reason=reason,
        )
        return
    await _publish_live(session, row, message, credentials, image_url)


async def dead_letter(
    session: AsyncSession, message: OutboxMessage, error: Exception
) -> None:
    """Runs when the outbox gives up on a row: record why for the editor."""
    row = await _locked(session, message)
    if row is None or row.status != STATUS_SCHEDULED:
        return
    _settle(row, message, status=STATUS_DEAD, error=_error_text(error))


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
            error = delivery.error or last_error
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
                reason=delivery.reason,
                error=error,
                publish_at=delivery.publish_at,
                processed_at=delivery.processed_at,
                updated_at=delivery.updated_at,
            )
        )
    return items, int(total or 0)
