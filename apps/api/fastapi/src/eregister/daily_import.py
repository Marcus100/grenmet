"""Values the hourly sheet lacks (rainfall, maximum and minimum temperature, gust).

The observers send these from their other paper sheets and instruments in a small CSV
(``local_time``, ``rainfall_24h_mm``, ``highest_temp_c``, ``lowest_temp_c``,
``strongest_gust_kt``, ``gust_time_local``, ``notes``). One row is one observation at a
main hour, in local standard time. This module reads the file, works out where each
value belongs in the register and checks it. Pure functions: no I/O;
``scripts/import_daily_values.py`` reads the live hourly drafts and saves.

Where a value goes (the register's own convention, see ``rules.py``; the owner
confirmed that the thermometers are read at every main hour and the daily rainfall at
08:00 local):

* The maximum and minimum temperature are groups 1 and 2 of section 3 (``s3_max_temp``,
  ``s3_min_temp``) of the entry at that main hour: 00, 06, 12 and 18 UTC, which are
  20:00, 02:00, 08:00 and 14:00 local standard time (UTC-4).
* The 24 hour rainfall is group 7 of section 3 (``s3_rainfall_24h``, four digits in
  tenths of a millimetre, 9999 = trace). It is read once a day at 08:00 local, which is
  the 12 UTC entry; a rainfall on any other row is refused, never moved.
* The strongest gust is the gust cell (``wind_gust``, in the unit of the entry's wind
  indicator) of the first observation at or after the time of the gust, because an
  entry reports the wind up to its hour. The register labels that cell a ten-minute
  gust, so the file's gust is the strongest gust of that hour.

Nothing is invented: an empty cell leaves the register as it is. A value is only ever
added to a draft the hourly importer made and nobody reviewed, and never replaces a
different value that is already there.
"""

import csv
import io
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from . import cl1_import, derive, public, rules
from .schemas import SynopValidationIssue

RowStatus = Literal["ready", "blocked", "empty", "unreadable"]

STATION_ID = cl1_import.STATION_ID
UTC_OFFSET_HOURS = cl1_import.UTC_OFFSET_HOURS
RAIN_UTC_HOUR = rules.SYNOP_NOON_HOUR
MAIN_UTC_HOURS = rules.MAIN_HOURS
KNOT_MS = rules.KNOT_MS
RAIN_TRACE_WORDS = frozenset({"t", "tr", "trace"})
RAIN_TRACE_CODE = "9999"
MAX_RAIN_TENTHS = 9998
RAIN_CHECK_MM = Decimal(
    300
)  # a single day this wet is possible but worth a second look
USUAL_TEMPERATURE_C = (Decimal(15), Decimal(38))  # outside this: check the thermometer
HOURLY_TOLERANCE_C = 0.3  # the paper and the thermometer round differently
EXTREMES_WINDOW = timedelta(hours=6)  # thermometers are read at every main hour
GUST_CHECK_KT = 80
THREE_DIGIT_GUST_FROM = 99
COLUMNS = (
    "local_time",
    "rainfall_24h_mm",
    "highest_temp_c",
    "lowest_temp_c",
    "strongest_gust_kt",
    "gust_time_local",
    "notes",
)
VALUE_COLUMNS = (
    "rainfall_24h_mm",
    "highest_temp_c",
    "lowest_temp_c",
    "strongest_gust_kt",
)
TIME_FORMATS = ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H%M")


class DailyFormatError(ValueError):
    """The file is not the template (no time column or no value columns)."""


