from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .observations import ObservationKind, ObservationRecord, normalize_legacy_row

_TABLES: dict[ObservationKind, tuple[str, str, str, str]] = {
    "SYNOP": ("synop_observations", "station_id", "obs_datetime_utc", "NULL"),
    "METAR": (
        "aviation_observations",
        "aerodrome_icao",
        "obs_datetime_utc",
        "issue_datetime_utc",
    ),
    "SPECI": (
        "aviation_observations",
        "aerodrome_icao",
        "obs_datetime_utc",
        "issue_datetime_utc",
    ),
}


async def list_observations(
    session: AsyncSession,
    *,
    kind: ObservationKind,
    station: str | None,
    start: datetime | None,
    end: datetime | None,
    limit: int,
) -> list[ObservationRecord]:
    table, station_column, time_column, issued_column = _TABLES[kind]
    clauses = []
    params: dict[str, object] = {"limit": limit}
    if station:
        clauses.append(f"{station_column} = :station")
        params["station"] = station
    if start:
        clauses.append(f"{time_column} >= :start")
        params["start"] = start.astimezone(UTC)
    if end:
        clauses.append(f"{time_column} < :end")
        params["end"] = end.astimezone(UTC)
    if kind in {"METAR", "SPECI"}:
        clauses.append("report_type = :report_type")
        params["report_type"] = kind
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    result = await session.execute(
        text(
            f"SELECT id, {station_column} AS station, {time_column} AS observed_at, "  # noqa: S608
            f"{issued_column} AS issued_at, raw_tac, body "
            f"FROM {table} {where} ORDER BY {time_column} DESC LIMIT :limit"  # noqa: S608
        ),
        params,
    )
    return [normalize_legacy_row(kind=kind, row=dict(row)) for row in result.mappings()]
