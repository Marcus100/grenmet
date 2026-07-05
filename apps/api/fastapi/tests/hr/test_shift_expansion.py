"""Unit tests for the shift expansion utility (no DB required).

Shift times mirror the seeded Met Office catalog: M 0530-1400, D 0800-1600,
E 1400-2230, N 2230-0600 (ends next day).
"""

from datetime import date, datetime
from decimal import Decimal

import pytest

from src.hr.roster.expansion import expand_shift, shift_hours
from src.hr.roster.models import ShiftCatalog, ShiftCategory


def _shift(
    code: str,
    start_time: str | None,
    end_time: str | None,
    *,
    ends_next_day: bool = False,
    category: ShiftCategory = ShiftCategory.WORK,
) -> ShiftCatalog:
    return ShiftCatalog(
        code=code,
        label=code,
        category=category,
        start_time=start_time,
        end_time=end_time,
        ends_next_day=ends_next_day,
        counts_as_work_hours=category == ShiftCategory.WORK,
    )


def test_morning_shift_expands_same_day() -> None:
    interval = expand_shift(date(2026, 7, 1), _shift("M", "05:30", "14:00"))
    assert interval == (datetime(2026, 7, 1, 5, 30), datetime(2026, 7, 1, 14, 0))


def test_night_shift_ends_next_day() -> None:
    interval = expand_shift(
        date(2026, 7, 1), _shift("N", "22:30", "06:00", ends_next_day=True)
    )
    assert interval == (datetime(2026, 7, 1, 22, 30), datetime(2026, 7, 2, 6, 0))


def test_night_shift_crosses_month_boundary() -> None:
    interval = expand_shift(
        date(2026, 7, 31), _shift("N", "22:30", "06:00", ends_next_day=True)
    )
    assert interval == (datetime(2026, 7, 31, 22, 30), datetime(2026, 8, 1, 6, 0))


def test_codes_without_times_expand_to_none() -> None:
    for code, category in (
        ("O", ShiftCategory.OFF),
        ("L", ShiftCategory.LEAVE),
        ("V", ShiftCategory.LEAVE),
        ("S", ShiftCategory.LEAVE),
    ):
        assert (
            expand_shift(date(2026, 7, 1), _shift(code, None, None, category=category))
            is None
        )


def test_met_shift_hours() -> None:
    assert shift_hours(_shift("M", "05:30", "14:00")) == Decimal("8.50")
    assert shift_hours(_shift("D", "08:00", "16:00")) == Decimal("8.00")
    assert shift_hours(_shift("E", "14:00", "22:30")) == Decimal("8.50")
    assert shift_hours(_shift("N", "22:30", "06:00", ends_next_day=True)) == Decimal(
        "7.50"
    )


def test_hours_none_for_codes_without_times() -> None:
    assert shift_hours(_shift("O", None, None, category=ShiftCategory.OFF)) is None


def test_midnight_crossing_without_flag_is_rejected() -> None:
    with pytest.raises(ValueError, match="ends_next_day"):
        expand_shift(date(2026, 7, 1), _shift("X", "22:30", "06:00"))


def test_zero_length_shift_is_rejected() -> None:
    with pytest.raises(ValueError, match="ends at or before"):
        expand_shift(date(2026, 7, 1), _shift("X", "08:00", "08:00"))
