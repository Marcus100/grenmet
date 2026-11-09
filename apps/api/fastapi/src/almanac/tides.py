"""Predicted tide table parsing (pure; no database, no network).

Input is the owner's predicted high and low table (CSV). Heights are metres relative
to provisional MLLW (the ``..._relative_uhslc_mllw_provisional_crosswalk`` column).
Times are read from ``time_utc`` (``YYYY-MM-DD HH:MM UTC``) and stored as naive UTC.
The data is predicted, provisional and not for navigation: the API says so on every
response.
"""

import csv
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation

#: Columns the parser needs. Other columns of the owner's file are ignored.
REQUIRED_COLUMNS = (
    "event_type",
    "time_utc",
    "height_m_relative_uhslc_mllw_provisional_crosswalk",
    "status",
    "timing_quality",
)
EVENT_TYPES = ("HIGH", "LOW")
HEIGHT_QUANTUM = Decimal("0.0001")
UTC_SUFFIX = " UTC"
TIME_FORMAT = "%Y-%m-%d %H:%M"


class TideTableError(ValueError):
    """The file is not a valid tide table. The message names the line."""


@dataclass(frozen=True)
class TideStation:
    key: str
    name: str
    source_label: str


#: Stations we import predictions for. The key is the API value.
TIDE_STATIONS: dict[str, TideStation] = {
    "pric": TideStation(
        key="pric",
        name="Prickly Bay (Grenada)",
        source_label="Prickly Bay predicted tides (owner's tide tool)",
    ),
}


@dataclass(frozen=True)
class TideRow:
    station_key: str
    event_type: str
    time_utc: datetime
    height_m_mllw: Decimal
    timing_quality: str
    status: str
    source_label: str
    source_version: str


def parse_tide_csv(
    lines: Iterable[str], *, station_key: str, source_version: str
) -> list[TideRow]:
    """Parse the owner's tide CSV into rows ready for ``service.upsert_tides``."""
    station = TIDE_STATIONS.get(station_key)
    if station is None:
        raise TideTableError(f"unknown station: {station_key}")

    reader = csv.DictReader(lines)
    fields = reader.fieldnames or []
    missing = [column for column in REQUIRED_COLUMNS if column not in fields]
    if missing:
        raise TideTableError(f"CSV is missing columns: {', '.join(missing)}")

    rows: list[TideRow] = []
    for record in reader:
        line = reader.line_num
        event_type = (record["event_type"] or "").strip().upper()
        if event_type not in EVENT_TYPES:
            raise TideTableError(f"line {line}: event_type must be HIGH or LOW")
        rows.append(
            TideRow(
                station_key=station.key,
                event_type=event_type,
                time_utc=_parse_time(record["time_utc"], line),
                height_m_mllw=_parse_height(
                    record["height_m_relative_uhslc_mllw_provisional_crosswalk"], line
                ),
                timing_quality=_required(record, "timing_quality", line),
                status=_required(record, "status", line),
                source_label=station.source_label,
                source_version=source_version,
            )
        )
    if not rows:
        raise TideTableError("the file has no rows")
    return rows


def _required(record: dict[str, str | None], column: str, line: int) -> str:
    value = (record.get(column) or "").strip()
    if not value:
        raise TideTableError(f"line {line}: {column} is blank")
    return value


def _parse_time(raw: str | None, line: int) -> datetime:
    value = (raw or "").strip()
    if not value.endswith(UTC_SUFFIX):
        raise TideTableError(f"line {line}: time_utc must end with UTC: {value!r}")
    try:
        return datetime.strptime(value[: -len(UTC_SUFFIX)], TIME_FORMAT)
    except ValueError as error:
        raise TideTableError(f"line {line}: bad time_utc {value!r}") from error


def _parse_height(raw: str | None, line: int) -> Decimal:
    value = (raw or "").strip()
    if not value:
        raise TideTableError(f"line {line}: height is blank")
    try:
        height = Decimal(value)
    except InvalidOperation as error:
        raise TideTableError(f"line {line}: height is not a number") from error
    if not height.is_finite():
        raise TideTableError(f"line {line}: height is not a number")
    return height.quantize(HEIGHT_QUANTUM)
