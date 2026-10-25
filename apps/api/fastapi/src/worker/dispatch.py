"""Dispatch queued CAP job events (durable outbox) to their publish handlers.

This is the testable core of the worker — no Redis/arq required. ``src/worker/main.py``
is the thin arq entrypoint that calls ``process_due_jobs`` on a schedule.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapAlert, CapJobEvent, CapJobStatus, CapScope, CapStatus
from src.utils.datetime import utc_now
from src.worker import cap_email, cap_push, last_known_good, publishers
from src.worker.publishers import PublishError, _prior_delivered

logger = logging.getLogger(__name__)

Handler = Callable[..., Awaitable[dict[str, Any]]]

# Exponential backoff for FAILED-job retries: base * 2**(attempts-1), capped.
_RETRY_BASE_SECONDS = 10
_RETRY_MAX_SECONDS = 3600

# A job is marked RUNNING and committed before its handler sends anything, so a
# worker that crashes mid-delivery leaves it RUNNING. The arq job timeout is 300 s;
# past this window the job is treated as abandoned and is retried (the handlers skip
# recipients already recorded in ``result["delivered"]``).
_STALE_RUNNING = timedelta(minutes=15)


def _retry_delay_seconds(attempts: int) -> int:
    """Backoff for a job that has failed ``attempts`` times (attempts >= 1)."""
    exponent = max(attempts - 1, 0)
    return min(_RETRY_BASE_SECONDS << exponent, _RETRY_MAX_SECONDS)


KIND_HANDLERS: dict[str, Handler] = {
    "publish.webhooks": publishers.publish_webhooks,
    "publish.mqtt": publishers.publish_mqtt,
    "publish.wis2box": publishers.publish_wis2box,
    "publish.pdf": publishers.publish_pdf,
    "publish.static_map": publishers.publish_static_map,
    "publish.social_image": publishers.publish_social_image,
    "publish.last_known_good": last_known_good.publish_last_known_good,
    "publish.email": cap_email.publish_email,
    "publish.push": cap_push.publish_push,
}


def _keep_delivered(previous: object) -> dict[str, Any]:
    """Recipients already served on earlier attempts, to survive an unexpected error."""
    delivered = sorted(_prior_delivered(previous))
    return {"delivered": delivered} if delivered else {}


async def dispatch_job(
    *,
    session: AsyncSession,
    job: CapJobEvent,
    http_client: httpx.AsyncClient,
    claimed: bool = False,
) -> CapJobEvent:
    """Run a single job's handler and persist its outcome (status/attempts/result).

    ``claimed`` means ``process_due_jobs`` already marked the job RUNNING, counted the
    attempt and committed it, so no other worker will pick it up.
    """
    if not claimed:
        job.status = CapJobStatus.RUNNING
        job.attempts += 1
        job.updated_at = utc_now()
        session.add(job)
        await session.flush()

    handler = KIND_HANDLERS.get(job.kind)
    try:
        if handler is None:
            raise PublishError({"error": f"no handler for kind '{job.kind}'"})
        alert = await session.get(CapAlert, job.alert_id) if job.alert_id else None
        if job.alert_id is not None and alert is None:
            raise PublishError({"error": "publish job alert not found"})
        if alert is not None and (
            alert.status != CapStatus.ACTUAL or alert.scope != CapScope.PUBLIC
        ):
            result = {"skipped": True, "reason": "CAP message is not Public Actual"}
        else:
            result = await handler(session=session, job=job, http_client=http_client)
        job.status = CapJobStatus.SUCCEEDED
        job.result = result
        job.next_retry_at = None
    except PublishError as exc:
        job.status = CapJobStatus.FAILED
        job.result = exc.details
        job.next_retry_at = utc_now() + timedelta(
            seconds=_retry_delay_seconds(job.attempts)
        )
        logger.warning(
            "CAP job failed", extra={"job_id": str(job.id), "kind": job.kind}
        )
    except Exception as exc:  # noqa: BLE001 - never let one job kill the batch
        job.status = CapJobStatus.FAILED
        # Keep who already received it, or the retry would send to everyone again.
        job.result = {"error": str(exc), **_keep_delivered(job.result)}
        job.next_retry_at = utc_now() + timedelta(
            seconds=_retry_delay_seconds(job.attempts)
        )
        logger.exception("CAP job errored", extra={"job_id": str(job.id)})

    job.updated_at = utc_now()
    session.add(job)
    await session.commit()
    return job


async def process_due_jobs(
    *,
    session: AsyncSession,
    limit: int = 20,
    max_attempts: int = 5,
    http_client: httpx.AsyncClient | None = None,
) -> int:
    """Process QUEUED jobs (and FAILED jobs under the retry limit). Returns count handled."""
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient()
    now = utc_now()
    try:
        result = await session.execute(
            select(CapJobEvent)
            .where(
                or_(
                    CapJobEvent.status == CapJobStatus.QUEUED,
                    (CapJobEvent.status == CapJobStatus.FAILED)
                    & (CapJobEvent.attempts < max_attempts)
                    # Only retry once the backoff window has elapsed.
                    & (
                        CapJobEvent.next_retry_at.is_(None)
                        | (CapJobEvent.next_retry_at <= now)
                    ),
                    # Abandoned by a crashed worker.
                    (CapJobEvent.status == CapJobStatus.RUNNING)
                    & (CapJobEvent.attempts < max_attempts)
                    & (CapJobEvent.updated_at <= now - _STALE_RUNNING),
                )
            )
            .order_by(CapJobEvent.created_at)
            .limit(limit)
            # Overlapping polls and parallel workers must not take the same job.
            .with_for_update(skip_locked=True)
        )
        jobs = list(result.scalars().all())
        # Claim first: commit RUNNING before anything is sent, so another worker
        # selecting after this commit no longer sees the jobs as due.
        claimed_at = utc_now()
        for job in jobs:
            job.status = CapJobStatus.RUNNING
            job.attempts += 1
            job.updated_at = claimed_at
            session.add(job)
        await session.commit()
        for job in jobs:
            await dispatch_job(
                session=session, job=job, http_client=client, claimed=True
            )
        if jobs:
            logger.info("Processed CAP jobs", extra={"count": len(jobs)})
        return len(jobs)
    finally:
        if owns_client:
            await client.aclose()
