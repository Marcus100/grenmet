"""Unit tests for roster rule checks (no DB required).

Shift times mirror the seeded Met Office catalog: M 0530-1400, D 0800-1600,
E 1400-2230, N 2230-0600 (ends next day).
"""

from collections.abc import Callable
from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.roster.rules import (
    RosterRules,
    RosterShift,
    RuleCode,
    check_roster_rules,
    week_start,
)


def _shift(
    code: str,
    start: str | None,
    end: str | None,
    *,
    ends_next_day: bool = False,
    category: ShiftCategory = ShiftCategory.WORK,
) -> ShiftCatalog:
    return ShiftCatalog(
        code=code,
        label=code,
        category=category,
        start_time=start,
        end_time=end,
        ends_next_day=ends_next_day,
        counts_as_work_hours=category == ShiftCategory.WORK,
    )


MORNING = _shift("M", "05:30", "14:00")
EVENING = _shift("E", "14:00", "22:30")
NIGHT = _shift("N", "22:30", "06:00", ends_next_day=True)
DAY_OFF = _shift("O", None, None, category=ShiftCategory.OFF)

USER = uuid4()


def _on(user: UUID, day: int, shift: ShiftCatalog) -> RosterShift:
    return RosterShift(user_id=user, assignment_date=date(2026, 10, day), shift=shift)


def test_no_rules_enabled_reports_nothing() -> None:
    roster = [_on(USER, 4, NIGHT), _on(USER, 5, MORNING)]
    assert check_roster_rules(roster, RosterRules()) == []


def test_short_rest_after_night_shift_is_flagged() -> None:
    # Night ends 06:00 on the 5th; morning starts 05:30 on the 5th is an overlap.
    roster = [_on(USER, 4, NIGHT), _on(USER, 5, MORNING)]
    [violation] = check_roster_rules(roster, RosterRules(min_rest_hours=Decimal(11)))
    assert violation.code == RuleCode.MIN_REST
    assert violation.observed == Decimal("-0.50")
    assert violation.start_date == date(2026, 10, 5)


def test_rest_exactly_at_limit_passes() -> None:
    # Evening ends 22:30; next morning starts 05:30 = 7 h rest.
    roster = [_on(USER, 4, EVENING), _on(USER, 5, MORNING)]
    assert check_roster_rules(roster, RosterRules(min_rest_hours=Decimal(7))) == []
    assert len(check_roster_rules(roster, RosterRules(min_rest_hours=Decimal(8)))) == 1


def test_off_and_leave_codes_do_not_count() -> None:
    roster = [_on(USER, 4, EVENING), _on(USER, 5, DAY_OFF)]
    rules = RosterRules(
        min_rest_hours=Decimal(24),
        max_consecutive_days=1,
        max_weekly_hours=Decimal(1),
    )
    codes = {v.code for v in check_roster_rules(roster, rules)}
    assert codes == {RuleCode.MAX_WEEKLY_HOURS}


def test_consecutive_days_run_over_limit_is_one_violation() -> None:
    roster = [_on(USER, day, MORNING) for day in (1, 2, 3, 4, 5, 6, 7)]
    [violation] = check_roster_rules(roster, RosterRules(max_consecutive_days=6))
    assert violation.code == RuleCode.MAX_CONSECUTIVE_DAYS
    assert violation.observed == Decimal(7)
    assert (violation.start_date, violation.end_date) == (
        date(2026, 10, 1),
        date(2026, 10, 7),
    )


def test_day_off_breaks_a_working_run() -> None:
    roster = [_on(USER, day, MORNING) for day in (1, 2, 3, 5, 6, 7)]
    assert check_roster_rules(roster, RosterRules(max_consecutive_days=3)) == []


def test_two_runs_over_limit_report_separately() -> None:
    roster = [_on(USER, day, MORNING) for day in (1, 2, 3, 10, 11, 12)]
    found = check_roster_rules(roster, RosterRules(max_consecutive_days=2))
    assert [(v.start_date.day, v.end_date.day) for v in found] == [(1, 3), (10, 12)]


def test_weekly_hours_use_sunday_to_saturday_by_start_date() -> None:
    # 2026-10-03 is a Saturday; its night shift ends Sunday but stays in that week.
    assert week_start(date(2026, 10, 3)) == date(2026, 9, 27)
    assert week_start(date(2026, 10, 4)) == date(2026, 10, 4)
    roster = [_on(USER, 3, NIGHT), _on(USER, 4, MORNING)]
    [violation] = check_roster_rules(roster, RosterRules(max_weekly_hours=Decimal(8)))
    assert (violation.start_date, violation.observed) == (
        date(2026, 10, 4),
        Decimal("8.50"),
    )
    both = check_roster_rules(roster, RosterRules(max_weekly_hours=Decimal(7)))
    assert [v.start_date for v in both] == [date(2026, 9, 27), date(2026, 10, 4)]


def test_weekly_hours_sum_across_shifts() -> None:
    roster = [_on(USER, day, MORNING) for day in (4, 5, 6, 7, 8)]  # 5 x 8.5 = 42.5
    [violation] = check_roster_rules(roster, RosterRules(max_weekly_hours=Decimal(40)))
    assert violation.observed == Decimal("42.50")
    assert violation.end_date == date(2026, 10, 10)


def test_employees_are_checked_independently() -> None:
    other = uuid4()
    roster = [_on(USER, 4, EVENING), _on(other, 5, MORNING)]
    assert check_roster_rules(roster, RosterRules(min_rest_hours=Decimal(11))) == []


@pytest.mark.parametrize(
    "build",
    [
        lambda: RosterRules(min_rest_hours=Decimal(-1)),
        lambda: RosterRules(max_consecutive_days=0),
        lambda: RosterRules(max_weekly_hours=Decimal(0)),
    ],
)
def test_invalid_limits_are_rejected(build: Callable[[], RosterRules]) -> None:
    with pytest.raises(ValueError):
        build()
