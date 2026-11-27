"""The daily summary of an operations log (#1875).

A member who may read a log subscribes to its summary. Once a day the worker
(``jobs.send_daily_summaries``, 10:05 UTC, just after 06:00 in the Eastern
Caribbean) tells each subscriber how many entries were written in the last 24
hours, the busiest categories and the latest lines, through the notifications
module (bell and email, each person's own choice). Private entries are never
counted or quoted. A log with nothing written gets no summary. Each person is
told once per log and day (``dedupe_key``).
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import events
from src.notifications import service as notification_service
from src.notifications.events import EventDef
from src.organisations import grants
from src.organisations.models import (
    Membership,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
)
from src.utils.datetime import utc_now

from . import service
from .models import OpsLog, OpsLogCategory, OpsLogEntry, OpsLogSummarySubscriber

logger = logging.getLogger(__name__)

DAILY_SUMMARY = "opslog.daily_summary"
READ_KEY = "opslog.entries.read"
WINDOW = timedelta(hours=24)
LATEST_LINES = 5
LINE_LENGTH = 100


def register() -> None:
    events.register(
        EventDef(
            key=DAILY_SUMMARY,
            label="Daily summary of an operations log",
            description="What was written in a log you follow in the last 24 hours.",
            audience="Members who subscribed to the log's summary",
            title="{{ log }}: {{ count }} in the last 24 hours",
            body="{{ summary }}",
            variables=("log", "count", "summary"),
            # No default roles: only subscribers who hold the read key are told.
        )
    )


async def is_subscribed(
    session: AsyncSession, *, log_id: str, user_id: uuid.UUID
) -> bool:
    found = await session.scalar(
        select(OpsLogSummarySubscriber.log_id).where(
            OpsLogSummarySubscriber.log_id == log_id,
            OpsLogSummarySubscriber.user_id == user_id,
        )
    )
    return found is not None


async def set_subscribed(
    session: AsyncSession,
    *,
    organisation_id: str,
    log_id: str,
    user_id: uuid.UUID,
    subscribed: bool,
) -> bool:
    log = await service.get_log(session, organisation_id=organisation_id, log_id=log_id)
    already = await is_subscribed(session, log_id=log.id, user_id=user_id)
    if subscribed and not already:
        # Two requests at once must not fail on the primary key.
        await session.execute(
            pg_insert(OpsLogSummarySubscriber)
            .values(
                log_id=log.id,
                user_id=user_id,
                organisation_id=organisation_id,
                created_at=utc_now(),
            )
            .on_conflict_do_nothing()
        )
    elif not subscribed and already:
        await session.execute(
            delete(OpsLogSummarySubscriber).where(
                OpsLogSummarySubscriber.log_id == log.id,
                OpsLogSummarySubscriber.user_id == user_id,
            )
        )
    await session.flush()
    return subscribed


async def _readers(
    session: AsyncSession, *, organisation_id: str, user_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    """The subscribers who are still active members holding the read key."""
    memberships = await session.scalars(
        select(Membership).where(
            Membership.organisation_id == organisation_id,
            Membership.user_id.in_(user_ids),
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    )
    return [
        membership.user_id
        for membership in memberships
        if await grants.has_org_permission(
            session, membership=membership, permission_key=READ_KEY
        )
    ]


def _line(entry: OpsLogEntry) -> str:
    text = " ".join(entry.text.split())
    if len(text) > LINE_LENGTH:
        text = text[: LINE_LENGTH - 1].rstrip() + "…"
    return f"{entry.occurred_at:%H:%M} {text}"


async def _summary(
    session: AsyncSession, log: OpsLog, *, since: datetime
) -> tuple[int, str] | None:
    """``(count, text)`` for the log's public entries since ``since``; None if none."""
    visible = (
        OpsLogEntry.log_id == log.id,
        OpsLogEntry.private.is_(False),
        OpsLogEntry.created_at >= since,
    )
    count = await session.scalar(
        select(func.count()).select_from(OpsLogEntry).where(*visible)
    )
    if not count:
        return None
    by_category = await session.execute(
        select(OpsLogCategory.name, func.count())
        .join(OpsLogEntry, OpsLogEntry.category_id == OpsLogCategory.id)
        .where(*visible)
        .group_by(OpsLogCategory.name)
        .order_by(func.count().desc(), OpsLogCategory.name)
        .limit(3)
    )
    latest = await session.scalars(
        select(OpsLogEntry)
        .where(*visible)
        .order_by(OpsLogEntry.occurred_at.desc(), OpsLogEntry.id.desc())
        .limit(LATEST_LINES)
    )
    parts = [f"{count} {'entry' if count == 1 else 'entries'}."]
    categories = [f"{name} ({number})" for name, number in by_category.tuples()]
    if categories:
        parts.append("Most used: " + ", ".join(categories) + ".")
    parts.append("Latest (UTC): " + "; ".join(_line(entry) for entry in latest))
    return int(count), " ".join(parts)[:1000]


async def send_daily_summaries(session: AsyncSession, *, now: datetime) -> int:
    """Notify every subscriber of every active log with new entries. Commits per log.

    Returns how many people were told."""
    since = now - WINDOW
    told = 0
    # Only active organisations: a suspended one gets nothing (the request path
    # refuses it in OrgContext; this job has no request). The opslog entitlement
    # is checked per recipient by ``has_org_permission``.
    log_ids = (
        await session.scalars(
            select(OpsLogSummarySubscriber.log_id)
            .join(OpsLog, OpsLog.id == OpsLogSummarySubscriber.log_id)
            .join(
                PlatformOrganisation,
                PlatformOrganisation.id == OpsLog.organisation_id,
            )
            .where(
                OpsLog.archived_at.is_(None),
                PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
            )
            .distinct()
        )
    ).all()
    for log_id in log_ids:
        try:
            told += await _send_for_log(session, log_id, now=now, since=since)
            await session.commit()
        except Exception:
            # One log's failure must not stop the others; the dedupe key makes a
            # later run safe.
            await session.rollback()
            logger.exception(
                "Operations log daily summary failed", extra={"log_id": log_id}
            )
    return told


async def _send_for_log(
    session: AsyncSession, log_id: str, *, now: datetime, since: datetime
) -> int:
    log = await session.get(OpsLog, log_id)
    if log is None:
        return 0
    summary = await _summary(session, log, since=since)
    if summary is None:
        return 0
    subscribers = (
        await session.scalars(
            select(OpsLogSummarySubscriber.user_id).where(
                OpsLogSummarySubscriber.log_id == log.id
            )
        )
    ).all()
    recipients = await _readers(
        session, organisation_id=log.organisation_id, user_ids=list(subscribers)
    )
    if not recipients:
        return 0
    count, text = summary
    return await notification_service.notify(
        session,
        event_key=DAILY_SUMMARY,
        organisation_id=log.organisation_id,
        recipients=recipients,
        context={"log": log.name, "count": str(count), "summary": text},
        entity_type="opslog_log",
        entity_id=log.id,
        dedupe_key=f"opslog.summary:{log.id}:{now:%Y-%m-%d}",
    )
