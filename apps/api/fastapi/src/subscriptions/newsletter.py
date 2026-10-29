"""The daily climate newsletter: what one day's digest contains.

Order inside a digest: weather alerts in effect, then a short forecast summary,
then posts flagged "include in newsletter". A day with no alerts and no posts is
skipped (the forecast alone is not news). Hurricane-season mode (the feature flag
``HURRICANE_MODE_FLAG``) keeps one forecast line and at most two posts.

Sources are injectable so tests never touch the weather database or the network.
Nothing here sends mail: the worker fan-out is ``src/worker/newsletter_digest.py``,
and ``queue_test`` queues one staff copy through the notifications outbox.
"""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.email_config import email_settings
from src.feature_flags import service as flag_service
from src.notifications import service as notification_service
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email
from src.utils.timezones import GRENADA

from . import service
from .config import subscriptions_settings
from .constants import (
    CAP_ALERTS_LIST_KEY,
    HURRICANE_MODE_FLAG,
    MAILING_LISTS,
    NEWSLETTER_LIST_KEY,
    NEWSLETTER_TEMPLATE,
)
from .exceptions import NewsletterRecipientNotConfirmedError
from .models import ListSubscription, SubscriptionStatus

logger = logging.getLogger(__name__)

SEND_TIME = time(7, 30)  # Grenada; the worker cron runs at 11:30 UTC to match
FORECAST_DAYS = 2
HURRICANE_FORECAST_LINES = 1
HURRICANE_POST_LIMIT = 2
POST_LIMIT = 10
TEST_NOTICE = "This is a test copy for staff. It was not sent to subscribers."


@dataclass(frozen=True)
class DigestAlert:
    headline: str
    event: str
    areas: str
    expires: str | None
    link: str


@dataclass(frozen=True)
class DigestPost:
    title: str
    url: str
    summary: str


@dataclass(frozen=True)
class Digest:
    day: date
    subject: str
    headline: str
    alerts: tuple[DigestAlert, ...]
    forecast_lines: tuple[str, ...]
    posts: tuple[DigestPost, ...]
    hurricane_mode: bool
    test: bool = False

    @property
    def empty(self) -> bool:
        """A day with no alert and no post is not sent."""
        return not self.alerts and not self.posts

    @property
    def date_label(self) -> str:
        return f"{self.day.day} {self.day:%b %Y}"


AlertsLoader = Callable[[AsyncSession], Awaitable[list[DigestAlert]]]
ForecastLoader = Callable[[datetime], Awaitable[list[str]]]
PostsLoader = Callable[[datetime, datetime], Awaitable[list[DigestPost]]]


# ── Sources ──────────────────────────────────────────────────────────────────


async def public_alerts(session: AsyncSession) -> list[DigestAlert]:
    """Public CAP alerts in effect now (the same list the website shows)."""
    from src.cap import public_queries

    listing = await public_queries.public_latest_active(session=session)
    alerts: list[DigestAlert] = []
    for alert in listing.data:
        if not alert.info:
            continue
        info = alert.info[0]
        encoded = quote(alert.identifier, safe="")
        alerts.append(
            DigestAlert(
                headline=info.headline,
                event=info.event,
                areas="; ".join(area.area_desc for area in info.areas),
                expires=(
                    info.expires.astimezone(GRENADA).strftime("%d %b %Y, %H:%M")
                    if info.expires
                    else None
                ),
                link=f"{service.site_url(CAP_ALERTS_LIST_KEY)}/alerts/{encoded}",
            )
        )
    return alerts


def forecast_lines(forecast: Any) -> list[str]:
    """One line per forecast day: the high and low in degrees Celsius (WMO units)."""
    lines: list[str] = []
    for period in forecast.periods[:FORECAST_DAYS]:
        parts: list[str] = []
        if period.high is not None:
            parts.append(f"high {round(period.high)} °C")
        if period.low is not None:
            parts.append(f"low {round(period.low)} °C")
        if parts:
            lines.append(f"{period.date}: {', '.join(parts)}")
    return lines


async def load_forecast_lines(now: datetime) -> list[str]:
    """Forecast summary from the weather products database; empty when unavailable."""
    from src.wxproducts import database as weather_database
    from src.wxproducts import forecast as weather_forecast

    weather = weather_database.create_session()
    if weather is None:
        return []
    async with weather:
        try:
            forecast = await weather_forecast.load_forecast(weather, now)
        except SQLAlchemyError, OSError, ValueError:
            logger.warning("Newsletter forecast unavailable")
            return []
    return forecast_lines(forecast)


class _FeedPost(BaseModel):
    """One item of the posts feed. Anything malformed is dropped, not repaired."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    title: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=8, max_length=2000)
    summary: str = Field(default="", max_length=600)
    include: bool = Field(alias="includeInNewsletter")
    published_at: datetime = Field(alias="publishedAt")

    @field_validator("url")
    @classmethod
    def _web_link(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("post links must be web addresses")
        return value

    @field_validator("published_at")
    @classmethod
    def _aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("publishedAt needs a time zone")
        return value


def send_window(now: datetime) -> tuple[datetime, datetime]:
    """The span of posts one morning's mail covers, as aware UTC.

    It runs from the previous 07:30 Grenada to the 07:30 of ``now``'s Grenada
    date. The end is the send time, not the moment the job runs, so a late run
    never overlaps the next window. The start is included and the end excluded,
    so a post exactly at 07:30 waits for the next mail. Grenada keeps no daylight
    saving, so consecutive windows are exactly 24 hours apart."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    until = datetime.combine(
        now.astimezone(GRENADA).date(), SEND_TIME, tzinfo=GRENADA
    ).astimezone(UTC)
    return until - timedelta(days=1), until


