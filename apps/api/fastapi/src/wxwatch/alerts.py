"""Tell people when an NHC job fails or a weather image collector goes quiet.

Read-only on the archive database: the NHC worker owns job state, the
collectors own their runs, and neither sends notifications. Main-worker crons
call ``notify_failed_jobs`` and ``notify_stale_feeds``; the window in ``notify``
keeps a run of failures from becoming a run of messages.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import events
from src.notifications import service as notification_service
from src.notifications.events import EventDef

from .config import wxwatch_settings

logger = logging.getLogger(__name__)

PULL_FAILED = "nhc.pull_failed"
# Shorter than the suppression window so a re-poll never re-reads a failure
# that has already been announced.
LOOKBACK = timedelta(minutes=15)
SUPPRESS = timedelta(hours=1)

FEED_STALE = "wxwatch.feed_stale"
# A source with no run at all in this window is retired, not stale: a collector
# switched off on purpose stops being reported after two weeks.
FEED_GIVE_UP = timedelta(days=14)
# One message a day for each source while it stays stale.
FEED_SUPPRESS = timedelta(hours=24)
# Sentry gets one error per source per window, not one per sweep.
FEED_LOG_EVERY = timedelta(hours=6)
_feed_logged: dict[str, datetime] = {}


def register() -> None:
    events.register(
        EventDef(
            key=PULL_FAILED,
            label="NHC request failed",
            description="An NHC pull or point request failed in the archive worker.",
            audience="cap-admin and management by default; change the roles in notification settings",
            title="NHC {{ kind }} request failed",
            body="An NHC {{ kind }} request failed. Check source status in the NHC workspace and retry.",
            variables=("kind",),
            default_roles=("cap-admin", "management"),
        )
    )
    events.register(
        EventDef(
            key=FEED_STALE,
            label="Weather image feed stopped",
            description="A weather image collector has not finished a run for longer than expected.",
            audience="cap-admin and management by default; change the roles in notification settings",
            title="Weather images from {{ source }} have stopped updating",
            body="{{ detail }} Imagery from this source may be out of date until its collector runs again.",
            variables=("source", "detail"),
            default_roles=("cap-admin", "management"),
        )
    )


async def notify_failed_jobs(*, session: AsyncSession, archive: AsyncSession) -> int:
    """Notify once per failed job kind inside the suppression window."""
    rows = (
        await archive.execute(
            text(
                "SELECT kind FROM archive_nhc_jobs WHERE status='failed' "
                "AND finished_at >= now() - make_interval(secs => :seconds) "
                "GROUP BY kind"
            ),
            {"seconds": LOOKBACK.total_seconds()},
        )
    ).all()
    notified = 0
    for row in rows:
        notified += await notification_service.notify(
            session,
            event_key=PULL_FAILED,
            organisation_id=wxwatch_settings.ALERT_ORGANISATION_ID,
            recipients=(),
            context={"kind": row.kind},
            link_path="/wxproducts/nhc",
            entity_type="nhc_job_kind",
            entity_id=row.kind,
            suppress_within=SUPPRESS,
        )
    await session.commit()
    return notified


def _age_text(age: timedelta) -> str:
    """How long ago, in whole units a person reads at a glance."""
    minutes = int(age.total_seconds() // 60)
    if minutes < 120:
        return f"{minutes} minutes"
    hours = minutes // 60
    if hours < 48:
        return f"{hours} hours"
    return f"{hours // 24} days"


def _detail(age: timedelta | None) -> str:
    if age is None:
        return f"The collector has not finished a run in the last {FEED_GIVE_UP.days} days."
    return f"The collector last finished a run {_age_text(age)} ago."


async def stale_feeds(
    archive: AsyncSession, now: datetime
) -> list[tuple[str, timedelta | None]]:
    """Collector sources whose last finished run is older than the limit.

    A source counts only while it has started a run inside ``FEED_GIVE_UP``.
    The age is ``None`` when none of those runs finished.
    """
    ignored = {
        name.strip()
        for name in wxwatch_settings.FEED_IGNORED_SOURCES.split(",")
        if name.strip()
    }
    # A limit shorter than two collector runs would report every source.
    limit = timedelta(minutes=max(30, wxwatch_settings.FEED_STALE_MINUTES))
    rows = (
        await archive.execute(
            text(
                "SELECT source, max(finished_at) FILTER (WHERE status='finished') AS last_good "
                "FROM collection_runs WHERE started_at >= :since "
                "GROUP BY source ORDER BY source"
            ),
            {"since": now - FEED_GIVE_UP},
        )
    ).all()
    stale: list[tuple[str, timedelta | None]] = []
    for row in rows:
        if row.source in ignored:
            continue
        age = None if row.last_good is None else now - row.last_good
        if age is None or age > limit:
            stale.append((row.source, age))
    return stale


async def notify_stale_feeds(
    *, session: AsyncSession, archive: AsyncSession, now: datetime | None = None
) -> int:
    """Notify once a day for each collector source that has gone quiet."""
    moment = (now or datetime.now(UTC)).astimezone(UTC)
    notified = 0
    for source, age in await stale_feeds(archive, moment):
        last_logged = _feed_logged.get(source)
        if last_logged is None or moment - last_logged >= FEED_LOG_EVERY:
            _feed_logged[source] = moment
            # The Sentry scrubber keeps numbers in the message and the `area`
            # code name, so the error still says which source and how old.
            area = {"area": f"wxwatch.feed.{source}"}
            if age is None:
                logger.error(
                    "Weather image feed is stale: no finished run in the last %d days",
                    FEED_GIVE_UP.days,
                    extra=area,
                )
            else:
                logger.error(
                    "Weather image feed is stale: last finished run %d minutes ago",
                    int(age.total_seconds() // 60),
                    extra=area,
                )
        notified += await notification_service.notify(
            session,
            event_key=FEED_STALE,
            organisation_id=wxwatch_settings.ALERT_ORGANISATION_ID,
            recipients=(),
            context={"source": source, "detail": _detail(age)},
            link_path="/wxwatch",
            entity_type="collection_source",
            entity_id=source,
            suppress_within=FEED_SUPPRESS,
        )
    await session.commit()
    return notified
