"""Station pressure amounts (owner confirmed for 78958, 2026-10-24).

The register works the pressures out of the barometer as read with four fixed
amounts per station: the total barometer correction (station pressure), and the
QFE, mean sea level and QNH offsets. 78958 is seeded by migration
``eregister_0006``; any other station stays empty until staff enter its amounts.
Reading is open to register staff; changing them needs ``eregister.qc``.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User

from .derive import PressureSettings
from .schemas import PressureAmount, StationSettings, StationSettingsUpdate

AUDIT_ENTITY = "eregister_station_settings"
AMOUNTS: tuple[PressureAmount, ...] = (
    "total_correction_hpa",
    "qfe_offset_hpa",
    "sea_level_offset_hpa",
    "qnh_offset_hpa",
)
_SELECT = text(
    "SELECT station_id, total_correction_hpa, qfe_offset_hpa, sea_level_offset_hpa,"
    " qnh_offset_hpa, updated_at, settings_updated_by"
    " FROM observations.stations WHERE station_id = :station"
)
# Fixed column names, written out so no SQL is built from strings.
_LOCK = text(
    "SELECT 1 FROM observations.stations WHERE station_id = :station FOR UPDATE"
)
_UPDATE = text(
    "UPDATE observations.stations SET total_correction_hpa = :total_correction_hpa,"
    " qfe_offset_hpa = :qfe_offset_hpa, sea_level_offset_hpa = :sea_level_offset_hpa,"
    " qnh_offset_hpa = :qnh_offset_hpa, settings_updated_by = :actor,"
    " updated_at = now() WHERE station_id = :station"
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
        # A failed statement leaves the transaction aborted: clear it so the caller's
        # next statement (the save lock) does not fail on a dead transaction.
        await register.rollback()
        return None


async def update(
    register: AsyncSession,
    station_id: str,
    data: StationSettingsUpdate,
    *,
    actor: str,
) -> tuple[StationSettings | None, StationSettings | None]:
    """Replace the amounts. Returns (before, after); both None for an unknown station."""
    # Lock the row so the before values are the ones this update replaces.
    await register.execute(_LOCK, {"station": station_id})
    before = await get(register, station_id)
    result = await register.execute(
        _UPDATE, {"station": station_id, "actor": actor, **data.model_dump()}
    )
    row = result.mappings().first()
    await register.commit()
    return before, None if row is None else _settings(dict(row))


async def record_change(
    app_session: AsyncSession,
    *,
    user: User,
    station_id: str,
    before: StationSettings,
    after: StationSettings,
) -> None:
    """Audit entry (application database) with the amounts before and after."""
    audit_service.set_actor(app_session, user.id)
    await audit_service.record_change(
        app_session,
        entity_type=AUDIT_ENTITY,
        entity_id=station_id,
        record_type=AUDIT_ENTITY,
        record_id=station_id,
        action="update",
        changes={
            name: (getattr(before, name), getattr(after, name)) for name in AMOUNTS
        },
    )
    await app_session.commit()
