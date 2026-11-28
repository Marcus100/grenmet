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
    JobFreshness,
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


@dataclass(frozen=True)
class JobRule:
    """How long a scheduled worker job may go without a success.

    ``alerts`` decides whether staleness turns the probe red. Every tracked job is
    reported either way, so the monitoring screen shows the lot; only the jobs a
    customer would notice stopping are worth waking someone for.
    """

    name: str
    max_age: timedelta
    alerts: bool


def job_rules() -> tuple[JobRule, ...]:
    """Windows are about twice each job's interval, so one late or slow run is not
    an alert. Schedules are in ``src/worker/main.py`` (and ``src/printix/register.py``
    for ``purge_scan_log``); keep the two in step.

    Nothing watched an individual job before this: ARQ jobs are wrapped for Sentry
    Crons, but ``SENTRY_CRONS_ENABLED`` is not set in production, and the Better Stack
    heartbeat notices the worker being down rather than one job failing.
    """
    return (
        # Every minute.
        JobRule("process_cap_jobs", timedelta(minutes=15), True),
        JobRule("send_notification_emails", timedelta(minutes=15), True),
        # Every five minutes.
        JobRule("ingest_cap_feeds", timedelta(minutes=20), False),
        JobRule("expire_cap_alerts", timedelta(minutes=20), True),
        JobRule("expire_unpaid_bookings", timedelta(minutes=20), True),
        JobRule("expire_pending_bookings", timedelta(minutes=20), True),
        # Hourly.
        JobRule("enqueue_booking_reminders", timedelta(minutes=135), True),
        JobRule("complete_finished_bookings", timedelta(minutes=135), True),
        JobRule("sweep_booking_uploads", timedelta(minutes=135), True),
        # Daily.
        JobRule("run_notification_sweeps", timedelta(hours=26), False),
        JobRule("evaluate_paused_businesses", timedelta(hours=26), False),
        JobRule("purge_scan_log", timedelta(hours=26), False),
    )


def job_status(
    rule: JobRule,
    *,
    last_success: datetime | None,
    now: datetime,
    telemetry_available: bool,
) -> FeedStatus:
    """A job's freshness. ``NEVER`` is not staleness: a job that has not run yet in a
    fresh environment, or since the last Redis flush, is unknown rather than broken,
    and ``failing_checks`` treats it that way.
    """
    if not telemetry_available:
        return FeedStatus.UNKNOWN
    if last_success is None:
        return FeedStatus.NEVER
    if now - _naive_utc(last_success) > rule.max_age:
        return FeedStatus.STALE
    return FeedStatus.FRESH


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
    job_last = await operational_metrics.job_successes()
    telemetry_available = successes is not None
    seen = successes or {}
    jobs_seen = job_last or {}
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
    jobs: list[JobFreshness] = []
    for job in job_rules():
        job_seen = jobs_seen.get(job.name)
        jobs.append(
            JobFreshness(
                name=job.name,
                status=job_status(
                    job,
                    last_success=job_seen,
                    now=moment,
                    telemetry_available=telemetry_available,
                ),
                alerts=job.alerts,
                last_success_at=job_seen,
                max_age_minutes=int(job.max_age.total_seconds() // 60),
            )
        )
    backlog = await email_backlog(session, now=moment)
    feeds_ok = all(f.status in {FeedStatus.FRESH, FeedStatus.DISABLED} for f in feeds)
    # Only a job marked `alerts` can turn the report red, and only when it is STALE:
    # see job_status on why NEVER and UNKNOWN are not failures.
    jobs_ok = not any(job.alerts and job.status is FeedStatus.STALE for job in jobs)
    threshold = worker_settings.OUTBOX_ALERT_THRESHOLD
    email_ok = (
        backlog.stale_pending <= threshold and backlog.dead_last_window <= threshold
    )
    return FreshnessReport(
        healthy=feeds_ok and jobs_ok and email_ok,
        checked_at=moment,
        telemetry_available=telemetry_available,
        feeds=feeds,
        jobs=jobs,
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
    for job in report.jobs:
        if job.alerts and job.status is FeedStatus.STALE:
            names.append(f"job:{job.name}")
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
