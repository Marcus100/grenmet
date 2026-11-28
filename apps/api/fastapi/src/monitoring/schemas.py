"""Response shapes of the monitoring freshness report (counts and times only)."""

from __future__ import annotations

from enum import Enum

from src.models import BaseModel, UtcDateTime


class FeedStatus(str, Enum):
    """fresh: last success within its window. stale: older than the window.
    never: no success recorded yet. unknown: telemetry off or Redis unreachable.
    disabled: the feed's flag is off, so it is not expected to run."""

    FRESH = "fresh"
    STALE = "stale"
    NEVER = "never"
    UNKNOWN = "unknown"
    DISABLED = "disabled"


class FeedFreshness(BaseModel):
    name: str
    status: FeedStatus
    enabled: bool
    last_success_at: UtcDateTime | None
    max_age_minutes: int


class JobFreshness(BaseModel):
    """A scheduled worker job's last success, against the window its schedule allows.

    Shares ``FeedStatus`` with the feeds above: the five states mean the same thing
    for a job, and renaming that enum would break the generated client.
    """

    name: str
    status: FeedStatus
    #: True when staleness turns the report and the probe red. A reported-only job
    #: is shown on the monitoring screen but never wakes anyone.
    alerts: bool
    last_success_at: UtcDateTime | None
    max_age_minutes: int


class EmailOutboxBacklog(BaseModel):
    pending: int
    stale_pending: int
    dead_last_window: int
    dead_window_hours: int
    stale_after_minutes: int


class FreshnessReport(BaseModel):
    healthy: bool
    checked_at: UtcDateTime
    telemetry_available: bool
    feeds: list[FeedFreshness]
    jobs: list[JobFreshness]
    email_outbox: EmailOutboxBacklog


class ProbeReport(BaseModel):
    """The uptime probe answer: a verdict and failing check names, nothing personal.

    Failing names look like ``feed:cap_feeds``, ``job:enqueue_booking_reminders``,
    ``telemetry``, ``email_outbox.stale_pending`` or
    ``email_outbox.dead_last_window``.
    """

    healthy: bool
    checked_at: UtcDateTime
    failing_checks: list[str]
