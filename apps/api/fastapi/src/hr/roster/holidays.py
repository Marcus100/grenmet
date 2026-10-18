"""Provisional Grenada public holiday calendar.

These dates are a best-effort starting point so rosters and the calendar are
usable before GAA HR supplies its official list. Every row is stored as
provisional and editable in HR setup. Nothing here is a statement of law.

Rules used (all flagged for HR verification):
- Fixed-date holidays use their nominal date. When the nominal date falls on a
  Saturday or Sunday the observed day is not assumed; the row is marked
  ``needs_verification`` instead.
- Easter-based holidays follow the Western (Gregorian) Easter.
- Carnival Monday and Tuesday are the second Monday and Tuesday of August.
- Emancipation Day uses 1 August. The statutory observed day may differ.
"""

from dataclasses import dataclass
from datetime import date, timedelta

PROVISIONAL_SOURCE = "provisional - verify with GAA HR"
MIN_YEAR = 2000
MAX_YEAR = 2100
_UNCERTAIN_NAMES = {"Emancipation Day", "Carnival Monday", "Carnival Tuesday"}
_SATURDAY = 5


@dataclass(frozen=True)
class ProvisionalHoliday:
    name: str
    holiday_date: date
    needs_verification: bool


def easter_sunday(year: int) -> date:
    """Western Easter by the anonymous Gregorian algorithm."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    weekday_offset = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * weekday_offset) // 451
    month, day = divmod(h + weekday_offset - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def provisional_holidays(year: int) -> list[ProvisionalHoliday]:
    easter = easter_sunday(year)
    carnival_monday = _nth_weekday(year, 8, 0, 2)
    # (name, date, fixed calendar date)
    entries: list[tuple[str, date, bool]] = [
        ("New Year's Day", date(year, 1, 1), True),
        ("Independence Day", date(year, 2, 7), True),
        ("Good Friday", easter - timedelta(days=2), False),
        ("Easter Monday", easter + timedelta(days=1), False),
        ("Labour Day", date(year, 5, 1), True),
        ("Whit Monday", easter + timedelta(days=50), False),
        ("Corpus Christi", easter + timedelta(days=60), False),
        ("Emancipation Day", date(year, 8, 1), True),
        ("Carnival Monday", carnival_monday, False),
        ("Carnival Tuesday", carnival_monday + timedelta(days=1), False),
        ("Thanksgiving Day", date(year, 10, 25), True),
        ("Christmas Day", date(year, 12, 25), True),
        ("Boxing Day", date(year, 12, 26), True),
    ]
    return [
        ProvisionalHoliday(
            name=name,
            holiday_date=when,
            needs_verification=(fixed and when.weekday() >= _SATURDAY)
            or name in _UNCERTAIN_NAMES,
        )
        for name, when, fixed in entries
    ]
