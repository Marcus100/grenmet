from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent, CapScope, CapStatus

# Channels without a publisher are not queued. A queued row would finish like a
# success or sit as "skipped". MQTT is not planned; WIS2 waits for the local
# wis2box (owner decision, 2026-10-30). The integrations view reports them from
# NOT_CONFIGURED_CHANNELS instead.
PUBLISH_JOB_KINDS = (
    "publish.webhooks",
    "publish.static_map",
    "publish.pdf",
    "publish.social_image",
    "publish.last_known_good",
    "publish.email",
    "publish.push",
)

NOT_CONFIGURED_CHANNELS: tuple[dict[str, str], ...] = (
    {
        "kind": "publish.wis2box",
        "name": "WIS2 (wis2box)",
        "status": "not_configured",
        "reason": "Publishing starts once the local wis2box is live.",
    },
    {
        "kind": "publish.mqtt",
        "name": "MQTT",
        "status": "not_configured",
        "reason": "MQTT publishing is not planned.",
    },
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
