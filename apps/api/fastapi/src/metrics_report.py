"""Internal read-only command: python -m src.metrics_report --days 1|7."""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from redis.exceptions import RedisError

from src import operational_metrics


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, choices=[1, 7], default=1)
    args = parser.parse_args()
    sys.stdout.write(json.dumps(asyncio.run(report(args.days)), indent=2) + "\n")


if __name__ == "__main__":
    main()
