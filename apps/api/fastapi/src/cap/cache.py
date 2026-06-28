"""Redis response cache for CAP public feeds.

Reuses the existing Redis (worker_settings.REDIS_URL). When REDIS_URL is unset the
helpers are transparent no-ops (so dev/tests behave exactly as before). Replaces
capcomposer's wagtail-cache.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis

from src.worker.config import worker_settings

logger = logging.getLogger(__name__)

_client: Redis | None = None


def _get_client() -> Redis | None:
    global _client
    if not worker_settings.REDIS_URL:
        return None
    if _client is None:
        _client = Redis.from_url(worker_settings.REDIS_URL, decode_responses=True)
    return _client


async def cached_json(
    key: str, ttl: int, producer: Callable[[], Awaitable[Any]]
) -> Any:
    """Get-or-set a JSON-serialisable value. Falls back to producer if no Redis."""
    client = _get_client()
    if client is None:
        return await producer()
    try:
        hit = await client.get(key)
        if hit is not None:
            return json.loads(hit)
    except Exception:  # noqa: BLE001 - cache must never break the request
        logger.warning("cache get failed", extra={"key": key}, exc_info=True)
    value = await producer()
    try:
        await client.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:  # noqa: BLE001
        logger.warning("cache set failed", extra={"key": key}, exc_info=True)
    return value


async def cached_text(
    key: str, ttl: int, producer: Callable[[], Awaitable[str]]
) -> str:
    """Get-or-set a raw string (e.g. XML/RSS body)."""
    client = _get_client()
    if client is None:
        return await producer()
    try:
        hit = await client.get(key)
        if hit is not None:
            return str(hit)
    except Exception:  # noqa: BLE001
        logger.warning("cache get failed", extra={"key": key}, exc_info=True)
    value = await producer()
    try:
        await client.set(key, value, ex=ttl)
    except Exception:  # noqa: BLE001
        logger.warning("cache set failed", extra={"key": key}, exc_info=True)
    return value


async def invalidate(*keys: str) -> None:
    """Delete cache keys (no-op without Redis). Call after publish/cancel."""
    client = _get_client()
    if client is None or not keys:
        return
    try:
        await client.delete(*keys)
    except Exception:  # noqa: BLE001
        logger.warning("cache invalidate failed", exc_info=True)


# Stable keys for the public feeds.
PUBLIC_LATEST_ACTIVE = "cap:public:latest-active"
PUBLIC_GEOJSON = "cap:public:geojson"
PUBLIC_RSS = "cap:public:rss"


def public_xml_key(identifier: str) -> str:
    return f"cap:public:xml:{identifier}"


PUBLIC_FEED_KEYS = (PUBLIC_LATEST_ACTIVE, PUBLIC_GEOJSON, PUBLIC_RSS)
