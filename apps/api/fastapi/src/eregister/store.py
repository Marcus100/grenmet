"""Canonical observation store (ADR-0032): idempotent upsert by natural key."""

from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def is_top_of_hour(moment: datetime) -> bool:
    utc = moment.astimezone(UTC)
    return utc.minute == 0 and utc.second == 0 and utc.microsecond == 0


async def upsert_observation(
    register: AsyncSession,
    *,
    station_id: str,
    element: str,
    valid_time_utc: datetime,
    source: str,
    value: float | None,
    unit: str | None = None,
) -> None:
    """Insert or update by ``(station, element, valid_time_utc, source)``.

    Rows that are not top-of-hour are stored with ``is_hourly`` false and are
    never mapped to hourly products. Raises ``ValueError`` for a naive time.
    """
    if valid_time_utc.tzinfo is None:
        raise ValueError("valid_time_utc must be timezone-aware")
    await register.execute(
        text(
            "INSERT INTO observations.observations (station_id, element,"
            " valid_time_utc, source, value, unit, is_hourly) VALUES (:station,"
            " :element, :time, :source, :value, :unit, :hourly)"
            " ON CONFLICT ON CONSTRAINT observations_natural_key DO UPDATE SET"
            " value = EXCLUDED.value, unit = EXCLUDED.unit, updated_at = now()"
        ),
        {
            "station": station_id,
            "element": element,
            "time": valid_time_utc.astimezone(UTC),
            "source": source,
            "value": value,
            "unit": unit,
            "hourly": is_top_of_hour(valid_time_utc),
        },
    )
    await register.commit()
