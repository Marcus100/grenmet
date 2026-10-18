"""Redis cache for polled flight rows. No Redis (REDIS_URL unset) means no data."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from redis.asyncio import Redis

from src.worker.config import worker_settings

from .schemas import FlightRow

logger = logging.getLogger(__name__)

_client: Redis | None = None


def _get_client() -> Redis | None:
    global _client
    if not worker_settings.REDIS_URL:
        return None
    if _client is None:
        _client = Redis.from_url(worker_settings.REDIS_URL, decode_responses=True)
    return _client


def cache_key(airport: str, board: str) -> str:
    return f"grenmet:flights:{airport}:{board}"


async def store_board(
    *, airport: str, board: str, source: str, rows: list[FlightRow], ttl: int
) -> bool:
    client = _get_client()
    if client is None:
        return False
    doc = {
        "source": source,
        "fetched_at": datetime.now(UTC).isoformat(),
        "rows": [r.model_dump(mode="json") for r in rows],
    }
    await client.set(cache_key(airport, board), json.dumps(doc), ex=ttl)
    return True


async def load_board(
    *, airport: str, board: str
) -> tuple[str, datetime, list[FlightRow]] | None:
    client = _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(cache_key(airport, board))
        if raw is None:
            return None
        doc = json.loads(raw)
        return (
            str(doc["source"]),
            datetime.fromisoformat(doc["fetched_at"]),
            [FlightRow.model_validate(r) for r in doc["rows"]],
        )
    except Exception:  # noqa: BLE001 - a cache fault must read as "unavailable"
        logger.warning("flight cache read failed", exc_info=True)
        return None
