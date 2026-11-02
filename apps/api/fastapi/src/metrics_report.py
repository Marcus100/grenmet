"""Internal read-only command: python -m src.metrics_report --days 1|7 | --complete-day.

``--days`` reads the current UTC day and the days before it, so its window is
still filling and the result is never more than ``partial``. ``--complete-day``
reads only the previous, fully elapsed UTC day of job counters and reports
``complete`` when every tracked job recorded at least one outcome that day. The
daily monitoring receipt uses that mode.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from redis.exceptions import RedisError

from src import operational_metrics


def job_coverage_complete(jobs: dict[str, int]) -> bool:
    """True when every tracked job has a completed or failed count."""
    seen = {label.rsplit("|", 1)[0] for label in jobs if "|" in label}
    return operational_metrics.JOBS.issubset(seen)


async def report(days: int) -> dict[str, object]:
    settings = operational_metrics.settings
    result: dict[str, object] = {
        "owner": "gaa",
        "environment": settings.ENVIRONMENT,
        "source": "Redis operational counters",
        "days": days,
        "windowKind": "UTC-calendar-days",
        "start": (datetime.now(UTC) - timedelta(days=days - 1))
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .isoformat(),
        "end": datetime.now(UTC).isoformat(),
        "completeness": "unknown",
        "requests": None,
        "jobs": None,
    }
    if not settings.ENABLED:
        return result
    counts: dict[str, dict[str, int]] = {"requests": {}, "jobs": {}}
    try:
        async with Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=1,
            socket_connect_timeout=1,
        ) as client:
            for kind in counts:
                for offset in range(days):
                    date = datetime.now(UTC) - timedelta(days=offset)
                    key = f"telemetry:v1:{settings.ENVIRONMENT}:{kind}:{date:%Y-%m-%d}"
                    values = await client.hgetall(key)
                    for label, count in values.items():
                        counts[kind][label] = counts[kind].get(label, 0) + int(count)
        result.update(
            completeness="partial" if any(counts.values()) else "unknown",
            **{kind: values or None for kind, values in counts.items()},
        )
    except RedisError, OSError, ValueError:
        return result
    return result


async def complete_day_report(now: datetime | None = None) -> dict[str, object]:
    """Job counters for the previous full UTC day; reads exactly one Redis key."""
    settings = operational_metrics.settings
    end = (now or datetime.now(UTC)).replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=1)
    result: dict[str, object] = {
        "owner": "gaa",
        "environment": settings.ENVIRONMENT,
        "source": "Redis operational counters",
        "days": 1,
        "windowKind": "previous-UTC-day",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "completeness": "unknown",
        "requests": None,
        "jobs": None,
    }
    if not settings.ENABLED:
        return result
    key = f"telemetry:v1:{settings.ENVIRONMENT}:jobs:{start:%Y-%m-%d}"
    try:
        async with Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=1,
            socket_connect_timeout=1,
        ) as client:
            values = await client.hgetall(key)
        jobs = {label: int(count) for label, count in values.items()}
    except RedisError, OSError, ValueError:
        return result
    if jobs:
        result.update(
            jobs=jobs,
            completeness="complete" if job_coverage_complete(jobs) else "partial",
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    window = parser.add_mutually_exclusive_group()
    window.add_argument("--days", type=int, choices=[1, 7], default=1)
    window.add_argument("--complete-day", action="store_true")
    args = parser.parse_args()
    data = (
        asyncio.run(complete_day_report())
        if args.complete_day
        else asyncio.run(report(args.days))
    )
    sys.stdout.write(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
