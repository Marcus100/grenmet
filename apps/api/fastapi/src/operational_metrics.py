"""Best-effort, bounded request/job counters. No visitor or employee identifiers."""

import asyncio
import hashlib
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import Redis
from redis.exceptions import RedisError


class MetricsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TELEMETRY_", extra="ignore")
    ENABLED: bool = False
    WORKER_HEARTBEAT_URL: str = ""
    ENVIRONMENT: str = "development"
    REDIS_URL: str = "redis://localhost:6379/0"


settings = MetricsSettings()
_client: Redis | None = None
TTL = 14 * 86400


def duration_bucket(seconds: float) -> str:
    if seconds < 0.1:
        return "under-100ms"
    if seconds < 0.5:
        return "under-500ms"
    if seconds < 2:
        return "under-2s"
    return "over-2s"


async def record_request(route: str, status: int, duration: float) -> None:
    """Route must be a registered template, never request.url or a submitted value."""
    if not settings.ENABLED or settings.ENVIRONMENT not in {
        "development",
        "staging",
        "production",
    }:
        return
    global _client
    try:
        if _client is None:
            _client = Redis.from_url(
                settings.REDIS_URL, socket_connect_timeout=0.05, socket_timeout=0.05
            )
        async with asyncio.timeout(0.05):
            key = f"telemetry:v1:{settings.ENVIRONMENT}:requests:{datetime.now(UTC):%Y-%m-%d}"
            field = (
                f"{route}|{min(max(status // 100, 1), 5)}xx|{duration_bucket(duration)}"
            )
            async with _client.pipeline(transaction=True) as pipe:
                pipe.hincrby(key, field, 1)
                pipe.expire(key, TTL)
                await pipe.execute()
    except RedisError, TimeoutError, OSError:
        # Monitoring cannot fail or hold up a request when Redis is unavailable.
        return


# Both deduplication and increment are atomic, so retries cannot double count.
_COMPLETION = """
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[2]) then
 redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
 redis.call('EXPIRE', KEYS[2], ARGV[2])
 return 1
end
return 0
"""
JOBS = frozenset(
    {
        "process_cap_jobs",
        "ingest_cap_feeds",
        "send_notification_emails",
        "run_notification_sweeps",
    }
)


async def record_job(redis: Any, name: str, operation_id: str, success: bool) -> None:
    if (
        redis is None
        or not operation_id
        or not settings.ENABLED
        or name not in JOBS
        or settings.ENVIRONMENT not in {"development", "staging", "production"}
    ):
        return
    # Job execution IDs are technical, not customer IDs; store only a digest.
    digest = hashlib.sha256(f"{name}:{operation_id}".encode()).hexdigest()
    base = f"telemetry:v1:{settings.ENVIRONMENT}"
    field = f"{name}|{'completed' if success else 'failed'}"
    try:
        async with asyncio.timeout(0.05):
            await redis.eval(
                _COMPLETION,
                2,
                f"{base}:seen:{digest}:{success}",
                f"{base}:jobs:{datetime.now(UTC):%Y-%m-%d}",
                field,
                TTL,
            )
    except RedisError, TimeoutError, OSError:
        return


async def worker_completed(redis: Any) -> None:
    """Worker poll heartbeat after service completion; never process startup."""
    url = settings.WORKER_HEARTBEAT_URL
    if not url or redis is None:
        return
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname
        not in {"uptime.betterstack.com", "incidents.betterstack.com"}
        or not parsed.path.startswith("/api/v1/heartbeat/")
        or parsed.username
        or parsed.query
    ):
        return
    try:
        async with asyncio.timeout(2):
            # At most once a minute across workers in this environment.
            if not await redis.set(
                f"telemetry:v1:{settings.ENVIRONMENT}:worker-ping", "1", nx=True, ex=60
            ):
                return
            async with httpx.AsyncClient(timeout=1, follow_redirects=False) as client:
                await client.get(url)
    except RedisError, TimeoutError, OSError, httpx.HTTPError:
        return
