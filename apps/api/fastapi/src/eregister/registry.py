"""Observation station registry: list, add and edit stations (ADR-0032).

``observations.stations`` decides, through ``gate.py``, which source publishes a
station-hour. Staff keep it here instead of by SQL. 78958 stays the manual
observer station (all 24 UTC hours); the automatic weather station and any other
station are separate rows with their own identifier and WIGOS identifier.
Reading is open to register staff; changing needs ``eregister.qc``. The register
database cannot share a transaction with the audit log, so the audit entry is a
second commit (as for the pressure amounts in ``stations.py``).
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppException, AppValidationError, NotFoundError

from .gate import SOURCE_AUTOMATIC, SOURCE_MANUAL
from .schemas import ALL_HOURS, StationCreate, StationRecord, StationUpdate

AUDIT_ENTITY = "eregister_station"
FIELDS = ("name", "wigos_id", "source_kind", "manual_hours_utc", "active")
_COLUMNS = (
    "station_id, name, wigos_id, source_kind, schedule, manual_hours_utc, active,"
    " created_at, updated_at"
)
_WIGOS_INDEX = "stations_wigos_id_key"


class StationNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Unknown station")


class StationConflictError(AppException):
    """The station id or WIGOS identifier is already registered."""

    def __init__(self, message: str):
        super().__init__(message, 409)


class StationRuleError(AppValidationError):
    """The schedule contradicts the source kind."""


def schedule_for(source_kind: str, hours: list[int]) -> str:
    if source_kind == SOURCE_AUTOMATIC:
        return "automatic"
    return "manual" if sorted(hours) == ALL_HOURS else "hybrid"


def _record(row: Any) -> StationRecord:
    data = dict(row)
    data["manual_hours_utc"] = sorted(data["manual_hours_utc"])
    return StationRecord.model_validate(data)


async def list_stations(
    register: AsyncSession, *, include_inactive: bool = True
) -> list[StationRecord]:
    result = await register.execute(
        text(
            f"SELECT {_COLUMNS} FROM observations.stations"  # noqa: S608
            " WHERE active OR CAST(:inactive AS boolean) ORDER BY station_id"
        ),
        {"inactive": include_inactive},
    )
    return [_record(row) for row in result.mappings()]


async def get(register: AsyncSession, station_id: str) -> StationRecord | None:
    result = await register.execute(
        text(
            f"SELECT {_COLUMNS} FROM observations.stations"  # noqa: S608
            " WHERE station_id = :station"
        ),
        {"station": station_id},
    )
    row = result.mappings().first()
    return None if row is None else _record(row)


def _hours(kind: str, hours: list[int] | None, default: list[int]) -> list[int]:
    if kind == SOURCE_AUTOMATIC:
        if hours:
            raise StationRuleError(
                "An automatic station has no observer hours; use source_kind manual"
            )
        return []
    chosen = sorted(set(default if hours is None else hours))
    if not chosen:
        raise StationRuleError("A manual station needs at least one observer hour")
    return chosen


async def _unique_wigos(
    register: AsyncSession, wigos_id: str | None, *, except_station: str | None
) -> None:
    if wigos_id is None:
        return
    owner = await register.scalar(
        text(
            "SELECT station_id FROM observations.stations"
            " WHERE wigos_id = :wigos AND station_id IS DISTINCT FROM :me"
        ),
        {"wigos": wigos_id, "me": except_station},
    )
    if owner is not None:
        raise StationConflictError(
            f"WIGOS identifier {wigos_id} already belongs to station {owner}"
        )


async def _conflict_after(
    error: IntegrityError, station_id: str
) -> StationConflictError:
    # A concurrent writer won the race the pre-checks cannot close.
    message = str(error.orig)
    if _WIGOS_INDEX in message:
        return StationConflictError("That WIGOS identifier is already registered")
    return StationConflictError(f"Station {station_id} already exists")


async def create(register: AsyncSession, data: StationCreate) -> StationRecord:
    hours = _hours(data.source_kind, data.manual_hours_utc, ALL_HOURS)
    if await get(register, data.station_id) is not None:
        raise StationConflictError(f"Station {data.station_id} already exists")
    await _unique_wigos(register, data.wigos_id, except_station=None)
    try:
        await register.execute(
            text(
                "INSERT INTO observations.stations (station_id, name, wigos_id,"
                " source_kind, schedule, manual_hours_utc, active) VALUES"
                " (:station, :name, :wigos, :kind, :schedule,"
                " CAST(:hours AS smallint[]), :active)"
            ),
            {
                "station": data.station_id,
                "name": data.name,
                "wigos": data.wigos_id,
                "kind": data.source_kind,
                "schedule": schedule_for(data.source_kind, hours),
                "hours": hours,
                "active": data.active,
            },
        )
        await register.commit()
    except IntegrityError as error:
        await register.rollback()
        raise await _conflict_after(error, data.station_id) from error
    created = await get(register, data.station_id)
    if created is None:  # pragma: no cover - committed just above
        raise StationNotFoundError
    return created


async def update(
    register: AsyncSession, station_id: str, data: StationUpdate
) -> tuple[StationRecord, StationRecord]:
    """Apply the keys sent. Returns (before, after)."""
    sent = data.model_fields_set
    for required in ("source_kind", "manual_hours_utc", "active"):
        if required in sent and getattr(data, required) is None:
            raise StationRuleError(f"{required} cannot be cleared")
    await register.execute(
        text(
            "SELECT 1 FROM observations.stations WHERE station_id = :station FOR UPDATE"
        ),
        {"station": station_id},
    )
    before = await get(register, station_id)
    if before is None:
        await register.rollback()
        raise StationNotFoundError
    name = data.name if "name" in sent else before.name
    wigos_id = data.wigos_id if "wigos_id" in sent else before.wigos_id
    source_kind = data.source_kind or before.source_kind
    active = before.active if data.active is None else data.active
    try:
        # Switching a station to manual without hours means every hour.
        default = (
            before.manual_hours_utc
            if before.source_kind == SOURCE_MANUAL
            else ALL_HOURS
        )
        hours = _hours(source_kind, data.manual_hours_utc, default)
        if wigos_id != before.wigos_id:
            await _unique_wigos(register, wigos_id, except_station=station_id)
    except AppException:
        await register.rollback()
        raise
    try:
        await register.execute(
            text(
                "UPDATE observations.stations SET name = :name, wigos_id = :wigos,"
                " source_kind = :kind, schedule = :schedule,"
                " manual_hours_utc = CAST(:hours AS smallint[]), active = :active,"
                " updated_at = now() WHERE station_id = :station"
            ),
            {
                "station": station_id,
                "name": name,
                "wigos": wigos_id,
                "kind": source_kind,
                "schedule": schedule_for(source_kind, hours),
                "hours": hours,
                "active": active,
            },
        )
        await register.commit()
    except IntegrityError as error:
        await register.rollback()
        raise await _conflict_after(error, station_id) from error
    after = await get(register, station_id)
    if after is None:  # pragma: no cover - committed just above
        raise StationNotFoundError
    return before, after


async def record_change(
    app_session: AsyncSession,
    *,
    user: User,
    station_id: str,
    before: StationRecord | None,
    after: StationRecord,
) -> None:
    """Audit entry (application database): created, or the fields that changed."""
    changes = {
        name: (None if before is None else getattr(before, name), getattr(after, name))
        for name in FIELDS
        if before is None or getattr(before, name) != getattr(after, name)
    }
    if not changes:
        return
    audit_service.set_actor(app_session, user.id)
    await audit_service.record_change(
        app_session,
        entity_type=AUDIT_ENTITY,
        entity_id=station_id,
        record_type=AUDIT_ENTITY,
        record_id=station_id,
        action="create" if before is None else "update",
        changes=changes,
    )
    await app_session.commit()
