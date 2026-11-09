"""Daily values the hourly sheet lacks (rainfall, maximum and minimum temperature, gust).

The observers send these from their other paper sheets and instruments, one row per
day, in a small CSV (``date``, ``rainfall_24h_mm``, ``rain_reading_time_local``,
``highest_temp_c``, ``lowest_temp_c``, ``strongest_gust_kt``, ``gust_time_local``,
``notes``). This module reads that file and works out where each value belongs in the
register, then checks it. Pure functions: no I/O; ``scripts/import_daily_values.py``
reads the live hourly drafts and saves.

Where a value goes (the register's own convention, see ``rules.py``):

* The 24-hour rainfall is group 7 of section 3 (``s3_rainfall_24h``, four digits in
  tenths of a millimetre, 9999 = trace) and belongs to the 12 UTC main hour, which is
  08:00 local standard time. The row's date is the day the gauge was read. A reading
  taken at another time is refused, never moved to the wrong hour.
* The maximum and minimum temperature are groups 1 and 2 of section 3
  (``s3_max_temp``, ``s3_min_temp``). They are placed on the same 12 UTC entry, so the
  observers should read the thermometers at the same morning reading; this is stated in
  the preview so it can be confirmed.
* The strongest gust is the gust cell (``wind_gust``, in the unit of the entry's wind
  indicator) of the observation at or after the time of the gust, because an entry
  reports the wind up to its hour.

Nothing is invented: an empty cell leaves the register as it is. A value is only ever
added to a draft the hourly importer made and nobody reviewed, and never replaces a
different value that is already there.
"""

import csv
import io
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from . import cl1_import, derive, public, rules
from .schemas import SynopValidationIssue

DayStatus = Literal["ready", "blocked", "empty", "unreadable"]

STATION_ID = cl1_import.STATION_ID
UTC_OFFSET_HOURS = cl1_import.UTC_OFFSET_HOURS
READING_HOUR_UTC = rules.SYNOP_NOON_HOUR
KNOT_MS = rules.KNOT_MS
RAIN_TRACE_WORDS = frozenset({"t", "tr", "trace"})
RAIN_TRACE_CODE = "9999"
MAX_RAIN_TENTHS = 9998
RAIN_CHECK_MM = Decimal(
    300
)  # a single day this wet is possible but worth a second look
TEMPERATURE_CODE_LIMIT_C = Decimal("99.9")
USUAL_TEMPERATURE_C = (Decimal(15), Decimal(38))  # outside this: check the thermometer
HOURLY_TOLERANCE_C = 0.3  # the paper and the thermometer round differently
GUST_CHECK_KT = 80
THREE_DIGIT_GUST_FROM = 99
MINUTES_IN_HOUR = 60
COLUMNS = (
    "date",
    "rainfall_24h_mm",
    "rain_reading_time_local",
    "highest_temp_c",
    "lowest_temp_c",
    "strongest_gust_kt",
    "gust_time_local",
    "notes",
)
VALUE_COLUMNS = COLUMNS[1:7]


class DailyFormatError(ValueError):
    """The file is not the daily template (no date column or no value columns)."""


@dataclass
class DayReport:
    """One file row: the register fields it fills and every issue found."""

    row: int
    status: DayStatus
    day: date | None = None
    # observed_at (UTC) -> workbook field -> coded text, for the fixed-format fields.
    fields: dict[datetime, dict[str, str]] = field(default_factory=dict)
    # observed_at (UTC) -> strongest gust in knots (coded per entry at merge time).
    gusts: dict[datetime, int] = field(default_factory=dict)
    max_c: Decimal | None = None
    min_c: Decimal | None = None
    issues: list[SynopValidationIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[SynopValidationIssue]:
        return [issue for issue in self.issues if issue.severity == "error"]


def _issue(
    report: DayReport,
    name: str,
    code: str,
    message: str,
    severity: Literal["error", "warning"] = "error",
) -> None:
    report.issues.append(
        SynopValidationIssue(field=name, code=code, message=message, severity=severity)
    )


def read_daily(text: str) -> list[tuple[int, dict[str, str]]]:
    """Data rows as (file row number, cells by column name). Row 1 is the header."""
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    if not rows:
        raise DailyFormatError("The file is empty.")
    names = [cell.strip().lower() for cell in rows[0]]
    if "date" not in names or not any(name in names for name in VALUE_COLUMNS):
        raise DailyFormatError(
            "Not the daily template: the first row needs a 'date' column and at "
            f"least one of {', '.join(VALUE_COLUMNS)}."
        )
    found: list[tuple[int, dict[str, str]]] = []
    for number, cells in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in cells):
            continue
        padded = [*cells, *([""] * (len(names) - len(cells)))]
        found.append(
            (number, dict(zip(names, (c.strip() for c in padded), strict=False)))
        )
    return found


