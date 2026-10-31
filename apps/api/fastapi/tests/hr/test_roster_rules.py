"""Unit tests for the roster rule engine (#380; no database).

Shift times mirror the seeded Met Office catalogue: M 0530-1400, D 0800-1600,
E 1400-2230, N 2230-0600 (ends next day). October 2026 starts on a Thursday;
Saturday 3, Sunday 4, ... Saturday 31; 1 November 2026 is a Sunday.
"""

from collections.abc import Callable, Iterable
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from src.hr.roster.models import ShiftCatalog, ShiftCategory, WorkerType, WorkPattern
from src.hr.roster.rules import (
    DEFAULT_RULES,
    EmployeeRuleProfile,
    RosterRules,
    RosterShift,
    RuleCode,
    RuleViolation,
    check_notice,
    check_roster_rules,
    introduced,
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


MORNING = _shift("M", "05:30", "14:00")  # 8.5 h
DAY = _shift("D", "08:00", "16:00")  # 8 h
EVENING = _shift("E", "14:00", "22:30")  # 8.5 h
NIGHT = _shift("N", "22:30", "06:00", ends_next_day=True)  # 7.5 h
SEVEN = _shift("S7", "08:00", "15:00")  # 7 h
DAY_OFF = _shift("O", None, None, category=ShiftCategory.OFF)
VACATION = _shift("V", None, None, category=ShiftCategory.LEAVE)

USER = uuid4()
OTHER = uuid4()


def _d(day: int, month: int = 10) -> date:
    return date(2026, month, day)


def _on(user: UUID, day: date | int, shift: ShiftCatalog) -> RosterShift:
    when = day if isinstance(day, date) else _d(day)
    return RosterShift(user_id=user, assignment_date=when, shift=shift)


def _days(start: date, count: int) -> list[date]:
    return [start + timedelta(days=n) for n in range(count)]


def _codes(violations: Iterable[RuleViolation]) -> list[str]:
    return [v.code.value for v in violations]


# --- defaults --------------------------------------------------------------


def test_defaults_are_the_confirmed_values_all_on() -> None:
    assert DEFAULT_RULES.max_consecutive_shifts == 3
    assert DEFAULT_RULES.min_days_off_after_run == 2
    assert DEFAULT_RULES.shift_daily_hours == Decimal(8)
    assert DEFAULT_RULES.shift_weekly_hours == Decimal(40)
    assert DEFAULT_RULES.non_shift_weekly_hours == Decimal(35)
    assert DEFAULT_RULES.non_shift_daily_hours is None
    assert DEFAULT_RULES.weekend_window_weeks == 4
    assert DEFAULT_RULES.notice_days == 7
    assert DEFAULT_RULES.overtime is not None
    assert DEFAULT_RULES.checks_roster


def test_no_rules_enabled_reports_nothing() -> None:
    roster = [_on(USER, day, DAY) for day in range(1, 15)]
    assert check_roster_rules(roster, RosterRules()) == []


def test_off_and_leave_codes_do_not_count() -> None:
    roster = [
        _on(USER, 5, DAY),
        _on(USER, 6, DAY),
        _on(USER, 7, DAY_OFF),
        _on(USER, 8, VACATION),
        _on(USER, 9, DAY),
    ]
    assert check_roster_rules(roster, RosterRules(max_consecutive_shifts=2)) == []


# --- rule 1: consecutive shifts and days off --------------------------------


def test_three_shifts_then_two_days_off_passes() -> None:
    roster = [_on(USER, d, DAY) for d in (5, 6, 7, 10, 11, 12, 15, 16, 17)]
    rules = RosterRules(max_consecutive_shifts=3, min_days_off_after_run=2)
    assert check_roster_rules(roster, rules) == []


def test_fourth_consecutive_shift_is_one_violation() -> None:
    roster = [_on(USER, day, DAY) for day in range(5, 9)]
    [violation] = check_roster_rules(roster, RosterRules(max_consecutive_shifts=3))
    assert violation.code == RuleCode.MAX_CONSECUTIVE_DAYS
    assert (violation.start_date, violation.end_date) == (_d(5), _d(8))
    assert violation.observed == Decimal(4)


def test_one_day_off_after_three_shifts_is_flagged() -> None:
    roster = [_on(USER, d, DAY) for d in (5, 6, 7, 9)]
    rules = RosterRules(max_consecutive_shifts=3, min_days_off_after_run=2)
    [violation] = check_roster_rules(roster, rules)
    assert violation.code == RuleCode.DAYS_OFF_AFTER_RUN
    assert (violation.start_date, violation.end_date) == (_d(8), _d(8))
    assert violation.observed == Decimal(1)
    assert violation.limit == Decimal(2)


def test_short_run_does_not_owe_two_days_off() -> None:
    # Two shifts, one day off, two shifts: no run reached three.
    roster = [_on(USER, d, DAY) for d in (5, 6, 8, 9)]
    rules = RosterRules(max_consecutive_shifts=3, min_days_off_after_run=2)
    assert check_roster_rules(roster, rules) == []


def test_overnight_shift_leaves_the_next_day_off() -> None:
    # M, E, N then two days off: N ends at 06:00 on the 8th, which is still off.
    roster = [
        _on(USER, 5, MORNING),
        _on(USER, 6, EVENING),
        _on(USER, 7, NIGHT),
        _on(USER, 10, MORNING),
    ]
    rules = RosterRules(max_consecutive_shifts=3, min_days_off_after_run=2)
    assert check_roster_rules(roster, rules) == []


def test_run_across_a_month_boundary_is_one_run() -> None:
    roster = [_on(USER, day, DAY) for day in _days(_d(30, 9), 4)]  # 30 Sep - 3 Oct
    [violation] = check_roster_rules(roster, RosterRules(max_consecutive_shifts=3))
    assert (violation.start_date, violation.end_date) == (_d(30, 9), _d(3))


def test_weekdays_pattern_skips_consecutive_and_flags_weekends() -> None:
    # Monday 5 to Friday 9 is five in a row: fine for a Monday-to-Friday pattern.
    weekdays = [_on(USER, day, DAY) for day in range(5, 10)]
    rules = RosterRules(
        work_pattern=WorkPattern.WEEKDAYS,
        max_consecutive_shifts=3,
        min_days_off_after_run=2,
    )
    assert check_roster_rules(weekdays, rules) == []
    [violation] = check_roster_rules([*weekdays, _on(USER, 10, DAY)], rules)
    assert violation.code == RuleCode.WEEKDAY_PATTERN
    assert violation.start_date == _d(10)
    assert "Saturday" in violation.detail


# --- rule 2: daily and weekly hours ----------------------------------------


def test_daily_limit_flags_long_shifts_only() -> None:
    roster = [_on(USER, 5, DAY), _on(USER, 6, MORNING)]
    [violation] = check_roster_rules(roster, RosterRules(shift_daily_hours=Decimal(8)))
    assert violation.code == RuleCode.MAX_DAILY_HOURS
    assert violation.start_date == _d(6)
    assert violation.observed == Decimal("8.50")


def test_overnight_hours_count_on_the_start_date() -> None:
    [violation] = check_roster_rules(
        [_on(USER, 7, NIGHT)], RosterRules(shift_daily_hours=Decimal(7))
    )
    assert violation.start_date == _d(7)


def test_worked_hours_replace_the_catalogue_duration() -> None:
    roster = [RosterShift(USER, _d(5), DAY, worked_hours=Decimal(11))]
    [violation] = check_roster_rules(roster, RosterRules(shift_daily_hours=Decimal(8)))
    assert violation.observed == Decimal(11)


def test_weekly_hours_use_sunday_to_saturday_by_start_date() -> None:
    assert week_start(_d(10)) == _d(4)  # Saturday -> the Sunday before
    assert week_start(_d(4)) == _d(4)
    # Sun 4 to Thu 8: five D shifts (40 h) pass; a Saturday night N tips it over.
    roster = [_on(USER, day, DAY) for day in range(4, 9)]
    rules = RosterRules(shift_weekly_hours=Decimal(40))
    assert check_roster_rules(roster, rules) == []
    [violation] = check_roster_rules([*roster, _on(USER, 10, NIGHT)], rules)
    assert violation.code == RuleCode.MAX_WEEKLY_HOURS
    assert (violation.start_date, violation.end_date) == (_d(4), _d(10))
    assert violation.observed == Decimal("47.50")


def test_week_boundary_splits_hours() -> None:
    # Thu 8 - Sat 10 (24 h) and Sun 11 - Mon 12 (16 h): neither week over 32 h.
    roster = [_on(USER, day, DAY) for day in range(8, 13)]
    assert check_roster_rules(roster, RosterRules(shift_weekly_hours=Decimal(32))) == []


def test_week_crossing_a_month_boundary_counts_both_months() -> None:
    # Sunday 27 Sep to Friday 2 Oct: six D shifts in one week.
    roster = [_on(USER, day, DAY) for day in _days(_d(27, 9), 6)]
    [violation] = check_roster_rules(
        roster, RosterRules(shift_weekly_hours=Decimal(40))
    )
    assert (violation.start_date, violation.end_date) == (_d(27, 9), _d(3))


def test_non_shift_workers_use_35_hours_and_weekdays() -> None:
    rules = RosterRules(
        shift_weekly_hours=Decimal(40),
        non_shift_weekly_hours=Decimal(35),
        shift_daily_hours=Decimal(8),
    )
    profiles = {USER: EmployeeRuleProfile(worker_type=WorkerType.NON_SHIFT)}
    week = [_on(USER, day, DAY) for day in range(5, 10)]  # 40 h Mon-Fri
    found = check_roster_rules(week, rules, profiles)
    assert _codes(found) == ["MAX_WEEKLY_HOURS"]
    assert found[0].limit == Decimal(35)
    seven_hour_week = [_on(USER, day, SEVEN) for day in range(5, 10)]
    assert check_roster_rules(seven_hour_week, rules, profiles) == []
    # No daily limit by default; a Sunday shift breaks the weekday pattern.
    found = check_roster_rules(
        [*seven_hour_week, _on(USER, 11, SEVEN)], rules, profiles
    )
    assert "WEEKDAY_PATTERN" in _codes(found)


def test_department_worker_type_applies_without_a_profile() -> None:
    rules = RosterRules(
        worker_type=WorkerType.NON_SHIFT, non_shift_weekly_hours=Decimal(35)
    )
    week = [_on(USER, day, DAY) for day in range(5, 10)]
    assert _codes(check_roster_rules(week, rules)) == ["MAX_WEEKLY_HOURS"]


# --- rule 3: weekends -------------------------------------------------------

_COVERAGE = (_d(1), _d(26))  # weekends 3-4, 10-11, 17-18, 24-25
_WEEKENDS = RosterRules(weekend_window_weeks=4)


def _worked(days: Iterable[int | date]) -> list[RosterShift]:
    return [_on(USER, day, DAY) for day in days]


def test_full_weekend_plus_saturday_and_sunday_passes() -> None:
    # Off: weekend 3-4 fully; Saturday 10 and Sunday 25.
    found = check_roster_rules(_worked([11, 17, 18, 24]), _WEEKENDS, coverage=_COVERAGE)
    assert found == []


def test_two_full_weekends_off_pass() -> None:
    found = check_roster_rules(_worked([10, 11, 17, 18]), _WEEKENDS, coverage=_COVERAGE)
    assert found == []


def test_no_full_weekend_off_is_flagged() -> None:
    [violation] = check_roster_rules(
        _worked([3, 11, 17, 25]), _WEEKENDS, coverage=_COVERAGE
    )
    assert violation.code == RuleCode.WEEKEND_OFF
    assert (violation.start_date, violation.end_date) == (_d(3), _d(25))
    assert violation.observed == Decimal(0)


def test_full_weekend_without_another_sunday_is_flagged() -> None:
    # Weekend 3-4 off and Saturday 10 off, but every other Sunday is worked.
    [violation] = check_roster_rules(
        _worked([11, 17, 18, 25]), _WEEKENDS, coverage=_COVERAGE
    )
    assert violation.code == RuleCode.WEEKEND_OFF
    assert violation.observed == Decimal(1)


def test_weekend_windows_roll_and_merge() -> None:
    # Five weekends (3 Oct to 1 Nov), every one worked: the two failing
    # four-weekend windows merge into one warning.
    worked: list[int | date] = [3, 4, 10, 11, 17, 18, 24, 25, 31, _d(1, 11)]
    [violation] = check_roster_rules(
        _worked(worked), _WEEKENDS, coverage=(_d(1), _d(1, 11))
    )
    assert (violation.start_date, violation.end_date) == (_d(3), _d(1, 11))


def test_weekend_window_needs_loaded_data() -> None:
    # Only three weekends are inside the coverage: no window can be judged.
    found = check_roster_rules(
        _worked([3, 4, 10, 11, 17, 18]), _WEEKENDS, coverage=(_d(1), _d(19))
    )
    assert found == []


def test_saturday_night_shift_does_not_take_sunday() -> None:
    # N on Saturday 3 ends Sunday 4 at 06:00; Sunday 4 still counts as off.
    roster = [_on(USER, 3, NIGHT), *_worked([11, 17, 18])]
    assert check_roster_rules(roster, _WEEKENDS, coverage=_COVERAGE) == []


# --- rule 4: notice ---------------------------------------------------------


def test_short_notice_flags_changes_inside_seven_days() -> None:
    changed = [(USER, _d(5)), (USER, _d(11)), (USER, _d(12)), (USER, _d(4))]
    found = check_notice(changed, today=_d(5), rules=RosterRules(notice_days=7))
    assert [(v.start_date, v.observed) for v in found] == [
        (_d(5), Decimal(0)),
        (_d(11), Decimal(6)),
    ]
    assert all(v.code == RuleCode.SHORT_NOTICE for v in found)


def test_notice_across_a_month_boundary() -> None:
    found = check_notice(
        [(USER, _d(2, 11))], today=_d(28), rules=RosterRules(notice_days=7)
    )
    assert [v.observed for v in found] == [Decimal(5)]


def test_notice_disabled_reports_nothing() -> None:
    assert check_notice([(USER, _d(5))], today=_d(5), rules=RosterRules()) == []


# --- rule 7: coverage -------------------------------------------------------


def test_uncovered_staff_are_never_checked() -> None:
    roster = [_on(USER, day, MORNING) for day in range(3, 26)]
    profiles = {USER: EmployeeRuleProfile(covered=False)}
    assert check_roster_rules(roster, DEFAULT_RULES, profiles, _COVERAGE) == []
    found = check_notice(
        [(USER, _d(5))], today=_d(5), rules=DEFAULT_RULES, profiles=profiles
    )
    assert found == []


def test_employees_are_checked_independently() -> None:
    roster = [_on(USER, day, DAY) for day in range(5, 9)] + [
        _on(OTHER, day, DAY) for day in range(5, 8)
    ]
    found = check_roster_rules(roster, RosterRules(max_consecutive_shifts=3))
    assert [v.user_id for v in found] == [USER]


# --- helpers ----------------------------------------------------------------


def test_introduced_ignores_existing_breaches() -> None:
    rules = RosterRules(max_consecutive_shifts=3, shift_daily_hours=Decimal(8))
    base = [_on(USER, d, DAY) for d in range(5, 9)]
    before = check_roster_rules(base, rules)
    after = check_roster_rules([*base, _on(USER, 12, MORNING)], rules)
    assert _codes(introduced(before, after)) == ["MAX_DAILY_HOURS"]


@pytest.mark.parametrize(
    "build",
    [
        lambda: RosterRules(max_consecutive_shifts=0),
        lambda: RosterRules(min_days_off_after_run=0),
        lambda: RosterRules(weekend_window_weeks=0),
        lambda: RosterRules(notice_days=-1),
        lambda: RosterRules(shift_weekly_hours=Decimal(0)),
        lambda: RosterRules(non_shift_daily_hours=Decimal(-1)),
    ],
)
def test_invalid_limits_are_rejected(build: Callable[[], RosterRules]) -> None:
    with pytest.raises(ValueError):
        build()


def test_window_padding_covers_weekend_windows() -> None:
    assert DEFAULT_RULES.window_padding() == timedelta(days=28)
    assert RosterRules().window_padding() == timedelta(days=7)