async def fetch_flagged_posts(
    since: datetime,
    until: datetime,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[DigestPost]:
    """Flagged posts published in ``[since, until)`` (see ``send_window``).

    Feed contract (CMS side, not built yet): ``{"items": [{"title", "url",
    "summary", "includeInNewsletter", "publishedAt"}]}``. An unreachable feed or
    unset ``NEWSLETTER_POSTS_FEED_URL`` gives no posts; the alerts still go out."""
    url = subscriptions_settings.NEWSLETTER_POSTS_FEED_URL
    if not url:
        return []
    try:
        async with httpx.AsyncClient(timeout=5.0, transport=transport) as client:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError, ValueError:
        logger.warning("Newsletter posts feed unavailable")
        return []
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    posts: list[DigestPost] = []
    for raw in items:
        try:
            item = _FeedPost.model_validate(raw)
        except ValidationError:
            continue
        if not item.include:
            continue
        if not since <= item.published_at.astimezone(UTC) < until:
            continue
        posts.append(DigestPost(title=item.title, url=item.url, summary=item.summary))
    return posts[:POST_LIMIT]


# ── Composition ──────────────────────────────────────────────────────────────


def _subject(alerts: list[DigestAlert], day: date, *, test: bool) -> str:
    if not alerts:
        head = "GMS climate newsletter"
    elif len(alerts) == 1:
        head = f"Weather alert: {alerts[0].headline}"
    else:
        head = f"{len(alerts)} weather alerts in effect"
    subject = f"{head} - {day.day} {day:%b %Y}"
    return f"Test: {subject}" if test else subject


async def build(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    hurricane_mode: bool | None = None,
    test: bool = False,
    alerts_loader: AlertsLoader | None = None,
    forecast_loader: ForecastLoader | None = None,
    posts_loader: PostsLoader | None = None,
) -> Digest:
    """The digest for one day, even when it is empty (used by the test send)."""
    now = now or utc_now()
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    day = now.astimezone(GRENADA).date()
    if hurricane_mode is None:
        hurricane_mode = await flag_service.is_enabled(session, HURRICANE_MODE_FLAG)
    alerts = await (alerts_loader or public_alerts)(session)
    forecast = await (forecast_loader or load_forecast_lines)(now)
    since, until = send_window(now)
    posts = await (posts_loader or fetch_flagged_posts)(since, until)
    if hurricane_mode:
        forecast = forecast[:HURRICANE_FORECAST_LINES]
        posts = posts[:HURRICANE_POST_LIMIT]
    return Digest(
        day=day,
        subject=_subject(alerts, day, test=test),
        headline="Hurricane season update" if hurricane_mode else "Today's update",
        alerts=tuple(alerts),
        forecast_lines=tuple(forecast),
        posts=tuple(posts),
        hurricane_mode=bool(hurricane_mode),
        test=test,
    )


async def compose(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    hurricane_mode: bool | None = None,
    alerts_loader: AlertsLoader | None = None,
    forecast_loader: ForecastLoader | None = None,
    posts_loader: PostsLoader | None = None,
) -> Digest | None:
    """The day's digest, or None when there is nothing worth sending."""
    digest = await build(
        session,
        now=now,
        hurricane_mode=hurricane_mode,
        alerts_loader=alerts_loader,
        forecast_loader=forecast_loader,
        posts_loader=posts_loader,
    )
    return None if digest.empty else digest


def props(
    digest: Digest, *, unsubscribe_link: str, preferences_link: str | None = None
) -> dict[str, Any]:
    """Template props shared by the React Email and Jinja renderers."""
    return {
        "projectName": email_settings.PROJECT_NAME,
        "listName": MAILING_LISTS[NEWSLETTER_LIST_KEY].name,
        "subject": digest.subject,
        "headline": digest.headline,
        "dateLabel": digest.date_label,
        "hurricaneMode": digest.hurricane_mode,
        "alerts": [
            {
                "headline": alert.headline,
                "event": alert.event,
                "areas": alert.areas,
                "expires": alert.expires,
                "link": alert.link,
            }
            for alert in digest.alerts
        ],
        "forecastLines": list(digest.forecast_lines),
        "posts": [
            {"title": post.title, "url": post.url, "summary": post.summary}
            for post in digest.posts
        ],
        "testNotice": TEST_NOTICE if digest.test else None,
        "unsubscribeLink": unsubscribe_link,
        "preferencesLink": preferences_link,
    }


async def queue_test(
    session: AsyncSession, *, email: str, now: datetime | None = None
) -> None:
    """Queue one staff copy to an address that has confirmed the newsletter.

    Only a confirmed address qualifies, so the copy always carries a working
    one-click unsubscribe link for that subscription. It commits its own work,
    like the public sign-up does."""
    clean = notification_service.normalise_email(email)
    row = await session.scalar(
        select(ListSubscription).where(
            ListSubscription.list_key == NEWSLETTER_LIST_KEY,
            ListSubscription.status == SubscriptionStatus.CONFIRMED.value,
            or_(
                ListSubscription.email_hash == hash_email(clean),
                ListSubscription.email == clean,
            ),
        )
    )
    if row is None:
        raise NewsletterRecipientNotConfirmedError()
    digest = await build(session, now=now, test=True)
    notification_service.enqueue_email(
        session=session,
        to_email=clean,
        subject=digest.subject,
        transactional=False,
        template=NEWSLETTER_TEMPLATE,
        props=props(
            digest,
            unsubscribe_link=service.unsubscribe_link(row.id),
            preferences_link=await service.preferences_url(
                session, NEWSLETTER_LIST_KEY, row.id
            ),
        ),
    )
    await session.commit()
    logger.info("Newsletter test copy queued")
