"""Tell people when an operator-requested NHC job fails.

Read-only on the archive database: the NHC worker owns job state and never
sends notifications. A main-worker cron calls ``notify_failed_jobs`` and the
window in ``notify`` keeps a run of failures from becoming a run of messages.
"""

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import events
from src.notifications import service as notification_service
from src.notifications.events import EventDef

from .config import wxwatch_settings

PULL_FAILED = "nhc.pull_failed"
# Shorter than the suppression window so a re-poll never re-reads a failure
# that has already been announced.
LOOKBACK = timedelta(minutes=15)
SUPPRESS = timedelta(hours=1)


def register() -> None:
    events.register(
        EventDef(
            key=PULL_FAILED,
            label="NHC request failed",
            description="An NHC pull or point request failed in the archive worker.",
            audience="Roles chosen in notification settings (nobody until set)",
            title="NHC {{ kind }} request failed",
            body="An NHC {{ kind }} request failed. Check source status in the NHC workspace and retry.",
            variables=("kind",),
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
