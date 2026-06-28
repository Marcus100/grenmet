"""arq worker entrypoint.

Run with:  uv run arq src.worker.main.WorkerSettings

Polls the CAP durable outbox (cap.job_event) on a schedule and dispatches publish
side-effects. The dispatch logic lives in ``src/worker/dispatch.py`` (unit-tested
without Redis).
"""

from __future__ import annotations

from typing import Any

from arq import cron
from arq.connections import RedisSettings

from src.cap import service as cap_service
from src.database import async_session_factory
from src.logging_config import configure_logging
from src.worker.config import worker_settings
from src.worker.dispatch import process_due_jobs

configure_logging()


async def process_cap_jobs(ctx: dict[str, Any]) -> int:  # noqa: ARG001 - arq passes ctx
    async with async_session_factory() as session:
        return await process_due_jobs(
            session=session,
            limit=worker_settings.CAP_JOB_BATCH_SIZE,
            max_attempts=worker_settings.CAP_JOB_MAX_ATTEMPTS,
        )


async def ingest_cap_feeds(ctx: dict[str, Any]) -> int:  # noqa: ARG001 - arq passes ctx
    async with async_session_factory() as session:
        return await cap_service.ingest_all_active_feeds(session=session)


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(worker_settings.redis_dsn)
    functions = [process_cap_jobs, ingest_cap_feeds]
    cron_jobs = [
        # Drain the CAP publish outbox every CAP_JOB_POLL_SECONDS (default 10s).
        cron(
            process_cap_jobs,
            second=set(range(0, 60, worker_settings.CAP_JOB_POLL_SECONDS)),
            run_at_startup=True,
        ),
        # Poll external CAP feeds every 5 minutes.
        cron(
            ingest_cap_feeds,
            minute=set(range(0, 60, 5)),
            run_at_startup=False,
        ),
    ]
