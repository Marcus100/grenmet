"""Predicted tide table parsing (pure; no database, no network).

Input is the owner's predicted high and low table (CSV). Heights are metres relative
to provisional MLLW (the ``..._relative_uhslc_mllw_provisional_crosswalk`` column).
Times are read from ``time_utc`` (``YYYY-MM-DD HH:MM UTC``) and stored as naive UTC.
The data is predicted, provisional and not for navigation: the API says so on every
response.
"""

import csv
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
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
#: Grenada local time (AST, UTC-4, no daylight saving). The owner's table is
#: built per AST date, so coverage and month counts are checked in AST.
AST = timezone(timedelta(hours=-4), "AST")
#: Longest normal spacing between consecutive Prickly Bay highs and lows is about
#: 9.3 hours (2026 table). A longer gap means events are missing from the file.
MAX_EVENT_GAP = timedelta(hours=13)
#: The owner's flag for a weak turn less than 1 cm from its neighbour.
NEAR_FLAT_QUALITY = "NEAR_FLAT_LT_0_01_M"


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


@dataclass(frozen=True)
class TideGap:
    after: datetime
    before: datetime

    @property
    def hours(self) -> float:
        return (self.before - self.after).total_seconds() / 3600


@dataclass(frozen=True)
class TideTableSummary:
    """What a tide file holds, and whether it is safe to load. Times are naive UTC."""

    count: int
    highs: int
    lows: int
    first: TideRow
    last: TideRow
    first_date_ast: date
    last_date_ast: date
    per_month_ast: dict[str, int]
    near_flat: int
    duplicate_times: list[datetime]
    out_of_order: int
    gaps: list[TideGap]
    missing_dates_ast: list[date]
    same_type_neighbours: int
    errors: list[str]

    @property
    def ok(self) -> bool:
        return not self.errors


def to_ast(value: datetime) -> datetime:
    """Naive UTC to Grenada local time (AST)."""
    return value.replace(tzinfo=UTC).astimezone(AST)


def summarize_tides(
    rows: Sequence[TideRow],
    *,
    expect_from: date | None = None,
    expect_to: date | None = None,
    max_gap: timedelta = MAX_EVENT_GAP,
) -> TideTableSummary:
    """Count, date range, gaps and structural problems of a parsed tide table.

    ``expect_from``/``expect_to`` are AST dates the file must cover. Any error
    (duplicate times, rows out of order, a gap longer than ``max_gap``, an AST
    date with no event, or missing expected coverage) makes the file unsafe to
    load. Two highs or two lows in a row are counted but are not an error: the
    model keeps every mathematical turning point.
    """
    if not rows:
        raise TideTableError("the file has no rows")
    ordered = sorted(rows, key=lambda row: row.time_utc)
    times = Counter(row.time_utc for row in rows)
    duplicates = sorted(time for time, seen in times.items() if seen > 1)
    out_of_order = sum(
        1
        for prev, row in zip(rows, rows[1:], strict=False)
        if row.time_utc < prev.time_utc
    )
    gaps = [
        TideGap(after=prev.time_utc, before=row.time_utc)
        for prev, row in zip(ordered, ordered[1:], strict=False)
        if row.time_utc - prev.time_utc > max_gap
    ]
    same_type = sum(
        1
        for prev, row in zip(ordered, ordered[1:], strict=False)
        if row.event_type == prev.event_type
    )
    local_dates = {to_ast(row.time_utc).date() for row in ordered}
    first_date = to_ast(ordered[0].time_utc).date()
    last_date = to_ast(ordered[-1].time_utc).date()
    missing = [
        first_date + timedelta(days=offset)
        for offset in range((last_date - first_date).days + 1)
        if first_date + timedelta(days=offset) not in local_dates
    ]
    months = Counter(to_ast(row.time_utc).strftime("%Y-%m") for row in ordered)

    errors: list[str] = []
    if duplicates:
        errors.append(f"{len(duplicates)} duplicate event times")
    if out_of_order:
        errors.append(f"{out_of_order} rows are out of time order")
    if gaps:
        errors.append(
            f"{len(gaps)} gaps longer than {max_gap.total_seconds() / 3600:g} hours"
        )
    if missing:
        errors.append(f"{len(missing)} AST dates have no event")
    if expect_from is not None and first_date > expect_from:
        errors.append(f"file starts {first_date}, expected {expect_from} or earlier")
    if expect_to is not None and last_date < expect_to:
        errors.append(f"file ends {last_date}, expected {expect_to} or later")

    return TideTableSummary(
        count=len(ordered),
        highs=sum(1 for row in ordered if row.event_type == "HIGH"),
        lows=sum(1 for row in ordered if row.event_type == "LOW"),
        first=ordered[0],
        last=ordered[-1],
        first_date_ast=first_date,
        last_date_ast=last_date,
        per_month_ast=dict(sorted(months.items())),
        near_flat=sum(1 for row in ordered if row.timing_quality == NEAR_FLAT_QUALITY),
        duplicate_times=duplicates,
        out_of_order=out_of_order,
        gaps=gaps,
        missing_dates_ast=missing,
        same_type_neighbours=same_type,
        errors=errors,
    )