@dataclass
class RowReport:
    """One file row: the register fields it fills and every issue found."""

    row: int
    status: RowStatus
    key: datetime | None = None  # the row's local time, for messages and duplicates
    observed_at: datetime | None = None  # the same time in UTC
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
    report: RowReport,
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
    if ("local_time" not in names and "gust_time_local" not in names) or not any(
        name in names for name in VALUE_COLUMNS
    ):
        raise DailyFormatError(
            "Not the template: the first row needs a 'local_time' column and at least "
            f"one of {', '.join(VALUE_COLUMNS)}."
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


def _local(cell: str) -> datetime | None:
    text = cell.strip()
    for pattern in TIME_FORMATS:
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue
    return None


def _to_utc(local: datetime, offset_hours: int) -> datetime:
    return local.replace(tzinfo=UTC) + timedelta(hours=offset_hours)


def _rain(report: RowReport, cells: Mapping[str, str], at: datetime | None) -> None:
    cell = cells.get("rainfall_24h_mm", "").strip()
    if not cell:
        return
    name = "s3_rainfall_24h"
    if at is None or report.key is None:
        _issue(report, name, "time_needed", "Rainfall needs the row's local_time.")
        return
    if at.hour != RAIN_UTC_HOUR:
        _issue(
            report,
            name,
            "reading_time",
            "The 24 hour rainfall is read at 08:00 local (12 UTC) but this row is at "
            f"{report.key:%H:%M} local. Nothing was saved for this value; ask GMS how "
            "to record it.",
        )
        return
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
    report.fields.setdefault(at, {})[name] = code


def _temperature(
    report: RowReport, cells: Mapping[str, str], column: str, name: str
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
    if not rules.TEMPERATURE_MIN_C <= value <= rules.TEMPERATURE_MAX_C:
        _issue(
            report,
            name,
            "out_of_range",
            f"{cell!r} °C is outside what the register accepts "
            f"({rules.TEMPERATURE_MIN_C} to {rules.TEMPERATURE_MAX_C}).",
        )
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


def _extremes(report: RowReport, cells: Mapping[str, str], at: datetime | None) -> None:
    high = _temperature(report, cells, "highest_temp_c", "s3_max_temp")
    low = _temperature(report, cells, "lowest_temp_c", "s3_min_temp")
    if high is None and low is None:
        return
    if at is None or report.key is None:
        _issue(
            report,
            "s3_max_temp",
            "time_needed",
            "Temperatures need the row's local_time.",
        )
        return
    if at.hour not in MAIN_UTC_HOURS:
        mains = ", ".join(
            f"{(hour - UTC_OFFSET_HOURS) % 24:02d}:00" for hour in MAIN_UTC_HOURS
        )
        _issue(
            report,
            "s3_max_temp",
            "reading_time",
            f"Maximum and minimum temperatures are read at the main hours ({mains} "
            f"local) but this row is at {report.key:%H:%M}. Nothing was saved for them.",
        )
        return
    if high is not None and low is not None and high < low:
        _issue(
            report,
            "s3_max_temp",
            "max_below_min",
            f"The highest temperature {high} is below the lowest {low}.",
        )
        return
    target = report.fields.setdefault(at, {})
    if high is not None:
        target["s3_max_temp"] = derive.temperature_group(float(high))
        report.max_c = high
    if low is not None:
        target["s3_min_temp"] = derive.temperature_group(float(low))
        report.min_c = low


def _gust(report: RowReport, cells: Mapping[str, str], offset_hours: int) -> None:
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
    gust_local = _local(when) if when else None
    if gust_local is None:
        message = (
            f"Cannot read the gust time {when!r} (use YYYY-MM-DD HH:MM local)."
            if when
            else "The gust needs the date and time it happened (gust_time_local, "
            "YYYY-MM-DD HH:MM local) to choose the observation that reports it."
        )
        _issue(report, "gust_time_local", "gust_time", message)
        return
    start = _to_utc(gust_local, offset_hours)
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


def convert_row(
    number: int,
    cells: Mapping[str, str],
    *,
    utc_offset_hours: int = UTC_OFFSET_HOURS,
) -> RowReport:
    """One file row to the register fields it fills, with its issues."""
    raw = cells.get("local_time", "").strip()
    local = _local(raw) if raw else None
    if raw and local is None:
        report = RowReport(row=number, status="unreadable")
        _issue(
            report,
            "local_time",
            "unreadable_time",
            f"Cannot read the time {raw!r} (use YYYY-MM-DD HH:MM local).",
        )
        return report
    at = _to_utc(local, utc_offset_hours) if local else None
    report = RowReport(row=number, status="ready", key=local, observed_at=at)
    _rain(report, cells, at)
    _extremes(report, cells, at)
    _gust(report, cells, utc_offset_hours)
    report.fields = {when: values for when, values in report.fields.items() if values}
    if report.errors:
        report.status = "blocked"
        report.fields.clear()
        report.gusts.clear()
    elif not report.fields and not report.gusts:
        report.status = "empty"
    return report


def check_rows(
    rows: Sequence[tuple[int, Mapping[str, str]]],
    *,
    utc_offset_hours: int = UTC_OFFSET_HOURS,
) -> list[RowReport]:
    """Convert every row; a time given twice blocks both rows (which one is right?)."""
    reports = [
        convert_row(number, cells, utc_offset_hours=utc_offset_hours)
        for number, cells in rows
    ]
    seen: dict[datetime, list[RowReport]] = {}
    for report in reports:
        if report.key is not None:
            seen.setdefault(report.key, []).append(report)
    for key, same in seen.items():
        if len(same) > 1:
            for report in same:
                _issue(
                    report,
                    "local_time",
                    "duplicate_time",
                    f"{key:%Y-%m-%d %H:%M} appears on rows "
                    f"{', '.join(str(r.row) for r in same)}.",
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
    report: RowReport, air: Mapping[datetime, float], *, utc_offset_hours: int
) -> None:
    """Warn when an hour's dry bulb is outside the extremes read at this main hour.

    The thermometers are read at every main hour, so the window is the six hours that
    end at the reading. A dry bulb above the highest or below the lowest means one of
    the two readings is wrong (a warning only: the paper and the thermometer round
    differently).
    """
    end = report.observed_at
    if end is None:
        return
    window = {at: c for at, c in air.items() if end - EXTREMES_WINDOW < at <= end}
    if report.max_c is not None:
        for at, c in sorted(window.items()):
            if c > float(report.max_c) + HOURLY_TOLERANCE_C:
                _issue(
                    report,
                    "s3_max_temp",
                    "air_above_max",
                    f"The {at - timedelta(hours=utc_offset_hours):%d %b %H:%M} local dry "
                    f"bulb {c} is above the highest {report.max_c}.",
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
                    f"bulb {c} is below the lowest {report.min_c}.",
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
    warnings: list[str] = field(default_factory=list)
    wanted: dict[str, str] = field(default_factory=dict)  # coded fields from the file


Wanted = dict[datetime, tuple[dict[str, str], list[int], list[str]]]


def _wanted(reports: Sequence[RowReport]) -> Wanted:
    """Per hour: coded fields, the file rows behind them, and any clash between rows."""
    wanted: Wanted = {}
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


def _has_gust_group(body: Mapping[str, Any]) -> bool:
    tokens = str(body.get("s3_special_phenomena") or "").split()
    return any(token.startswith("910") for token in tokens)


def plan_hour(plan: Planned, fields: dict[str, str], row: LiveRow | None) -> Planned:
    """Fill in ``plan`` for one hour from the live row (also used again at save time)."""
    if row is None:
        plan.reason = "no hourly entry for that hour in the register"
        return plan
    if not cl1_import.may_update(row.state, row.notes, row.review_outcome):
        plan.reason = f"already there as {row.state} (not an unreviewed imported draft)"
        return plan
    coded = dict(fields)
    knots = coded.pop("wind_gust_kt", None)
    if knots is not None:
        if _has_gust_group(row.body):
            plan.reason = "the entry already reports a gust in its 910 group"
            return plan
        gust = gust_code(int(knots), str(row.body.get("wind_indicator") or ""))
        if gust is None:
            plan.reason = "the entry has no wind indicator, so the gust unit is unknown"
            return plan
        coded["wind_gust"] = gust
        speed = str(row.body.get("wind_speed") or "").strip()
        if speed.isdigit() and int(gust) < int(speed):
            plan.warnings.append(
                f"the gust {gust} is below the mean wind {speed} of that observation; "
                "check the gust time"
            )
    differing = [
        f"{name} is {row.body[name]!r}, the file says {code!r}"
        for name, code in coded.items()
        if str(row.body.get(name) or "").strip() not in ("", code)
    ]
    if differing:
        plan.reason = "already has a different value: " + "; ".join(differing)
        return plan
    plan.added = {
        name: code
        for name, code in coded.items()
        if str(row.body.get(name) or "").strip() != code
    }
    if not plan.added:
        plan.action = "unchanged"
        plan.reason = "already has these values"
        return plan
    plan.action = "update"
    plan.body = {**row.body, **plan.added}
    return plan


def plan_merge(
    reports: Sequence[RowReport], live: Mapping[datetime, LiveRow]
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
        plan.wanted = fields
        plan_hour(plan, fields, live.get(at))
    return plans
