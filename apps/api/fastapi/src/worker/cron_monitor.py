"""Sentry Cron check-ins for key ARQ jobs, so a job that stops running alerts.

``monitored`` wraps an ARQ coroutine. It is a no-op unless Sentry is initialised
*and* ``SENTRY_CRONS_ENABLED`` is true: each Sentry cron monitor can be billable,
so the owner turns this on after checking the plan's included monitors.
Check-ins never raise into the job; the job's own exception is re-raised.

Slugs are stable and environment-scoped: ``<environment>-worker-<job-name>``
(for example ``production-worker-drain-outbox``). The monitor config is sent with
each check-in, so Sentry creates or updates the monitor; no manual setup.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Coroutine
from functools import wraps
from typing import Any

import sentry_sdk
from sentry_sdk.crons import MonitorStatus, capture_checkin

from src.worker.config import worker_settings

logger = logging.getLogger(__name__)


def slug(job_name: str, environment: str) -> str:
    return f"{environment}-worker-{job_name.replace('_', '-')}"[:50]


def _environment() -> str:
    from src.config import settings

    return settings.ENVIRONMENT


def _active() -> bool:
    return worker_settings.SENTRY_CRONS_ENABLED and sentry_sdk.is_initialized()


def _checkin(**kwargs: Any) -> str | None:
    try:
        return capture_checkin(**kwargs)
    except Exception:
        # Monitoring must never fail or hold up the job.
        logger.warning(
            "Sentry check-in failed", extra={"slug": kwargs.get("monitor_slug")}
        )
        return None


def monitored[**P, R](
    *,
    schedule: str,
    checkin_margin: int,
    max_runtime: int,
    min_interval_seconds: float = 0,
) -> Callable[
    [Callable[P, Coroutine[Any, Any, R]]], Callable[P, Coroutine[Any, Any, R]]
]:
    """Report check-ins for an ARQ job.

    ``schedule`` is a UTC crontab; ``checkin_margin`` and ``max_runtime`` are
    minutes. Sub-minute jobs set ``min_interval_seconds=60`` so at most one run a
    minute per process reports (Sentry rate-limits check-ins per monitor)."""
    config = {
        "schedule": {"type": "crontab", "value": schedule},
        "checkin_margin": checkin_margin,
        "max_runtime": max_runtime,
        "timezone": "UTC",
        "failure_issue_threshold": 2,
        "recovery_threshold": 1,
    }

    def decorate(
        fn: Callable[P, Coroutine[Any, Any, R]],
    ) -> Callable[P, Coroutine[Any, Any, R]]:
        last_reported = float("-inf")

        @wraps(fn)
        async def inner(*args: P.args, **kwargs: P.kwargs) -> R:
            nonlocal last_reported
            if not _active():
                return await fn(*args, **kwargs)
            started = time.monotonic()
            if started - last_reported < min_interval_seconds:
                return await fn(*args, **kwargs)
            last_reported = started
            try:
                monitor_slug = slug(fn.__name__, _environment())
            except Exception:
                return await fn(*args, **kwargs)
            check_in_id = _checkin(
                monitor_slug=monitor_slug,
                status=MonitorStatus.IN_PROGRESS,
                monitor_config=config,
            )
            try:
                result = await fn(*args, **kwargs)
            except BaseException:
                _checkin(
                    monitor_slug=monitor_slug,
                    check_in_id=check_in_id,
                    status=MonitorStatus.ERROR,
                    duration=time.monotonic() - started,
                    monitor_config=config,
                )
                raise
            _checkin(
                monitor_slug=monitor_slug,
                check_in_id=check_in_id,
                status=MonitorStatus.OK,
                duration=time.monotonic() - started,
                monitor_config=config,
            )
            return result

        return inner

    return decorate