def _decimal(cell: str) -> Decimal | None:
    try:
        value = Decimal(cell.strip())
    except InvalidOperation:
        return None
    return value if value.is_finite() else None


def _tenths(value: Decimal) -> int | None:
    """Whole tenths, or None when the value has finer precision than one decimal."""
    scaled = value * 10
    return int(scaled) if scaled == scaled.to_integral_value() else None


def _clock(cell: str) -> time | None:
    text = cell.strip().replace(".", ":")
    for pattern in ("%H:%M", "%H%M"):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=UTC).time()
        except ValueError:
            continue
    return None


def _utc(day: date, local: time, offset_hours: int) -> datetime:
    return datetime.combine(day, local, tzinfo=UTC) + timedelta(hours=offset_hours)


def _reading_utc(day: date, offset_hours: int) -> datetime:
    """The 12 UTC entry of the local date the gauge was read (08:00 local standard)."""
    local_hour = (READING_HOUR_UTC - offset_hours) % 24
    return _utc(day, time(local_hour), offset_hours)


def _rain(
    report: DayReport, cells: Mapping[str, str], day: date, offset_hours: int
) -> None:
    cell = cells.get("rainfall_24h_mm", "").strip()
    if not cell:
        return
    name = "s3_rainfall_24h"
    if cell.lower() in RAIN_TRACE_WORDS:
        code = RAIN_TRACE_CODE
    else:
        amount = _decimal(cell)
        if amount is None or amount < 0:
            _issue(report, name, "unreadable_cell", f"Cannot read rainfall {cell!r}.")
            return
        tenths = _tenths(amount)
        if tenths is None:
            _issue(
                report,
                name,
                "too_precise",
                f"Rainfall {cell!r} has more than one decimal; the register keeps "
                "tenths of a millimetre. Please send the measured value.",
            )
            return
        if tenths > MAX_RAIN_TENTHS:
            _issue(
                report,
                name,
                "out_of_range",
                f"Rainfall {cell!r} mm is more than the register can hold (999.8 mm).",
            )
            return
        code = f"{tenths:04d}"
        if amount > RAIN_CHECK_MM:
            _issue(
                report,
                name,
                "very_wet_day",
                f"{cell} mm in one day is very high; please confirm it.",
                "warning",
            )
    expected_local = time((READING_HOUR_UTC - offset_hours) % 24)
    reading = cells.get("rain_reading_time_local", "").strip()
    if not reading:
        _issue(
            report,
            "rain_reading_time_local",
            "reading_time_assumed",
            f"No gauge reading time: assumed {expected_local:%H:%M} local, the 12 UTC "
            "main hour.",
            "warning",
        )
    else:
        parsed = _clock(reading)
        if parsed != expected_local:
            _issue(
                report,
                "rain_reading_time_local",
                "reading_time",
                f"The gauge was read at {reading!r}, but the register keeps the "
                f"24 hour rainfall at {expected_local:%H:%M} local (12 UTC). "
                "Nothing was saved for this value; ask GMS how to record it.",
            )
            return
    report.fields.setdefault(_reading_utc(day, offset_hours), {})[name] = code


def _temperature(
    report: DayReport, cells: Mapping[str, str], column: str, name: str
) -> Decimal | None:
    cell = cells.get(column, "").strip()
    if not cell:
        return None
    value = _decimal(cell)
    if value is None:
        _issue(report, name, "unreadable_cell", f"Cannot read {cell!r} in {column}.")
        return None
    if _tenths(value) is None:
        _issue(
            report,
            name,
            "too_precise",
            f"{cell!r} has more than one decimal; the register keeps tenths of a degree.",
        )
        return None
    if abs(value) > TEMPERATURE_CODE_LIMIT_C:
        _issue(report, name, "out_of_range", f"{cell!r} °C cannot be coded.")
        return None
    low, high = USUAL_TEMPERATURE_C
    if not low <= value <= high:
        _issue(
            report,
            name,
            "unusual_temperature",
            f"{cell} °C is outside the usual {low}–{high} °C for Grenada; please "
            "check the thermometer reading.",
            "warning",
        )
    return value


