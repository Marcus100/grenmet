"""Almanac logic: store yearly astronomy and tides, read them for the public API.

Writes run from the scripts (``scripts/build_almanac_year.py``,
``scripts/import_tide_table.py``), never from a request. Reads filter, order and
limit in SQL; Python only shapes the result. Local times render in Grenada time.
"""

import logging
from collections.abc import Iterable, Sequence
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal, cast

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.timezones import GRENADA, local_to_utc

from . import astro
from .exceptions import AlmanacRangeError
from .locations import LOCATIONS, Location
from .models import AstroDay, MoonPhaseEvent, TidePrediction
from .schemas import (
    AstronomyDay,
    AstronomyResponse,
    LocationOut,
    PrincipalPhase,
    TideEvent,
    TidesResponse,
    TimeOfDay,
)
from .tides import TIDE_STATIONS, TideRow

logger = logging.getLogger(__name__)

#: Longest date range one public request may ask for (one year and a day).
MAX_RANGE_DAYS = 366
CHUNK_SIZE = 500

PhaseKey = Literal["new", "first_quarter", "full", "last_quarter"]
EventType = Literal["HIGH", "LOW"]

ASTRO_UPDATE_COLUMNS = (
    "sunrise_utc",
    "sunset_utc",
    "civil_dawn_utc",
    "civil_dusk_utc",
    "moonrise_utc",
    "moonset_utc",
    "moon_phase",
)
TIDE_UPDATE_COLUMNS = (
    "event_type",
    "height_m_mllw",
    "timing_quality",
    "status",
    "source_label",
    "source_version",
)


def check_range(first: date, last: date) -> None:
    """Reject empty, reversed and over-long ranges (422)."""
    if last < first:
        raise AlmanacRangeError("'to' must be on or after 'from'")
    if (last - first).days + 1 > MAX_RANGE_DAYS:
        raise AlmanacRangeError(f"The range may cover at most {MAX_RANGE_DAYS} days")


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(UTC).replace(tzinfo=None)


def _aware_utc(value: datetime) -> datetime:
    """Stored naive UTC, returned as aware UTC for serialisation."""
    return value.replace(tzinfo=UTC)


def _local_iso(value: datetime) -> str:
    return _aware_utc(value).astimezone(GRENADA).isoformat(timespec="seconds")


def _time_of_day(value: datetime | None) -> TimeOfDay:
    if value is None:
        return TimeOfDay()
    return TimeOfDay(utc=_aware_utc(value), local=_local_iso(value))


def _chunks(items: Sequence[dict[str, Any]]) -> Iterable[Sequence[dict[str, Any]]]:
    for start in range(0, len(items), CHUNK_SIZE):
        yield items[start : start + CHUNK_SIZE]


def _dates(first: date, last: date) -> list[date]:
    days: list[date] = []
    day = first
    while day <= last:
        days.append(day)
        day += timedelta(days=1)
    return days


def _location(key: str) -> Location:
    location = LOCATIONS.get(key)
    if location is None:
        raise KeyError(key)
    return location


async def store_astronomy(
    session: AsyncSession, location_key: str, first: date, last: date
) -> int:
    """Compute and upsert sun, twilight and moon rows for each date in the range."""
    location = _location(location_key)
    values = [
        {
            "location_key": location.key,
            "local_date": day.local_date,
            "sunrise_utc": _naive_utc(day.sunrise_utc),
            "sunset_utc": _naive_utc(day.sunset_utc),
            "civil_dawn_utc": _naive_utc(day.civil_dawn_utc),
            "civil_dusk_utc": _naive_utc(day.civil_dusk_utc),
            "moonrise_utc": _naive_utc(day.moonrise_utc),
            "moonset_utc": _naive_utc(day.moonset_utc),
            "moon_phase": day.moon_phase,
        }
        for day in (
            astro.compute_day(location.latitude, location.longitude, one)
            for one in _dates(first, last)
        )
    ]
    for chunk in _chunks(values):
        statement = insert(AstroDay).values(list(chunk))
        statement = statement.on_conflict_do_update(
            constraint="uq_almanac_astro_day",
            set_={name: statement.excluded[name] for name in ASTRO_UPDATE_COLUMNS},
        )
        await session.execute(statement)
    await session.commit()
    logger.info(
        "almanac astronomy stored",
        extra={"location": location.key, "days": len(values)},
    )
    return len(values)


async def store_phase_events(
    session: AsyncSession, first_year: int, last_year: int
) -> int:
    """Replace the principal phases dated in the given years (idempotent)."""
    phases = astro.principal_phase_dates(first_year, last_year)
    await session.execute(
        delete(MoonPhaseEvent).where(
            MoonPhaseEvent.local_date >= date(first_year, 1, 1),
            MoonPhaseEvent.local_date <= date(last_year, 12, 31),
        )
    )
    values = [{"phase_key": key, "local_date": day} for key, day in phases]
    for chunk in _chunks(values):
        await session.execute(insert(MoonPhaseEvent).values(list(chunk)))
    await session.commit()
    return len(values)


