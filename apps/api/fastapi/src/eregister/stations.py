"""Station settings: the facts behind QFE and QNH (owner decision 2026-10-23).

Elevation and the total barometer corrections are not known yet, so the columns
are empty and nothing here supplies a default. Reading is open to register
staff; changing them needs ``eregister.qc``.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import StationSettings, StationSettingsUpdate

_SELECT = text(
    "SELECT station_id, elevation_m, barometer_correction_hpa, updated_at,"
    " settings_updated_by FROM observations.stations WHERE station_id = :station"
)


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _settings(row: dict[str, Any]) -> StationSettings:
    elevation = _number(row["elevation_m"])
    correction = _number(row["barometer_correction_hpa"])
    pending: list[Any] = []
    if elevation is None:
        pending.append("elevation_m")
    if correction is None:
        pending.append("barometer_correction_hpa")
    return StationSettings(
        station_id=row["station_id"],
        elevation_m=elevation,
        barometer_correction_hpa=correction,
        pending=pending,
        updated_at=row["updated_at"],
        updated_by=row["settings_updated_by"],
    )


async def get(register: AsyncSession, station_id: str) -> StationSettings | None:
    result = await register.execute(_SELECT, {"station": station_id})
    row = result.mappings().first()
    return None if row is None else _settings(dict(row))


async def update(
    register: AsyncSession,
    station_id: str,
    data: StationSettingsUpdate,
    *,
    actor: str,
) -> StationSettings | None:
    result = await register.execute(
        text(
            "UPDATE observations.stations SET elevation_m = :elevation,"
            " barometer_correction_hpa = :correction, settings_updated_by = :actor,"
            " updated_at = now() WHERE station_id = :station"
            " RETURNING station_id, elevation_m, barometer_correction_hpa,"
            " updated_at, settings_updated_by"
        ),
        {
            "station": station_id,
            "elevation": data.elevation_m,
            "correction": data.barometer_correction_hpa,
            "actor": actor,
        },
    )
    row = result.mappings().first()
    await register.commit()
    return None if row is None else _settings(dict(row))