def _extremes(
    report: DayReport, cells: Mapping[str, str], day: date, offset_hours: int
) -> None:
    high = _temperature(report, cells, "highest_temp_c", "s3_max_temp")
    low = _temperature(report, cells, "lowest_temp_c", "s3_min_temp")
    if high is not None and low is not None and high < low:
        _issue(
            report,
            "s3_max_temp",
            "max_below_min",
            f"The highest temperature {high} is below the lowest {low}.",
        )
        return
    target = report.fields.setdefault(_reading_utc(day, offset_hours), {})
    if high is not None:
        target["s3_max_temp"] = derive.temperature_group(float(high))
        report.max_c = high
    if low is not None:
        target["s3_min_temp"] = derive.temperature_group(float(low))
        report.min_c = low


def _gust(
    report: DayReport, cells: Mapping[str, str], day: date, offset_hours: int
) -> None:
    cell = cells.get("strongest_gust_kt", "").strip()
    if not cell:
        return
    value = _decimal(cell)
    if value is None or value < 0 or value != value.to_integral_value():
        _issue(
            report,
            "wind_gust",
            "unreadable_cell",
            f"The gust {cell!r} must be a whole number of knots.",
        )
        return
    knots = int(value)
    when = cells.get("gust_time_local", "").strip()
    clock = _clock(when) if when else None
    if clock is None:
        message = (
            f"Cannot read the gust time {when!r}."
            if when
            else "The gust needs the time it happened (HH:MM local) to choose the "
            "observation that reports it."
        )
        _issue(report, "gust_time_local", "gust_time", message)
        return
    start = _utc(day, clock, offset_hours)
    if start.minute or start.second:
        start = start.replace(minute=0, second=0) + timedelta(hours=1)
    if knots > GUST_CHECK_KT:
        _issue(
            report,
            "wind_gust",
            "very_strong_gust",
            f"A gust of {knots} kt is very strong; please confirm it.",
            "warning",
        )
    report.gusts[start] = knots


def convert_day(
    number: int,
    cells: Mapping[str, str],
    *,
    utc_offset_hours: int = UTC_OFFSET_HOURS,
) -> DayReport:
    """One file row to the register fields it fills, with its issues."""
    raw = cells.get("date", "").strip()
    try:
        day = date.fromisoformat(raw)
    except ValueError:
        report = DayReport(row=number, status="unreadable")
        _issue(report, "date", "unreadable_date", f"Cannot read the date {raw!r}.")
        return report
    report = DayReport(row=number, status="ready", day=day)
    _rain(report, cells, day, utc_offset_hours)
    _extremes(report, cells, day, utc_offset_hours)
    _gust(report, cells, day, utc_offset_hours)
    report.fields = {at: values for at, values in report.fields.items() if values}
    if not report.fields and not report.gusts and not report.errors:
        report.status = "empty"
    elif report.errors:
        report.status = "blocked"
        report.fields.clear()
        report.gusts.clear()
    return report


def check_days(
    rows: Sequence[tuple[int, Mapping[str, str]]],
    *,
    utc_offset_hours: int = UTC_OFFSET_HOURS,
) -> list[DayReport]:
    """Convert every row; a date given twice blocks both rows (which one is right?)."""
    reports = [
        convert_day(number, cells, utc_offset_hours=utc_offset_hours)
        for number, cells in rows
    ]
    seen: dict[date, list[DayReport]] = {}
    for report in reports:
        if report.day is not None:
            seen.setdefault(report.day, []).append(report)
    for day, same in seen.items():
        if len(same) > 1:
            for report in same:
                _issue(
                    report,
                    "date",
                    "duplicate_day",
                    f"{day} appears on rows {', '.join(str(r.row) for r in same)}.",
                )
                report.status = "blocked"
                report.fields.clear()
                report.gusts.clear()
    return reports


def hourly_air(bodies: Mapping[datetime, Mapping[str, Any]]) -> dict[datetime, float]:
    """Air temperature (degrees C) of each saved hourly entry that has one."""
    found: dict[datetime, float] = {}
    for at, body in bodies.items():
        value = public.temperature(str(body.get("air_temp") or "").strip())
        if value is not None:
            found[at] = value
    return found


