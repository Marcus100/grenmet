from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent, CapScope, CapStatus

PUBLISH_JOB_KINDS = (
    "publish.webhooks",
    "publish.mqtt",
    "publish.wis2box",
    "publish.static_map",
    "publish.pdf",
    "publish.social_image",
    "publish.last_known_good",
    "publish.email",
    "publish.push",
)


async def enqueue_publish_side_effects(
    *,
    session: AsyncSession,
    alert_id: object,
    snapshot_id: object,
    status: CapStatus,
    scope: CapScope,
) -> list[CapJobEvent]:
    """Record publish side effects for a worker to process.

    The rows are durable in Postgres. The ARQ worker (``process_cap_jobs`` in
    ``src/worker/main.py``) consumes them, with retries and backoff.
    """
    if status != CapStatus.ACTUAL or scope != CapScope.PUBLIC:
        return []
    events = [
        CapJobEvent(
            alert_id=alert_id,
            snapshot_id=snapshot_id,
            kind=kind,
            payload={"alert_id": str(alert_id), "snapshot_id": str(snapshot_id)},
        )
        for kind in PUBLISH_JOB_KINDS
    ]
    for event in events:
        session.add(event)
    return events
