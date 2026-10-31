"""The pay-input CSV: quantities only, one row per pay line.

Columns identify people by employee number and payroll reference (no names)
and carry no money. Every row says whether its pay item is still
provisional. A generic layout until GAA supplies an HrPlus import sample.
"""

import csv
import io
import uuid
from collections.abc import Mapping, Sequence
from datetime import date

from .models import PayPeriod, RuleState

COLUMNS = (
    "period_start",
    "period_end",
    "run",
    "line_kind",
    "employee_number",
    "payroll_reference",
    "department_code",
    "work_date",
    "item_code",
    "item_name",
    "unit",
    "quantity",
    "provisional",
    "source_type",
    "adjusts_period_start",
    "line_id",
)
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _text(value: object) -> str:
    """Neutralise spreadsheet formulas in free text (numbers are written as is)."""
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_FORMULA_PREFIXES) else text


def _iso(value: object) -> str:
    return value.isoformat() if isinstance(value, date) else ""


def render(
    period: PayPeriod,
    rows: Sequence[Mapping[str, object]],
    adjusted_starts: Mapping[uuid.UUID, date],
) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(COLUMNS)
    for row in rows:
        adjusts = row.get("adjusts_period_id")
        writer.writerow(
            (
                period.start_date.isoformat(),
                period.end_date.isoformat(),
                row["run_kind"],
                row["line_kind"],
                _text(row.get("employee_number")),
                _text(row.get("payroll_reference")),
                _text(row.get("department_code")),
                _iso(row.get("work_date")),
                _text(row["pay_item_code"]),
                _text(row["pay_item_name"]),
                row["unit"],
                f"{row['quantity']:.2f}",
                "yes" if row["rule_state"] == RuleState.PROVISIONAL else "no",
                row["source_type"],
                _iso(adjusted_starts.get(adjusts))
                if isinstance(adjusts, uuid.UUID)
                else "",
                str(row["id"]),
            )
        )
    return buffer.getvalue()


def filename(period: PayPeriod) -> str:
    return (
        f"pay-inputs-{period.organisation_id}-"
        f"{period.start_date.isoformat()}-{period.end_date.isoformat()}.csv"
    )