async def upsert_tides(session: AsyncSession, rows: Iterable[TideRow]) -> int:
    """Insert or update predicted tides keyed by (station, time). Re-running is safe."""
    values = [
        {
            "station_key": row.station_key,
            "event_type": row.event_type,
            "time_utc": row.time_utc,
            "height_m_mllw": row.height_m_mllw,
            "timing_quality": row.timing_quality,
            "status": row.status,
            "source_label": row.source_label,
            "source_version": row.source_version,
        }
        for row in rows
    ]
    for chunk in _chunks(values):
        statement = insert(TidePrediction).values(list(chunk))
        statement = statement.on_conflict_do_update(
            constraint="uq_almanac_tide_station_time",
            set_={name: statement.excluded[name] for name in TIDE_UPDATE_COLUMNS},
        )
        await session.execute(statement)
    await session.commit()
    return len(values)


async def get_astronomy(
    session: AsyncSession, location_key: str, first: date, last: date
) -> AstronomyResponse:
    check_range(first, last)
    location = _location(location_key)
    day_rows = (
        (
            await session.execute(
                select(AstroDay)
                .where(
                    AstroDay.location_key == location.key,
                    AstroDay.local_date >= first,
                    AstroDay.local_date <= last,
                )
                .order_by(AstroDay.local_date)
            )
        )
        .scalars()
        .all()
    )
    phase_rows = await _phases_around(session, first, last)
    return AstronomyResponse(
        location=LocationOut(
            key=location.key,
            name=location.name,
            latitude=location.latitude,
            longitude=location.longitude,
        ),
        days=[_astronomy_day(row) for row in day_rows],
        phases=[
            PrincipalPhase(phase=cast(PhaseKey, row.phase_key), date=row.local_date)
            for row in phase_rows
        ],
    )


async def get_tides(
    session: AsyncSession, station_key: str, first: date, last: date
) -> TidesResponse:
    check_range(first, last)
    station = TIDE_STATIONS[station_key]
    # Grenada local days as UTC instants, so the day filter is a range in SQL.
    start = local_to_utc(first, time(0), GRENADA)
    stop = local_to_utc(last + timedelta(days=1), time(0), GRENADA)
    rows = (
        (
            await session.execute(
                select(TidePrediction)
                .where(
                    TidePrediction.station_key == station.key,
                    TidePrediction.time_utc >= start,
                    TidePrediction.time_utc < stop,
                )
                .order_by(TidePrediction.time_utc)
            )
        )
        .scalars()
        .all()
    )
    latest = rows[-1] if rows else None
    return TidesResponse(
        station=station.key,
        name=station.name,
        status=latest.status if latest else None,
        source_label=latest.source_label if latest else None,
        source_version=latest.source_version if latest else None,
        events=[
            TideEvent(
                event_type=cast(EventType, row.event_type),
                time_utc=_aware_utc(row.time_utc),
                time_local=_local_iso(row.time_utc),
                height_m_mllw=float(row.height_m_mllw),
                timing_quality=row.timing_quality,
            )
            for row in rows
        ],
    )


async def _phases_around(
    session: AsyncSession, first: date, last: date
) -> list[MoonPhaseEvent]:
    """Phases inside the range, plus the nearest one before and after it."""
    inside = (
        (
            await session.execute(
                select(MoonPhaseEvent)
                .where(
                    MoonPhaseEvent.local_date >= first,
                    MoonPhaseEvent.local_date <= last,
                )
                .order_by(MoonPhaseEvent.local_date)
            )
        )
        .scalars()
        .all()
    )
    before = (
        (
            await session.execute(
                select(MoonPhaseEvent)
                .where(MoonPhaseEvent.local_date < first)
                .order_by(MoonPhaseEvent.local_date.desc())
                .limit(1)
            )
        )
        .scalars()
        .all()
    )
    after = (
        (
            await session.execute(
                select(MoonPhaseEvent)
                .where(MoonPhaseEvent.local_date > last)
                .order_by(MoonPhaseEvent.local_date)
                .limit(1)
            )
        )
        .scalars()
        .all()
    )
    return [*before, *inside, *after]


def _astronomy_day(row: AstroDay) -> AstronomyDay:
    return AstronomyDay(
        date=row.local_date,
        sunrise=_time_of_day(row.sunrise_utc),
        sunset=_time_of_day(row.sunset_utc),
        civil_dawn=_time_of_day(row.civil_dawn_utc),
        civil_dusk=_time_of_day(row.civil_dusk_utc),
        moonrise=_time_of_day(row.moonrise_utc),
        moonset=_time_of_day(row.moonset_utc),
        moon_phase=row.moon_phase,
    )
