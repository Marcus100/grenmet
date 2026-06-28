"""Dispatch queued CAP job events (durable outbox) to their publish handlers.

This is the testable core of the worker — no Redis/arq required. ``src/worker/main.py``
is the thin arq entrypoint that calls ``process_due_jobs`` on a schedule.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.cap.models import CapJobEvent, CapJobStatus
from src.utils.datetime import utc_now
from src.worker import publishers
from src.worker.publishers import PublishError

logger = logging.getLogger(__name__)

Handler = Callable[..., Awaitable[dict[str, Any]]]

KIND_HANDLERS: dict[str, Handler] = {
    "publish.webhooks": publishers.publish_webhooks,
    "publish.mqtt": publishers.publish_mqtt,
    "publish.wis2box": publishers.publish_wis2box,
    "publish.pdf": publishers.publish_pdf,
    "publish.static_map": publishers.publish_static_map,
    "publish.social_image": publishers.publish_social_image,
}


async def dispatch_job(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> CapJobEvent:
    """Run a single job's handler and persist its outcome (status/attempts/result)."""
    job.status = CapJobStatus.RUNNING
    job.attempts += 1
    job.updated_at = utc_now()
    session.add(job)
    await session.flush()

    handler = KIND_HANDLERS.get(job.kind)
    try:
        if handler is None:
            raise PublishError({"error": f"no handler for kind '{job.kind}'"})
        result = await handler(session=session, job=job, http_client=http_client)
        job.status = CapJobStatus.SUCCEEDED
        job.result = result
    except PublishError as exc:
        job.status = CapJobStatus.FAILED
        job.result = exc.details
        logger.warning(
            "CAP job failed", extra={"job_id": str(job.id), "kind": job.kind}
        )
    except Exception as exc:  # noqa: BLE001 - never let one job kill the batch
        job.status = CapJobStatus.FAILED
        job.result = {"error": str(exc)}
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
    try:
        result = await session.execute(
            select(CapJobEvent)
            .where(
                or_(
                    col(CapJobEvent.status) == CapJobStatus.QUEUED,
                    (col(CapJobEvent.status) == CapJobStatus.FAILED)
                    & (col(CapJobEvent.attempts) < max_attempts),
                )
            )
            .order_by(col(CapJobEvent.created_at))
            .limit(limit)
        )
        jobs = list(result.scalars().all())
        for job in jobs:
            await dispatch_job(session=session, job=job, http_client=client)
        if jobs:
            logger.info("Processed CAP jobs", extra={"count": len(jobs)})
        return len(jobs)
    finally:
        if owns_client:
            await client.aclose()
