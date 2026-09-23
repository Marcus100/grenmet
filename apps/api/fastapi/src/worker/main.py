"""arq worker entrypoint.

Run with:  uv run --frozen --package fast-back arq src.worker.main.WorkerSettings

Polls the CAP durable outbox (cap.job_event) on a schedule and dispatches publish
side-effects. The dispatch logic lives in ``src/worker/dispatch.py`` (unit-tested
without Redis).
"""

from __future__ import annotations

from importlib import import_module
from socket import gethostname
from typing import Any

from arq import cron
from arq.connections import RedisSettings

from src.logging_config import configure_logging
from src.telemetry import sentry_options
from src.worker.config import worker_settings

configure_logging()


async def startup(ctx: dict[str, Any]) -> None:  # noqa: ARG001 - arq passes ctx
    # Fail before the worker starts if task dependencies cannot load. Health
    # probes only need Redis settings and must not repeat these imports.
    for module in (
        "src.database",
        "src.cap.service",
        "src.worker.dispatch",
        "src.notifications.dispatch",
        "src.notifications.scheduler",
    ):
        import_module(module)
    from src.config import settings

    if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
        import sentry_sdk

        sentry_sdk.init(
            dsn=str(settings.SENTRY_DSN),
            environment=settings.ENVIRONMENT,
            **sentry_options(),
        )


async def process_cap_jobs(ctx: dict[str, Any]) -> int:  # noqa: ARG001 - arq passes ctx
    from src.database import async_session_factory
    from src.worker import dispatch

    async with async_session_factory() as session:
        return await dispatch.process_due_jobs(
            session=session,
            limit=worker_settings.CAP_JOB_BATCH_SIZE,
            max_attempts=worker_settings.CAP_JOB_MAX_ATTEMPTS,
        )


async def ingest_cap_feeds(ctx: dict[str, Any]) -> int:  # noqa: ARG001 - arq passes ctx
    from src.cap import service as cap_service
    from src.database import async_session_factory

    async with async_session_factory() as session:
        return await cap_service.ingest_all_active_feeds(session=session)


async def send_notification_emails(ctx: dict[str, Any]) -> int:  # noqa: ARG001 - arq passes ctx
    from src.database import async_session_factory
    from src.notifications import dispatch as notification_dispatch

    async with async_session_factory() as session:
        return await notification_dispatch.process_due_deliveries(session=session)


async def run_notification_sweeps(ctx: dict[str, Any]) -> int:  # noqa: ARG001 - arq passes ctx
    from src.database import async_session_factory
    from src.notifications import scheduler

    async with async_session_factory() as session:
        return await scheduler.run_sweeps(session)


class WorkerSettings:
    # Bound heartbeat staleness and prevent another worker masking this one.
    health_check_interval = 30
    health_check_key = f"grenmet:worker:{gethostname()}:health"
    redis_settings = RedisSettings.from_dsn(worker_settings.redis_dsn)
    on_startup = startup
    functions = [
        process_cap_jobs,
        ingest_cap_feeds,
        send_notification_emails,
        run_notification_sweeps,
    ]
    # A poll/ingest run must not hang a worker slot; retries of the cron function
    # itself are pointless because the durable outbox already tracks per-job
    # attempts and backoff, so keep arq-level tries at 1.
    job_timeout = 300
    max_tries = 1
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
        # Drain the notification email outbox every 30 seconds.
        cron(send_notification_emails, second={0, 30}, run_at_startup=True),
        # Daily reminders (expiries, overdue approvals) at 06:00 Grenada (UTC-4).
        cron(run_notification_sweeps, hour=10, minute=0, run_at_startup=False),
    ]
