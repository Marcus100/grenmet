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
    email_outbox: EmailOutboxBacklog
