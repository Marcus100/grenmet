"""Outbox backlog gauges: recently dead rows and pending rows overdue by a bound.

Read-only counts in SQL; no payloads are loaded. "Stale" means due for longer
than the bound but not drained (a stuck worker or a topic with no handler);
rows scheduled for later are not counted. The worker job
``check_outbox_backlog`` records the gauges and warns above the threshold.
"""

from __future__ import annotations

import logging
from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics
from src.events.models import Outbox as EventsOutbox
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

BACKLOG_WARNING = "Outbox backlog above threshold"


@dataclass(frozen=True)
class Backlog:
    outbox: str
    dead: int
    stale_pending: int


async def platform_backlog(
    session: AsyncSession,
    *,
    stale_after: timedelta,
    dead_window: timedelta,
    now: datetime | None = None,
    only_topics: Collection[str] | None = None,
) -> Backlog:
    """``now`` and ``only_topics`` exist for tests, as in ``outbox.drain``."""
    moment = now or utc_now()
    scope = [] if only_topics is None else [Outbox.topic.in_(list(only_topics))]
    dead = await session.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.status == OutboxStatus.DEAD.value,
            Outbox.updated_at >= moment - dead_window,
            *scope,
        )
    )
    stale = await session.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.status == OutboxStatus.PENDING.value,
            Outbox.next_attempt_at <= moment - stale_after,
            *scope,
        )
    )
    return Backlog("platform", int(dead or 0), int(stale or 0))


async def events_backlog(
    session: AsyncSession,
    *,
    stale_after: timedelta,
    dead_window: timedelta,
    now: datetime | None = None,
) -> Backlog:
    moment = now or utc_now()
    dead = await session.scalar(
        select(func.count())
        .select_from(EventsOutbox)
        .where(EventsOutbox.failed_at >= moment - dead_window)
    )
    stale = await session.scalar(
        select(func.count())
        .select_from(EventsOutbox)
        .where(
            EventsOutbox.processed_at.is_(None),
            EventsOutbox.failed_at.is_(None),
            EventsOutbox.available_at <= moment - stale_after,
        )
    )
    return Backlog("events", int(dead or 0), int(stale or 0))


async def report(redis: object, backlog: Backlog, *, threshold: int) -> bool:
    """Record gauges; log a warning when either count exceeds ``threshold``.

    Returns whether the outbox is healthy."""
    await operational_metrics.record_outbox_backlog(
        redis, backlog.outbox, dead=backlog.dead, stale_pending=backlog.stale_pending
    )
    healthy = backlog.dead <= threshold and backlog.stale_pending <= threshold
    if not healthy:
        logger.warning(
            BACKLOG_WARNING,
            extra={
                "outbox": backlog.outbox,
                "dead": backlog.dead,
                "stale_pending": backlog.stale_pending,
                "threshold": threshold,
            },
        )
    return healthy