def check_against_hourly(
    report: DayReport, air: Mapping[datetime, float], *, utc_offset_hours: int
) -> None:
    """Warn when an hour's dry bulb is outside the day's extremes (never an error).

    The window is the 24 hours that end at the reading, which is the period the
    maximum and minimum thermometers cover. A dry bulb above the maximum or below the
    minimum means one of the two readings is wrong.
    """
    if report.day is None:
        return
    end = _reading_utc(report.day, utc_offset_hours)
    window = {at: c for at, c in air.items() if end - timedelta(hours=24) < at <= end}
    if report.max_c is not None:
        for at, c in sorted(window.items()):
            if c > float(report.max_c) + HOURLY_TOLERANCE_C:
                _issue(
                    report,
                    "s3_max_temp",
                    "air_above_max",
                    f"The {at - timedelta(hours=utc_offset_hours):%d %b %H:%M} local dry "
                    f"bulb {c} is above the day's highest {report.max_c}.",
                    "warning",
                )
                break
    if report.min_c is not None:
        for at, c in sorted(window.items()):
            if c < float(report.min_c) - HOURLY_TOLERANCE_C:
                _issue(
                    report,
                    "s3_min_temp",
                    "air_below_min",
                    f"The {at - timedelta(hours=utc_offset_hours):%d %b %H:%M} local dry "
                    f"bulb {c} is below the day's lowest {report.min_c}.",
                    "warning",
                )
                break


def gust_code(knots: int, wind_indicator: str) -> str | None:
    """The gust in the unit of the entry's wind indicator, or None if unknown."""
    if wind_indicator in ("3", "4"):
        value = knots
    elif wind_indicator in ("0", "1"):
        value = round(knots * KNOT_MS)
    else:
        return None
    width = 3 if value >= THREE_DIGIT_GUST_FROM else 2
    return f"{value:0{width}d}"


@dataclass(frozen=True)
class LiveRow:
    """An observation already in the register for one hour."""

    state: str
    notes: str | None
    review_outcome: str | None
    body: Mapping[str, Any]


@dataclass
class Planned:
    """What to do for one hour: the body to save, or why it is left alone."""

    observed_at: datetime
    rows: list[int]
    action: Literal["update", "unchanged", "skip"]
    reason: str = ""
    body: dict[str, Any] | None = None
    added: dict[str, str] = field(default_factory=dict)


def _wanted(
    reports: Sequence[DayReport],
) -> dict[datetime, tuple[dict[str, str], list[int], list[str]]]:
    """Per hour: coded fields, the file rows behind them, and any clash between rows."""
    wanted: dict[datetime, tuple[dict[str, str], list[int], list[str]]] = {}
    for report in reports:
        if report.status != "ready":
            continue
        for at, values in report.fields.items():
            fields, rows, clashes = wanted.setdefault(at, ({}, [], []))
            rows.append(report.row)
            for name, code in values.items():
                if fields.get(name, code) != code:
                    clashes.append(name)
                fields.setdefault(name, code)
        for at, knots in report.gusts.items():
            fields, rows, clashes = wanted.setdefault(at, ({}, [], []))
            rows.append(report.row)
            code = str(knots)
            if fields.get("wind_gust_kt", code) != code:
                clashes.append("wind_gust")
            fields.setdefault("wind_gust_kt", code)
    return wanted


def plan_merge(
    reports: Sequence[DayReport], live: Mapping[datetime, LiveRow]
) -> list[Planned]:
    """Decide, hour by hour, which live drafts get the new values.

    Only a draft the hourly importer made and nobody reviewed is changed
    (``cl1_import.may_update``). A value that is already there is never replaced; a
    different one leaves the whole hour untouched and listed.
    """
    plans: list[Planned] = []
    for at, (fields, rows, clashes) in sorted(_wanted(reports).items()):
        plan = Planned(observed_at=at, rows=sorted(set(rows)), action="skip")
        plans.append(plan)
        if clashes:
            plan.reason = f"two rows give different values for {', '.join(clashes)}"
            continue
        row = live.get(at)
        if row is None:
            plan.reason = "no hourly entry for that hour in the register"
            continue
        if not cl1_import.may_update(row.state, row.notes, row.review_outcome):
            plan.reason = (
                f"already there as {row.state} (not an unreviewed imported draft)"
            )
            continue
        coded = dict(fields)
        knots = coded.pop("wind_gust_kt", None)
        if knots is not None:
            gust = gust_code(int(knots), str(row.body.get("wind_indicator") or ""))
            if gust is None:
                plan.reason = (
                    "the entry has no wind indicator, so the gust unit is unknown"
                )
                continue
            coded["wind_gust"] = gust
        differing = [
            f"{name} is {row.body[name]!r}, the file says {code!r}"
            for name, code in coded.items()
            if str(row.body.get(name) or "").strip() not in ("", code)
        ]
        if differing:
            plan.reason = "already has a different value: " + "; ".join(differing)
            continue
        added = {
            name: code
            for name, code in coded.items()
            if str(row.body.get(name) or "").strip() != code
        }
        plan.added = added
        if not added:
            plan.action = "unchanged"
            plan.reason = "already has these values"
            continue
        plan.action = "update"
        plan.body = {**row.body, **added}
    return plans
