from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.datetime import utc_now

from . import parsing, providers
from .config import EnvironmentalConfig, environmental_settings
from .models import EnvironmentSeries
from .points import (
    ATTRIBUTION_AIR,
    ATTRIBUTION_MARINE,
    POINTS,
    Point,
)
from .schemas import AirResponse, AirRow, MarineResponse, MarineRow, Provenance

logger = logging.getLogger(__name__)

MARINE_SOURCE = "Copernicus Marine Service (Global Ocean analysis and forecast)"
AIR_SOURCE = "Copernicus Atmosphere Monitoring Service (CAMS global forecast)"
# Marine series start a few hours back so the current sea state is included.
MARINE_LOOKBACK = timedelta(hours=6)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _nearest(rows: list[Any], now: datetime) -> Any | None:
    if not rows:
        return None
    return min(rows, key=lambda r: abs((_aware(r.time) - now).total_seconds()))


async def _load(
    session: AsyncSession, kind: str, point_id: str
) -> EnvironmentSeries | None:
    result = await session.execute(
        select(EnvironmentSeries).where(
            EnvironmentSeries.kind == kind, EnvironmentSeries.point_id == point_id
        )
    )
    return result.scalar_one_or_none()


def _provenance(row: EnvironmentSeries, source: str) -> Provenance:
    return Provenance(
        source=source,
        issued_at=_aware(row.issued_at),
        fetched_at=_aware(row.fetched_at),
    )


def _is_stale(
    row: EnvironmentSeries, config: EnvironmentalConfig, now: datetime
) -> bool:
    age = now - _aware(row.fetched_at)
    return age > timedelta(hours=config.ENVIRONMENT_STALE_AFTER_HOURS)


async def get_marine(
    session: AsyncSession,
    point: Point,
    *,
    config: EnvironmentalConfig = environmental_settings,
    now: datetime | None = None,
) -> MarineResponse:
    now = now or datetime.now(UTC)
    base: dict[str, Any] = {
        "point": point.id,
        "point_name": point.name,
        "lat": point.lat,
        "lon": point.lon,
        "attribution": ATTRIBUTION_MARINE,
    }
    if not config.marine_enabled:
        return MarineResponse(available=False, **base)
    stored = await _load(session, "marine", point.id)
    if stored is None or not stored.rows:
        return MarineResponse(available=False, **base)
    series = [MarineRow.model_validate(r) for r in stored.rows]
    return MarineResponse(
        available=True,
        provenance=_provenance(stored, MARINE_SOURCE),
        stale=_is_stale(stored, config, now),
        latest=_nearest(series, now),
        series=series,
        **base,
    )


async def get_air(
    session: AsyncSession,
    point: Point,
    *,
    config: EnvironmentalConfig = environmental_settings,
    now: datetime | None = None,
) -> AirResponse:
    now = now or datetime.now(UTC)
    base: dict[str, Any] = {
        "point": point.id,
        "point_name": point.name,
        "lat": point.lat,
        "lon": point.lon,
        "attribution": ATTRIBUTION_AIR,
    }
    if not config.air_enabled:
        return AirResponse(available=False, **base)
    stored = await _load(session, "air", point.id)
    if stored is None or not stored.rows:
        return AirResponse(available=False, **base)
    series = [AirRow.model_validate(r) for r in stored.rows]
    return AirResponse(
        available=True,
        provenance=_provenance(stored, AIR_SOURCE),
        stale=_is_stale(stored, config, now),
        latest=_nearest(series, now),
        series=series,
        **base,
    )


async def _store(
    session: AsyncSession,
    *,
    kind: str,
    rows_by_point: dict[str, list[dict[str, Any]]],
    issued_at: datetime,
    products: str,
) -> None:
    fetched = utc_now()
    issued = _aware(issued_at).astimezone(UTC).replace(tzinfo=None)
    for point_id, rows in rows_by_point.items():
        if not rows:
            continue
        statement = insert(EnvironmentSeries).values(
            kind=kind,
            point_id=point_id,
            issued_at=issued,
            fetched_at=fetched,
            products=products,
            rows=rows,
        )
        await session.execute(
            statement.on_conflict_do_update(
                constraint="uq_environment_series_point",
                set_={
                    "issued_at": issued,
                    "fetched_at": fetched,
                    "products": products,
                    "rows": rows,
                },
            )
        )
    await session.commit()


async def refresh_marine(
    session: AsyncSession,
    *,
    config: EnvironmentalConfig = environmental_settings,
    now: datetime | None = None,
) -> int:
    """Fetch and store marine series. Returns points stored; 0 when disabled.

    A provider failure raises ProviderError and leaves the previous rows.
    """
    if not config.marine_enabled:
        return 0
    now = now or datetime.now(UTC)
    start = now - MARINE_LOOKBACK
    end = now + timedelta(hours=config.ENVIRONMENT_FORECAST_HOURS)
    waves, sst = await asyncio.to_thread(
        providers.fetch_marine, config, start=start, end=end
    )
    rows = parsing.parse_marine(waves, sst, POINTS, start=start, end=end)
    # The product does not expose the run time through a subset; use the newest
    # model step at or before the fetch.
    past = [
        datetime.fromisoformat(r["time"])
        for series in rows.values()
        for r in series
        if datetime.fromisoformat(r["time"]) <= now
    ]
    issued_at = max(past) if past else now
    await _store(
        session,
        kind="marine",
        rows_by_point=rows,
        issued_at=issued_at,
        products=f"{config.COPERNICUS_WAVE_DATASET_ID},{config.COPERNICUS_SST_DATASET_ID}",
    )
    return sum(1 for series in rows.values() if series)


async def refresh_air(
    session: AsyncSession,
    *,
    config: EnvironmentalConfig = environmental_settings,
    now: datetime | None = None,
) -> int:
    """Fetch and store CAMS series. Returns points stored; 0 when disabled."""
    if not config.air_enabled:
        return 0
    now = now or datetime.now(UTC)
    run = providers.latest_cams_run(now)
    ds = await asyncio.to_thread(providers.fetch_cams, config, run=run)
    rows = parsing.parse_cams(
        ds,
        POINTS,
        end=run + timedelta(hours=config.ENVIRONMENT_FORECAST_HOURS),
    )
    await _store(
        session,
        kind="air",
        rows_by_point=rows,
        issued_at=parsing.cams_issued_at(ds),
        products=config.CAMS_DATASET_ID,
    )
    return sum(1 for series in rows.values() if series)
