"""Hourly register sheet (the monthly "CL1" workbook, saved as CSV) to SYNOP workbooks.

GMS keeps each month's manual observations of 78958 in one sheet, one row per hour,
37 columns in the order of the paper register. This module reads that sheet and turns
every row into the coded ``SynopWorkbook`` the register stores, then checks it with the
register's own rules (``rules.validate_synop`` plus the hour-to-hour history) before
anything is saved. Pure functions: no I/O; ``scripts/import_cl1_synop.py`` saves.

What the sheet holds, and how it maps (verified against the October 2026 sheet):

* Times are local standard time (Grenada is UTC-4 all year). The register stores UTC,
  so 00 LST on the 1st is 04 UTC on the 1st and 20 LST on the 31st is 00 UTC on the
  1st of the next month. ``utc_offset_hours`` is the only place this lives.
* Wind direction is already in tens of degrees (dd), speed in the unit of the wind
  indicator, visibility is the coded VV, temperatures are tenths of a degree, and the
  sea level pressure keeps the last four digits in tenths of hPa (thousands omitted).
* Cloud layer heights are metres divided by ten (the sheet decodes the register's hh
  code); the register stores the hh code, so the nearest code is used.
* Dew point and relative humidity are the sheet's own calculated columns. They are kept
  as the record, then compared with the register's formula (``derive``) as a check.
* Present and past weather are coded only when the weather indicator ix is 1; the
  sheet's values for other hours are kept in the notes, never coded.
* The sheet has no rainfall, no maximum or minimum temperature, no gust, no pressure
  tendency and no barometer reading. Those stay empty (the rules advise about them);
  nothing is invented to make a row pass.
* A row of zeros (no pressure, no dry bulb) is an hour that was not observed.
"""

import csv
import io
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlsplit

from pydantic import ValidationError

from . import derive, rules
from .schemas import SynopValidationIssue, SynopWorkbook

STATION_ID = "78958"
IMPORT_NOTE_PREFIX = "Imported from the hourly sheet"
# Hosts that are this machine or the local compose Postgres; anything else is remote.
LOCAL_HOSTS = frozenset(
    {"localhost", "127.0.0.1", "::1", "host.docker.internal", "grenmet-postgres"}
)
MAX_WEATHER_CODE = 99
UTC_OFFSET_HOURS = 4  # local standard time + 4 h = UTC (Grenada)
REPORT_TYPE = "AAXX"
PRECIP_NOT_REPORTED = (
    "4"  # iR 4: precipitation group omitted (the sheet has no rainfall)
)
MIN_COLUMNS = 37
HEADER_START = ("YEAR", "MONTH", "DAY", "HOUR")
# Largest gap between the sheet's calculated column and the register formula that is
# still the same observation: the sheet rounds differently, so a few tenths is normal.
DEW_POINT_TOLERANCE_C = 0.3
HUMIDITY_TOLERANCE_PERCENT = 3
LAYER_COLUMNS = ((22, 23, 24), (26, 27, 28), (29, 30, 31), (32, 33, 34))
HEIGHT_UNIT_M = 10  # the sheet's layer height is metres / 10
LAYER_HEIGHT_CODES = (*range(0, 51), *range(56, 90))
MAX_REMARK_LENGTH = 4000

(
    YEAR,
    MONTH,
    DAY,
    HOUR,
    TOTAL_CLOUD,
    WIND_INDICATOR,
    WIND_DIR,
    WIND_SPEED,
    VISIBILITY,
    WEATHER_INDICATOR,
    PRESENT_WEATHER,
    PAST_WEATHER,
    SEA_LEVEL_PRESSURE,
    DRY_BULB,
    WET_BULB,
    _VAPOUR_PRESSURE,
    RELATIVE_HUMIDITY,
    DEW_POINT,
    LOW_CLOUD_AMOUNT,
    LOW_CLOUD_TYPE,
    MID_CLOUD_TYPE,
    HIGH_CLOUD_TYPE,
) = range(22)
REMARKS = 35
GROUP_909 = 36

HourStatus = Literal["ready", "blocked", "not_observed", "unreadable"]
"""ready: would be saved; blocked: a rule found an error (or a cell is unreadable);
not_observed: a row of zeros; unreadable: the row's date cannot be read."""


