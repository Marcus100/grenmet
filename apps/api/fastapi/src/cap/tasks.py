from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent

PUBLISH_JOB_KINDS = (
    "publish.webhooks",
    "publish.mqtt",
    "publish.wis2box",
    "publish.static_map",
    "publish.pdf",
    "publish.social_image",
)


async def enqueue_publish_side_effects(
    *, session: AsyncSession, alert_id: object, snapshot_id: object
) -> list[CapJobEvent]:
    """Record publish side effects for a worker to process.

    The first CAP slice keeps task creation durable in Postgres. A Celery worker can
    consume these rows once Redis/Celery dependencies are enabled for deployment.
    """
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
