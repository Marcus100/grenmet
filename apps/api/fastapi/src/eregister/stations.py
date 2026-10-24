"""Station pressure amounts (owner confirmed for 78958, 2026-10-24).

The register works the pressures out of the barometer as read with four fixed
amounts per station: the total barometer correction (station pressure), and the
QFE, mean sea level and QNH offsets. 78958 is seeded by migration
``eregister_0005``; any other station stays empty until staff enter its amounts.
Reading is open to register staff; changing them needs ``eregister.qc``.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from .derive import PressureSettings
from .schemas import PressureAmount, StationSettings, StationSettingsUpdate

AMOUNTS: tuple[PressureAmount, ...] = (
    "total_correction_hpa",
    "qfe_offset_hpa",
    "sea_level_offset_hpa",
    "qnh_offset_hpa",
)
_SELECT = text(
    "SELECT station_id, total_correction_hpa, qfe_offset_hpa,"
    " sea_level_offset_hpa, qnh_offset_hpa, updated_at, settings_updated_by"
    " FROM observations.stations WHERE station_id = :station"
)
_UPDATE = text(
    "UPDATE observations.stations SET total_correction_hpa = :total_correction_hpa,"
    " qfe_offset_hpa = :qfe_offset_hpa,"
    " sea_level_offset_hpa = :sea_level_offset_hpa,"
    " qnh_offset_hpa = :qnh_offset_hpa,"
    " settings_updated_by = :actor, updated_at = now()"
    " WHERE station_id = :station"
    " RETURNING station_id, total_correction_hpa, qfe_offset_hpa,"
    " sea_level_offset_hpa, qnh_offset_hpa, updated_at, settings_updated_by"
)


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _settings(row: dict[str, Any]) -> StationSettings:
    amounts = {name: _number(row[name]) for name in AMOUNTS}
    return StationSettings(
        station_id=row["station_id"],
        **amounts,
        pending=[name for name in AMOUNTS if amounts[name] is None],
        updated_at=row["updated_at"],
        updated_by=row["settings_updated_by"],
    )


def pressure_settings(settings: StationSettings | None) -> PressureSettings | None:
    if settings is None:
        return None
    return PressureSettings(
        total_correction_hpa=settings.total_correction_hpa,
        qfe_offset_hpa=settings.qfe_offset_hpa,
        sea_level_offset_hpa=settings.sea_level_offset_hpa,
        qnh_offset_hpa=settings.qnh_offset_hpa,
    )


async def get(register: AsyncSession, station_id: str) -> StationSettings | None:
    result = await register.execute(_SELECT, {"station": station_id})
    row = result.mappings().first()
    return None if row is None else _settings(dict(row))


async def pressure_for(
    register: AsyncSession | None, station_id: str | None
) -> PressureSettings | None:
    """The station's pressure amounts, or None (unknown station or register down)."""
    if register is None or not (station_id or "").strip():
        return None
    try:
        return pressure_settings(await get(register, (station_id or "").strip()))
    except SQLAlchemyError, OSError:
        return None


async def update(
    register: AsyncSession,
    station_id: str,
    data: StationSettingsUpdate,
    *,
    actor: str,
) -> StationSettings | None:
    result = await register.execute(
        _UPDATE, {"station": station_id, "actor": actor, **data.model_dump()}
    )
    row = result.mappings().first()
    await register.commit()
    return None if row is None else _settings(dict(row))