class Cl1FormatError(ValueError):
    """The file is not the hourly sheet (wrong header or too few columns)."""


@dataclass
class HourReport:
    """One sheet row: what it is, the coded workbook, and every issue found."""

    row: int
    status: HourStatus
    local: datetime | None = None
    observed_at: datetime | None = None
    workbook: SynopWorkbook | None = None
    issues: list[SynopValidationIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[SynopValidationIssue]:
        return [issue for issue in self.issues if issue.severity == "error"]

    def saveable(self) -> tuple[datetime, SynopWorkbook, int] | None:
        """(observed_at, workbook, sheet row) when this hour passes every rule."""
        if self.status != "ready" or self.workbook is None or self.observed_at is None:
            return None
        return self.observed_at, self.workbook, self.row


def read_sheet(text: str) -> list[tuple[int, list[str]]]:
    """Data rows as (sheet row number, cells). Row 1 is the header and is checked."""
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    rows = list(reader)
    if not rows:
        raise Cl1FormatError("The file is empty.")
    header = tuple(
        cell.strip().upper().split()[0] if cell.strip() else "" for cell in rows[0][:4]
    )
    if header != HEADER_START or len(rows[0]) < MIN_COLUMNS:
        raise Cl1FormatError(
            "Not the hourly sheet: expected YEAR, MONTH, DAY, HOUR (LST) and "
            f"{MIN_COLUMNS} columns in the first row."
        )
    return [
        (number, cells)
        for number, cells in enumerate(rows[1:], start=2)
        if any(cell.strip() for cell in cells)
    ]


def _number(cell: str) -> float | None:
    try:
        return float(cell.strip())
    except ValueError:
        return None


def _whole(cell: str) -> int | None:
    value = _number(cell)
    return None if value is None else round(value)


def _problem(issues: list[SynopValidationIssue], name: str, cell: str) -> None:
    issues.append(
        SynopValidationIssue(
            field=name,
            code="unreadable_cell",
            message=f"Cannot read {cell.strip()!r} in the sheet.",
            severity="error",
        )
    )


def _digits(
    cells: Sequence[str],
    column: int,
    name: str,
    issues: list[SynopValidationIssue],
    *,
    width: int = 1,
    slash: bool = False,
) -> str | None:
    """A coded value zero-padded to ``width`` (a "/" passes when ``slash``)."""
    cell = cells[column].strip()
    if not cell:
        return None
    if slash and cell == "/":
        return "/"
    value = _whole(cell)
    if value is None or value < 0:
        _problem(issues, name, cell)
        return None
    return f"{value:0{width}d}"


def height_code(sheet_value: float) -> str:
    """The register's hh code for a sheet height (metres / 10), nearest code."""
    metres = round(sheet_value) * HEIGHT_UNIT_M
    best = min(
        LAYER_HEIGHT_CODES,
        key=lambda code: abs((rules.layer_height_metres(code) or 0) - metres),
    )
    return f"{best:02d}"


def _is_unobserved(cells: Sequence[str]) -> bool:
    return not (_number(cells[SEA_LEVEL_PRESSURE]) or _number(cells[DRY_BULB]))


def _local_time(cells: Sequence[str], zone: timezone) -> datetime | None:
    year, month, day, hour = (_whole(cells[i]) for i in (YEAR, MONTH, DAY, HOUR))
    if None in (year, month, day, hour):
        return None
    try:
        return datetime(year or 0, month or 0, day or 0, hour or 0, tzinfo=zone)
    except ValueError:
        return None


def _layers(cells: Sequence[str], issues: list[SynopValidationIssue]) -> dict[str, str]:
    found: dict[str, str] = {}
    for n, (amount_col, form_col, height_col) in enumerate(LAYER_COLUMNS, start=1):
        if cells[amount_col].strip() in ("", "0"):
            continue
        name = f"s3_layer{n}"
        amount = _digits(cells, amount_col, f"{name}_amount", issues, slash=True)
        if amount is not None:
            found[f"{name}_amount"] = amount
        form = _digits(cells, form_col, f"{name}_form", issues)
        height = _number(cells[height_col])
        if form is not None:
            found[f"{name}_form"] = form
        if height is None:
            _problem(issues, f"{name}_height", cells[height_col])
        else:
            found[f"{name}_height"] = height_code(height)
    return found


def _weather_code(
    cells: Sequence[str], column: int, name: str, issues: list[SynopValidationIssue]
) -> int | None:
    """ww or W1W2 as a two-digit code; a cell that is not 0 to 99 is flagged."""
    cell = cells[column].strip()
    if not cell:
        return None
    value = _whole(cell)
    if value is None or not 0 <= value <= MAX_WEATHER_CODE:
        _problem(issues, name, cell)
        return None
    return value


def _weather(
    cells: Sequence[str], issues: list[SynopValidationIssue]
) -> tuple[dict[str, str], str | None]:
    """Coded present and past weather, or a note when ix says they are not reported."""
    indicator = _digits(cells, WEATHER_INDICATOR, "station_wx_indicator", issues)
    coded: dict[str, str] = {}
    if indicator is not None:
        coded["station_wx_indicator"] = indicator
    present = _weather_code(cells, PRESENT_WEATHER, "present_wx", issues)
    past = _weather_code(cells, PAST_WEATHER, "past_wx_1", issues)
    # Only ix 1 codes the weather groups. ix 4 and 7 also mean "included", but the
    # sheet is a manual station's record: its values are kept in the notes instead.
    if indicator == "1":
        if present is not None:
            coded["present_wx"] = f"{present:02d}"
        if past is not None:
            coded["past_wx_1"] = f"{past:02d}"[0]
            coded["past_wx_2"] = f"{past:02d}"[1]
        return coded, None
    shown: list[str] = []
    if present:
        shown.append(f"ww {present:02d}")
    if past:
        shown.append(f"W1W2 {past:02d}")
    if not shown:
        return coded, None
    return (
        coded,
        f"The sheet shows {' and '.join(shown)}; not coded because ix is {indicator}.",
    )


def _workbook(
    number: int, cells: Sequence[str], local: datetime, observed_at: datetime
) -> tuple[SynopWorkbook | None, list[SynopValidationIssue]]:
    issues: list[SynopValidationIssue] = []

    def digits(
        column: int, name: str, width: int = 1, *, slash: bool = False
    ) -> str | None:
        return _digits(cells, column, name, issues, width=width, slash=slash)

    body: dict[str, str | None] = {
        "report_type": REPORT_TYPE,
        "day": f"{observed_at.day:02d}",
        "time_utc": f"{observed_at.hour:02d}",
        "station_id": STATION_ID,
        "wind_indicator": digits(WIND_INDICATOR, "wind_indicator"),
        "precip_indicator": PRECIP_NOT_REPORTED,
        "visibility": digits(VISIBILITY, "visibility", 2, slash=True),
        "total_cloud": digits(TOTAL_CLOUD, "total_cloud", slash=True),
        "wind_dir": digits(WIND_DIR, "wind_dir", 2),
        "wind_speed": digits(WIND_SPEED, "wind_speed", 2),
        "air_temp": digits(DRY_BULB, "air_temp", 3),
        "wet_bulb": digits(WET_BULB, "wet_bulb", 3),
        "dew_point": digits(DEW_POINT, "dew_point", 3),
        "relative_humidity": digits(RELATIVE_HUMIDITY, "relative_humidity"),
        "msl_pressure": digits(SEA_LEVEL_PRESSURE, "msl_pressure", 4),
        "low_cloud_amount": digits(LOW_CLOUD_AMOUNT, "low_cloud_amount", slash=True),
        "low_cloud_type": digits(LOW_CLOUD_TYPE, "low_cloud_type", slash=True),
        "mid_cloud_type": digits(MID_CLOUD_TYPE, "mid_cloud_type", slash=True),
        "high_cloud_type": digits(HIGH_CLOUD_TYPE, "high_cloud_type", slash=True),
    }
    weather, weather_note = _weather(cells, issues)
    body.update(weather)
    body.update(_layers(cells, issues))
    group_909 = _whole(cells[GROUP_909])
    if group_909 is not None and not 0 <= group_909 <= MAX_WEATHER_CODE:
        _problem(issues, "s3_group_909", cells[GROUP_909])
    elif group_909:
        body["s3_group_909"] = f"909{group_909:02d}"
    remark = cells[REMARKS].strip()
    if remark and remark != "0":
        body["s3_remarks"] = remark[:MAX_REMARK_LENGTH]
    body["notes"] = " ".join(
        part
        for part in (
            f"{IMPORT_NOTE_PREFIX}, row {number}, {local:%Y-%m-%d %H:%M} local time.",
            weather_note,
        )
        if part
    )
    try:
        workbook = SynopWorkbook.model_validate(
            {k: v for k, v in body.items() if v not in (None, "")}
        )
    except ValidationError as exc:
        issues.extend(
            SynopValidationIssue(
                field=str(error["loc"][0]) if error["loc"] else "body",
                code="invalid_value",
                message=str(error["msg"]),
                severity="error",
            )
            for error in exc.errors()
        )
        return None, issues
    return workbook, issues


def convert_row(number: int, cells: Sequence[str], zone: timezone) -> HourReport:
    """One sheet row as a coded workbook (not yet validated by the register's rules)."""
    local = _local_time(cells, zone)
    if local is None:
        return HourReport(
            number,
            "unreadable",
            issues=[
                SynopValidationIssue(
                    field="time_utc",
                    code="unreadable_cell",
                    message="The year, month, day and hour of this row cannot be read.",
                    severity="error",
                )
            ],
        )
    observed_at = local.astimezone(UTC)
    if _is_unobserved(cells):
        return HourReport(number, "not_observed", local, observed_at)
    workbook, issues = _workbook(number, cells, local, observed_at)
    status: HourStatus = "ready" if workbook is not None else "blocked"
    return HourReport(number, status, local, observed_at, workbook, issues)


def _cross_check(
    cells: Sequence[str],
    workbook: SynopWorkbook,
    amounts: derive.PressureSettings | None,
) -> list[SynopValidationIssue]:
    """The sheet's dew point and humidity against the register's own formula."""
    if (
        amounts is None
        or amounts.sea_level_offset_hpa is None
        or not workbook.msl_pressure
    ):
        return []
    group = int(workbook.msl_pressure)
    sea_level = group / 10 + (0 if group >= rules.BAROMETER_REFERENCE_CODE else 1000)
    barometer = (
        sea_level - amounts.sea_level_offset_hpa - (amounts.total_correction_hpa or 0)
    )
    worked = derive.apply_to_workbook(
        workbook.model_copy(
            update={
                "barometer_reading": f"{barometer:.1f}",
                "dew_point": None,
                "relative_humidity": None,
                "msl_pressure": None,
            }
        ),
        amounts,
    )
    issues: list[SynopValidationIssue] = []
    sheet_dew = _number(cells[DEW_POINT])
    if worked.dew_point and sheet_dew is not None:
        gap = abs(int(worked.dew_point) - sheet_dew) / 10
        if gap > DEW_POINT_TOLERANCE_C:
            issues.append(
                SynopValidationIssue(
                    field="dew_point",
                    code="sheet_differs_from_formula",
                    message=f"The sheet's dew point is {gap:.1f} C away from the register's formula.",
                    severity="warning",
                )
            )
    sheet_humidity = _number(cells[RELATIVE_HUMIDITY])
    if worked.relative_humidity and sheet_humidity is not None:
        gap_percent = abs(int(worked.relative_humidity) - sheet_humidity)
        if gap_percent > HUMIDITY_TOLERANCE_PERCENT:
            issues.append(
                SynopValidationIssue(
                    field="relative_humidity",
                    code="sheet_differs_from_formula",
                    message=f"The sheet's humidity is {gap_percent:.0f} points away from the register's formula.",
                    severity="warning",
                )
            )
    return issues


def _mark_duplicates(reports: Sequence[HourReport]) -> set[int]:
    """Block every row after the first for the same UTC hour; return their row numbers."""
    first: dict[datetime, int] = {}
    repeated: set[int] = set()
    for report in reports:
        if report.observed_at is None or report.status == "not_observed":
            continue
        if report.observed_at in first:
            repeated.add(report.row)
            report.status = "blocked"
            report.issues.append(
                SynopValidationIssue(
                    field="time_utc",
                    code="duplicate_hour",
                    message=(
                        f"Sheet row {first[report.observed_at]} is already this hour "
                        f"({report.observed_at:%Y-%m-%d %H:%M} UTC)."
                    ),
                    severity="error",
                )
            )
        else:
            first[report.observed_at] = report.row
    return repeated


def check_sheet(
    rows: Sequence[tuple[int, list[str]]],
    amounts: derive.PressureSettings | None,
    *,
    utc_offset_hours: int = UTC_OFFSET_HOURS,
    saved: Mapping[datetime, SynopWorkbook] | None = None,
) -> list[HourReport]:
    """Convert and validate every row, oldest hour first.

    The hour-to-hour checks look at the previous hour and the hour three earlier, as
    the register does on save; only hours that would be saved count as history, plus
    any hours already ``saved`` in the register.
    """
    zone = timezone(timedelta(hours=-utc_offset_hours))
    reports = [convert_row(number, cells, zone) for number, cells in rows]
    cells_by_row = dict(rows)
    history: dict[datetime, SynopWorkbook] = dict(saved or {})
    duplicates = _mark_duplicates(reports)
    timed = [r for r in reports if r.observed_at is not None]
    for report in sorted(
        timed, key=lambda r: r.observed_at or datetime.min.replace(tzinfo=UTC)
    ):
        if report.workbook is None or report.observed_at is None:
            continue
        if report.row in duplicates:
            continue
        past = {
            hours: history[report.observed_at - timedelta(hours=hours)]
            for hours in (1, 3)
            if report.observed_at - timedelta(hours=hours) in history
        }
        found, _decoded = rules.validate_synop(report.workbook, amounts, past)
        report.issues.extend(found)
        report.issues.extend(
            rules.check_observation_time(report.workbook, report.observed_at)
        )
        report.issues.extend(
            _cross_check(cells_by_row[report.row], report.workbook, amounts)
        )
        if report.errors:
            report.status = "blocked"
        else:
            history[report.observed_at] = report.workbook
    return reports


def may_update(
    state: str,
    body_notes: str | None,
    review_outcome: str | None,
    *,
    historical: bool = False,
) -> bool:
    """Whether an hour already in the register may be refreshed from the sheet.

    Only a draft (or, for a ``--historical`` run, a historical row) the importer
    itself made and nobody has reviewed. Anything typed by an observer, reviewed,
    accepted or sent is left alone and listed instead.
    """
    return (
        (state == "draft" or (historical and state == "historical"))
        and review_outcome is None
        and (body_notes or "").startswith(IMPORT_NOTE_PREFIX)
    )


# Fields the hourly sheet never holds; the daily importer adds them to the same draft.
DAILY_FIELDS = ("s3_rainfall_24h", "s3_max_temp", "s3_min_temp", "wind_gust")


def carry_over(
    body: dict[str, object], live_body: Mapping[str, object]
) -> dict[str, object]:
    """The refreshed body with any daily values the draft already holds kept.

    A re-run of the hourly import refreshes an unreviewed draft from the sheet; without
    this it would silently drop the rainfall, extremes and gust added since. The gust is
    stored in the unit of the wind indicator, so it is dropped when the sheet changed
    that indicator.
    """
    same_unit = body.get("wind_indicator") == live_body.get("wind_indicator")
    kept = {
        name: live_body[name]
        for name in DAILY_FIELDS
        if name not in body
        and live_body.get(name) not in (None, "")
        and (name != "wind_gust" or same_unit)
    }
    return {**body, **kept}


def local_register_problem(
    url: str | None, environment: str, expected_db: str
) -> str | None:
    """Why saving must be refused for this register URL, or None when it is local.

    The database name alone proves nothing (production is also called ``eregister``),
    so the host must be this machine or the local compose Postgres as well.
    """
    if environment != "local":
        return f"ENVIRONMENT is {environment!r}, not 'local'."
    if not url:
        return "EREGISTER_DATABASE_URL is not set."
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme not in ("postgresql", "postgres") or not host:
        return "EREGISTER_DATABASE_URL must be a PostgreSQL URL with a host."
    if host not in LOCAL_HOSTS:
        return f"The register host {host!r} is not this machine or the local compose Postgres."
    if parts.path.lstrip("/") != expected_db:
        return f"The database is {parts.path.lstrip('/')!r}, expected {expected_db!r}."
    return None
