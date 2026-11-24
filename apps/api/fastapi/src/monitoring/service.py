"""Ingest freshness and email outbox backlog, read by staff.

Last successes come from Redis (``operational_metrics.feed_successes``); the email
backlog is counted in SQL on the platform outbox. Nothing here reads payloads,
recipients or error text.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics
from src.environmental.config import environmental_settings
from src.eregister.config import wis2box_settings
from src.flights.config import flights_settings
from src.models_guidance.config import guidance_settings
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now
from src.worker.config import worker_settings

from .schemas import (
    EmailOutboxBacklog,
    FeedFreshness,
    FeedStatus,
    FreshnessReport,
    ProbeReport,
)

FRESHNESS_PERMISSION = "monitoring.freshness.read"
EMAIL_TOPICS = ("email.send", "email.deliver")


@dataclass(frozen=True)
class FeedRule:
    """How long a feed may go without a success, and whether it is switched on."""

    name: str
    max_age: timedelta
    enabled: Callable[[], bool]


def feed_rules() -> tuple[FeedRule, ...]:
    # Windows are a little longer than each schedule so one late run is not an alert.
    return (
        FeedRule("cap_feeds", timedelta(minutes=20), lambda: True),
        FeedRule(
            "opensky_flights",
            timedelta(minutes=90),
            lambda: flights_settings.FLIGHTS_OPENSKY_ENABLED,
        ),
        FeedRule(
            "copernicus_marine",
            timedelta(hours=14),
            lambda: environmental_settings.marine_enabled,
        ),
        FeedRule(
            "copernicus_cams",
            timedelta(hours=14),
            lambda: environmental_settings.air_enabled,
        ),
        FeedRule(
            "model_guidance",
            timedelta(hours=3),
            lambda: guidance_settings.ENABLED,
        ),
        FeedRule(
            "wis2box_publications",
            timedelta(minutes=15),
            lambda: wis2box_settings.sink is not None,
        ),
    )


def feed_status(
    rule: FeedRule,
    *,
    last_success: datetime | None,
    now: datetime,
    telemetry_available: bool,
) -> FeedStatus:
    if not rule.enabled():
        return FeedStatus.DISABLED
    if not telemetry_available:
        return FeedStatus.UNKNOWN
    if last_success is None:
        return FeedStatus.NEVER
    if now - _naive_utc(last_success) > rule.max_age:
        return FeedStatus.STALE
    return FeedStatus.FRESH


def _naive_utc(value: datetime) -> datetime:
    """The codebase keeps naive UTC (``utc_now``); Redis values carry an offset."""
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


async def email_backlog(session: AsyncSession, *, now: datetime) -> EmailOutboxBacklog:
    """Pending, overdue and recently dead email rows on the platform outbox."""
    stale_after = now - timedelta(minutes=worker_settings.OUTBOX_STALE_MINUTES)
    dead_since = now - timedelta(hours=worker_settings.OUTBOX_DEAD_WINDOW_HOURS)
    pending = await session.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.topic.in_(EMAIL_TOPICS),
            Outbox.status == OutboxStatus.PENDING.value,
        )
    )
    stale = await session.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.topic.in_(EMAIL_TOPICS),
            Outbox.status == OutboxStatus.PENDING.value,
            Outbox.next_attempt_at <= stale_after,
        )
    )
    dead = await session.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.topic.in_(EMAIL_TOPICS),
            Outbox.status == OutboxStatus.DEAD.value,
            Outbox.updated_at >= dead_since,
        )
    )
    return EmailOutboxBacklog(
        pending=int(pending or 0),
        stale_pending=int(stale or 0),
        dead_last_window=int(dead or 0),
        dead_window_hours=worker_settings.OUTBOX_DEAD_WINDOW_HOURS,
        stale_after_minutes=worker_settings.OUTBOX_STALE_MINUTES,
    )


async def freshness_report(
    session: AsyncSession,
    *,
    now: datetime | None = None,
) -> FreshnessReport:
    moment = now or utc_now()
    successes = await operational_metrics.feed_successes()
    telemetry_available = successes is not None
    seen = successes or {}
    feeds: list[FeedFreshness] = []
    for rule in feed_rules():
        last = seen.get(rule.name)
        status = feed_status(
            rule,
            last_success=last,
            now=moment,
            telemetry_available=telemetry_available,
        )
        feeds.append(
            FeedFreshness(
                name=rule.name,
                status=status,
                enabled=rule.enabled(),
                last_success_at=last,
                max_age_minutes=int(rule.max_age.total_seconds() // 60),
            )
        )
    backlog = await email_backlog(session, now=moment)
    feeds_ok = all(f.status in {FeedStatus.FRESH, FeedStatus.DISABLED} for f in feeds)
    threshold = worker_settings.OUTBOX_ALERT_THRESHOLD
    email_ok = (
        backlog.stale_pending <= threshold and backlog.dead_last_window <= threshold
    )
    return FreshnessReport(
        healthy=feeds_ok and email_ok,
        checked_at=moment,
        telemetry_available=telemetry_available,
        feeds=feeds,
        email_outbox=backlog,
    )


def failing_checks(report: FreshnessReport) -> list[str]:
    """Names of the checks behind a red verdict; empty when healthy."""
    names: list[str] = []
    if not report.telemetry_available:
        names.append("telemetry")
    for feed in report.feeds:
        if feed.status not in {FeedStatus.FRESH, FeedStatus.DISABLED}:
            names.append(f"feed:{feed.name}")
    if report.email_outbox.stale_pending > worker_settings.OUTBOX_ALERT_THRESHOLD:
        names.append("email_outbox.stale_pending")
    if report.email_outbox.dead_last_window > worker_settings.OUTBOX_ALERT_THRESHOLD:
        names.append("email_outbox.dead_last_window")
    return names


def probe_report(report: FreshnessReport) -> ProbeReport:
    failing = failing_checks(report)
    return ProbeReport(
        healthy=report.healthy and not failing,
        checked_at=report.checked_at,
        failing_checks=failing,
    )
