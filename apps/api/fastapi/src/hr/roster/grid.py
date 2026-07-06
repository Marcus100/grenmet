"""Shared grid-format roster parsing and name resolution.

Home of the grid logic used by the HTTP import-grid endpoint
(`src/hr/roster/service.py`). Extracted verbatim from the CLI script
`scripts/import_roster.py`, which still has a parallel copy — consolidate the
script onto this module in a follow-up so the two can never drift.

Grid shape: a header row `name,1,2,3,...` (day-of-month columns) followed by one
row per person: `Name, <code>, <code>, ...` with blank cells for unassigned days.
"""

import csv
from io import StringIO

from src.auth.models import User


def parse_grid(csv_text: str, days_in_month: int) -> dict[str, dict[int, str]]:
    """Parse grid CSV text into `{name: {day: code}}`, skipping blank cells.

    Raises `ValueError` on a malformed header, an out-of-range day column, a
    duplicate name row, or an empty grid.
    """
    reader = csv.reader(StringIO(csv_text))
    header = next(reader, None)
    if not header or header[0].strip().lower() != "name":
        raise ValueError("CSV must start with a header row: name,1,2,...")

    day_columns: list[int] = []
    for raw_cell in header[1:]:
        cell = raw_cell.strip()
        if not cell:
            continue
        if not cell.isdigit() or not (1 <= int(cell) <= days_in_month):
            raise ValueError(
                f"Header day column {cell!r} is not a valid day of the month"
            )
        day_columns.append(int(cell))

    grid: dict[str, dict[int, str]] = {}
    for row_number, row in enumerate(reader, start=2):
        if not row or not row[0].strip():
            continue
        name = row[0].strip()
        codes: dict[int, str] = {}
        for day, cell in zip(day_columns, row[1:], strict=False):
            code = cell.strip().upper()
            if code:
                codes[day] = code
        if name in grid:
            raise ValueError(f"Duplicate row for {name!r} (line {row_number})")
        grid[name] = codes

    if not grid:
        raise ValueError("CSV contains no roster rows")
    return grid


def resolve_user(name: str, users: list[User]) -> User | None:
    """Match a grid row name to a user by username, or paper-style 'F. Lastname'.

    Returns the single match, or None when unknown or ambiguous.
    """
    lowered = name.lower()
    for user in users:
        if user.username.lower() == lowered:
            return user
    compact = lowered.replace(".", "").replace(" ", "")
    matches = [
        user
        for user in users
        if user.first_name
        and user.last_name
        and f"{user.first_name[0]}{user.last_name}".lower().replace(" ", "") == compact
    ]
    return matches[0] if len(matches) == 1 else None
