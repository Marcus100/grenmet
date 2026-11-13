"""Read a fingerprint or fob terminal export (ADR-0040, Decision 4). No database access.

Two shapes are accepted, chosen from the first non-blank line:

* ZKTeco ATTLOG text: ``<device user id> <YYYY-MM-DD> <HH:MM:SS> [more columns]``,
  separated by tabs or spaces. Columns after the time (verify mode, state, work
  code) are ignored.
* CSV with a header naming ``device_user_id`` and ``punched_at``. ``punched_at``
  is ``YYYY-MM-DD HH:MM:SS`` or ``YYYY-MM-DDTHH:MM:SS``.

Device times are Grenada wall-clock times and are returned as naive UTC. A bad
line is reported with its line number and never stops the rest of the file.
Only the device user ID and the punch time are read: no biometric field exists.
"""

import csv
import re
from dataclasses import dataclass, field
from datetime import datetime

from src.utils.timezones import GRENADA, local_to_utc

ATTLOG = "ZKTECO_ATTLOG"
CSV = "CSV"
CSV_COLUMNS = ("device_user_id", "punched_at")
DEVICE_USER_ID = re.compile(r"^\S{1,32}$")
LOCAL_TIME = "%Y-%m-%d %H:%M:%S"


@dataclass(frozen=True)
class ParsedPunch:
    line: int
    device_user_id: str
    #: Naive UTC, as stored in the database.
    punched_at: datetime


@dataclass(frozen=True)
class LineError:
    line: int
    message: str


@dataclass(frozen=True)
class ParseResult:
    format: str
    punches: list[ParsedPunch] = field(default_factory=list)
    errors: list[LineError] = field(default_factory=list)


def parse_export(text: str) -> ParseResult:
    lines = text.splitlines()
    first = next(
        ((number, line) for number, line in enumerate(lines, 1) if line.strip()),
        None,
    )
    if first is not None and _is_csv_header(first[1]):
        return _parse_csv(lines, first[0])
    return _parse_attlog(lines)


def _is_csv_header(line: str) -> bool:
    cells = {cell.strip().lower() for cell in line.split(",")}
    return set(CSV_COLUMNS) <= cells


def _parse_attlog(lines: list[str]) -> ParseResult:
    punches: list[ParsedPunch] = []
    errors: list[LineError] = []
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        tokens = line.split()
        if len(tokens) < 3:
            errors.append(LineError(number, "Expected a user ID, a date and a time"))
            continue
        _accept(punches, errors, number, tokens[0], f"{tokens[1]} {tokens[2]}")
    return ParseResult(format=ATTLOG, punches=punches, errors=errors)


def _parse_csv(lines: list[str], header_number: int) -> ParseResult:
    header = [cell.strip().lower() for cell in _cells(lines[header_number - 1])]
    device_column = header.index(CSV_COLUMNS[0])
    time_column = header.index(CSV_COLUMNS[1])
    punches: list[ParsedPunch] = []
    errors: list[LineError] = []
    for number in range(header_number + 1, len(lines) + 1):
        line = lines[number - 1]
        if not line.strip():
            continue
        try:
            cells = _cells(line)
        except csv.Error as error:
            errors.append(LineError(number, f"Not a CSV row: {error}"))
            continue
        if len(cells) <= max(device_column, time_column):
            errors.append(LineError(number, "Expected device_user_id and punched_at"))
            continue
        _accept(
            punches,
            errors,
            number,
            cells[device_column].strip(),
            cells[time_column].strip(),
        )
    return ParseResult(format=CSV, punches=punches, errors=errors)


def _cells(line: str) -> list[str]:
    return next(csv.reader([line]))


def _accept(
    punches: list[ParsedPunch],
    errors: list[LineError],
    number: int,
    device_user_id: str,
    stamp: str,
) -> None:
    if not DEVICE_USER_ID.match(device_user_id):
        errors.append(
            LineError(
                number, "Device user ID must be 1 to 32 characters with no spaces"
            )
        )
        return
    try:
        local = datetime.strptime(stamp.replace("T", " ", 1), LOCAL_TIME)
    except ValueError:
        errors.append(
            LineError(number, "Punch time must be YYYY-MM-DD HH:MM:SS, Grenada local")
        )
        return
    punches.append(
        ParsedPunch(
            line=number,
            device_user_id=device_user_id,
            punched_at=local_to_utc(local.date(), local.time(), GRENADA),
        )
    )
