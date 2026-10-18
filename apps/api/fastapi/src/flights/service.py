from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from . import cache
from .config import SUPPORTED_AIRPORTS, FlightsConfig, flights_settings
from .providers import BoardName, FlightProvider, FlightProviderError, OpenSkyProvider
from .schemas import FlightBoardResponse

logger = logging.getLogger(__name__)

BOARDS: tuple[BoardName, ...] = ("arrivals", "departures")


async def get_board(
    *,
    airport: str,
    board: BoardName,
    config: FlightsConfig = flights_settings,
) -> FlightBoardResponse:
    unavailable = FlightBoardResponse(available=False, airport=airport, board=board)
    if not config.FLIGHTS_OPENSKY_ENABLED:
        return unavailable
    cached = await cache.load_board(airport=airport, board=board)
    if cached is None or not cached[2]:
        return unavailable
    source, fetched_at, rows = cached
    return FlightBoardResponse(
        available=True,
        airport=airport,
        board=board,
        source=source,
        fetched_at=fetched_at,
        is_sample=False,
        rows=rows,
    )


async def poll_flights(
    *,
    provider: FlightProvider | None = None,
    config: FlightsConfig = flights_settings,
    now: datetime | None = None,
) -> dict[str, int]:
    """Refresh the cache for every supported airport. No-op when the flag is off.

    Returns rows cached per board key; a failing board keeps its previous
    cache entry until the TTL lapses.
    """
    if not config.FLIGHTS_OPENSKY_ENABLED:
        return {}
    provider = provider or OpenSkyProvider(config=config)
    end = now or datetime.now(UTC)
    begin = end - timedelta(hours=config.FLIGHTS_WINDOW_HOURS)
    result: dict[str, int] = {}
    for airport in SUPPORTED_AIRPORTS:
        for board in BOARDS:
            try:
                rows = await provider.fetch(
                    airport=airport, board=board, begin=begin, end=end
                )
                await cache.store_board(
                    airport=airport,
                    board=board,
                    source=provider.name,
                    rows=rows,
                    ttl=config.FLIGHTS_CACHE_TTL_SECONDS,
                )
                result[f"{airport}:{board}"] = len(rows)
            except FlightProviderError:
                logger.warning(
                    "flight poll failed", extra={"airport": airport, "board": board}
                )
    return result
