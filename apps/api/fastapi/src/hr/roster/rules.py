"""Roster rule checks (#380): consecutive shifts, days off, hours, weekends, notice.

Pure functions over worked shifts, with no database access, so every path that
changes a roster (publish, published-roster edits, swaps, leave, absence and
overtime) calls the same checker. A rule whose limit is None is disabled. The
built-in defaults (``DEFAULT_RULES``) are the confirmed GAA values; organisations
and departments hold their own copy as data (``RosterRuleSet``).

Conventions, shared with the rest of the roster module:
- A shift belongs to the date it starts (``expansion.expand_shift``); an overnight
  shift that ends the next morning leaves that next day free for these rules.
- A day is "off" when no worked shift starts on it. Leave, off and sick codes, and
  shifts covered by approved leave or a full-day absence, are not worked.
- Weeks run Sunday to Saturday. A weekend is a Saturday and the following Sunday.
- Rotation (shift) workers get the consecutive-shift and days-off rules. Staff on
  a Monday-to-Friday pattern (a WEEKDAYS department or non-shift staff) instead
  get a warning for any weekend shift.
- Staff not covered by the union agreement are never checked.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, time, timedelta
from decimal import Decimal
from enum import Enum
from uuid import UUID

from .expansion import shift_hours, worked_shift_hours
from .models import ShiftCatalog, WorkerType, WorkPattern

_SATURDAY = 5
_SUNDAY = 6


class RuleCode(str, Enum):
    MAX_CONSECUTIVE_DAYS = "MAX_CONSECUTIVE_DAYS"
    DAYS_OFF_AFTER_RUN = "DAYS_OFF_AFTER_RUN"
    MAX_DAILY_HOURS = "MAX_DAILY_HOURS"
    MAX_WEEKLY_HOURS = "MAX_WEEKLY_HOURS"
    WEEKEND_OFF = "WEEKEND_OFF"
    WEEKDAY_PATTERN = "WEEKDAY_PATTERN"
    SHORT_NOTICE = "SHORT_NOTICE"


@dataclass(frozen=True)
class OvertimeBandRules:
    """Overtime rate bands (rule 5). Hours only: no pay is calculated."""

    weekday_first_hours: Decimal = Decimal(4)
    weekday_first_rate: Decimal = Decimal("1.5")
    weekday_after_rate: Decimal = Decimal(2)
    saturday_window_start: time = time(8, 0)
    saturday_window_end: time = time(12, 0)
    saturday_window_rate: Decimal = Decimal("1.5")
    saturday_after_rate: Decimal = Decimal(2)
    rest_day_first_hours: Decimal = Decimal(8)
    rest_day_first_rate: Decimal = Decimal(2)
    rest_day_after_rate: Decimal = Decimal(3)
    after_midnight_rate: Decimal = Decimal(2)


@dataclass(frozen=True)
class RosterRules:
    """Limits to enforce. None disables a rule."""

    work_pattern: WorkPattern = WorkPattern.ROTATION
    worker_type: WorkerType = WorkerType.SHIFT
    max_consecutive_shifts: int | None = None
    min_days_off_after_run: int | None = None
    shift_daily_hours: Decimal | None = None
    shift_weekly_hours: Decimal | None = None
    non_shift_daily_hours: Decimal | None = None
    non_shift_weekly_hours: Decimal | None = None
    weekend_window_weeks: int | None = None
    notice_days: int | None = None
    overtime: OvertimeBandRules | None = None

    def __post_init__(self) -> None:
        for name in (
            "max_consecutive_shifts",
            "min_days_off_after_run",
            "weekend_window_weeks",
        ):
            value = getattr(self, name)
            if value is not None and value < 1:
                raise ValueError(f"{name} must be at least 1")
        if self.notice_days is not None and self.notice_days < 0:
            raise ValueError("notice_days must not be negative")
        for name in (
            "shift_daily_hours",
            "shift_weekly_hours",
            "non_shift_daily_hours",
            "non_shift_weekly_hours",
        ):
            value = getattr(self, name)
            if value is not None and value <= 0:
                raise ValueError(f"{name} must be positive")

    @property
    def checks_roster(self) -> bool:
        """True when any rule that looks at the schedule is enabled."""
        return any(
            value is not None
            for value in (
                self.max_consecutive_shifts,
                self.shift_daily_hours,
                self.shift_weekly_hours,
                self.non_shift_daily_hours,
                self.non_shift_weekly_hours,
                self.weekend_window_weeks,
            )
        ) or (self.work_pattern == WorkPattern.WEEKDAYS)

    def window_padding(self) -> timedelta:
        """Days to load either side of a checked range so runs, weeks and weekend
        windows that cross its edge are seen."""
        run = (self.max_consecutive_shifts or 0) + (self.min_days_off_after_run or 0)
        weekends = 7 * (self.weekend_window_weeks or 0)
        return timedelta(days=max(7, run + 1, weekends))


#: Confirmed GAA defaults (owner, 2026-10-31). Every rule is on.
DEFAULT_RULES = RosterRules(
    work_pattern=WorkPattern.ROTATION,
    worker_type=WorkerType.SHIFT,
    max_consecutive_shifts=3,
    min_days_off_after_run=2,
    shift_daily_hours=Decimal(8),
    shift_weekly_hours=Decimal(40),
    non_shift_daily_hours=None,
    non_shift_weekly_hours=Decimal(35),
    weekend_window_weeks=4,
    notice_days=7,
    overtime=OvertimeBandRules(),
)


@dataclass(frozen=True)
class EmployeeRuleProfile:
    """Per-employee rule settings: union coverage and an optional worker type."""

    covered: bool = True
    worker_type: WorkerType | None = None


@dataclass(frozen=True)
class RosterShift:
    user_id: UUID
    assignment_date: date
    shift: ShiftCatalog
    #: Hours actually worked (attendance or timesheet overtime); None means the
    #: catalogue span minus its unpaid break.
    worked_hours: Decimal | None = None

    @property
    def hours(self) -> Decimal | None:
        if self.worked_hours is not None:
            return self.worked_hours
        return worked_shift_hours(self.shift)

    @property
    def is_worked(self) -> bool:
        return self.shift.counts_as_work_hours and shift_hours(self.shift) is not None


@dataclass(frozen=True)
class RuleViolation:
    code: RuleCode
    user_id: UUID
    start_date: date
    end_date: date
    observed: Decimal
    limit: Decimal
    detail: str

    def key(self) -> tuple[str, str, str, str]:
        return (
            self.code.value,
            str(self.user_id),
            self.start_date.isoformat(),
            self.end_date.isoformat(),
        )


@dataclass(frozen=True)
class _Plan:
    """The rules that apply to one employee."""

    rotation: bool
    daily: Decimal | None
    weekly: Decimal | None


def week_start(day: date) -> date:
    """Sunday on or before ``day`` (GAA reporting weeks run Sunday to Saturday)."""
    return day - timedelta(days=(day.weekday() + 1) % 7)


def worker_type_for(rules: RosterRules, profile: EmployeeRuleProfile) -> WorkerType:
    return profile.worker_type or rules.worker_type


def _plan(rules: RosterRules, profile: EmployeeRuleProfile) -> _Plan:
    shift_worker = worker_type_for(rules, profile) == WorkerType.SHIFT
    return _Plan(
        rotation=shift_worker and rules.work_pattern == WorkPattern.ROTATION,
        daily=rules.shift_daily_hours if shift_worker else rules.non_shift_daily_hours,
        weekly=(
            rules.shift_weekly_hours if shift_worker else rules.non_shift_weekly_hours
        ),
    )


def _runs(days: Sequence[date]) -> list[tuple[date, date]]:
    """Maximal runs of consecutive dates in sorted ``days``."""
    runs: list[tuple[date, date]] = []
    for day in days:
        if runs and day == runs[-1][1] + timedelta(days=1):
            runs[-1] = (runs[-1][0], day)
        else:
            runs.append((day, day))
    return runs


def _check_consecutive(
    user_id: UUID, days: Sequence[date], limit: int, days_off: int | None
) -> list[RuleViolation]:
    found: list[RuleViolation] = []
    runs = _runs(days)
    for index, (start, end) in enumerate(runs):
        length = (end - start).days + 1
        if length > limit:
            found.append(
                RuleViolation(
                    code=RuleCode.MAX_CONSECUTIVE_DAYS,
                    user_id=user_id,
                    start_date=start,
                    end_date=end,
                    observed=Decimal(length),
                    limit=Decimal(limit),
                    detail=f"{length} consecutive shifts; maximum is {limit}",
                )
            )
        # Days off are owed once a run reaches the maximum (rule 1).
        if days_off is None or length < limit or index + 1 >= len(runs):
            continue
        next_start = runs[index + 1][0]
        gap = (next_start - end).days - 1
        if gap < days_off:
            found.append(
                RuleViolation(
                    code=RuleCode.DAYS_OFF_AFTER_RUN,
                    user_id=user_id,
                    start_date=end + timedelta(days=1),
                    end_date=next_start - timedelta(days=1),
                    observed=Decimal(gap),
                    limit=Decimal(days_off),
                    detail=(
                        f"{gap} day{'s' if gap != 1 else ''} off after {length} "
                        f"consecutive shifts; at least {days_off} required"
                    ),
                )
            )
    return found


def _check_daily(
    user_id: UUID, items: Sequence[RosterShift], limit: Decimal
) -> list[RuleViolation]:
    totals: dict[date, Decimal] = defaultdict(Decimal)
    for item in items:
        totals[item.assignment_date] += item.hours or Decimal(0)
    return [
        RuleViolation(
            code=RuleCode.MAX_DAILY_HOURS,
            user_id=user_id,
            start_date=day,
            end_date=day,
            observed=total,
            limit=limit,
            detail=f"{total} h on the day; maximum is {limit} h",
        )
        for day, total in sorted(totals.items())
        if total > limit
    ]


def _check_weekly(
    user_id: UUID, items: Sequence[RosterShift], limit: Decimal
) -> list[RuleViolation]:
    totals: dict[date, Decimal] = defaultdict(Decimal)
    for item in items:
        totals[week_start(item.assignment_date)] += item.hours or Decimal(0)
    return [
        RuleViolation(
            code=RuleCode.MAX_WEEKLY_HOURS,
            user_id=user_id,
            start_date=start,
            end_date=start + timedelta(days=6),
            observed=total,
            limit=limit,
            detail=f"{total} h in the week (Sunday to Saturday); maximum is {limit} h",
        )
        for start, total in sorted(totals.items())
        if total > limit
    ]


def _check_weekday_pattern(
    user_id: UUID, items: Sequence[RosterShift]
) -> list[RuleViolation]:
    found = []
    for item in sorted(items, key=lambda i: i.assignment_date):
        weekday = item.assignment_date.weekday()
        if weekday not in (_SATURDAY, _SUNDAY):
            continue
        day_name = "Saturday" if weekday == _SATURDAY else "Sunday"
        found.append(
            RuleViolation(
                code=RuleCode.WEEKDAY_PATTERN,
                user_id=user_id,
                start_date=item.assignment_date,
                end_date=item.assignment_date,
                observed=item.hours or Decimal(0),
                limit=Decimal(0),
                detail=(
                    f"{item.shift.code} shift on a {day_name}; "
                    "this employee works Monday to Friday"
                ),
            )
        )
    return found


def _check_weekends(
    user_id: UUID,
    worked: set[date],
    weeks: int,
    coverage: tuple[date, date],
) -> list[RuleViolation]:
    """Rule 3: in every run of ``weeks`` consecutive weekends, one full weekend
    off plus at least one other Saturday and one other Sunday off."""
    first, last = coverage
    saturday = first + timedelta(days=(_SATURDAY - first.weekday()) % 7)
    weekends: list[date] = []
    while saturday + timedelta(days=1) <= last:
        weekends.append(saturday)
        saturday += timedelta(days=7)
    failing: list[tuple[date, date, int]] = []
    for index in range(len(weekends) - weeks + 1):
        window = weekends[index : index + weeks]
        sat_off = {s for s in window if s not in worked}
        sun_off = {s for s in window if s + timedelta(days=1) not in worked}
        full = sat_off & sun_off
        satisfied = any((sat_off - {f}) and (sun_off - {f}) for f in full)
        if not satisfied:
            failing.append((window[0], window[-1] + timedelta(days=1), len(full)))
    merged: list[tuple[date, date, int]] = []
    for start, end, full_count in failing:
        if merged and start <= merged[-1][1]:
            prev = merged[-1]
            merged[-1] = (prev[0], end, min(prev[2], full_count))
        else:
            merged.append((start, end, full_count))
    return [
        RuleViolation(
            code=RuleCode.WEEKEND_OFF,
            user_id=user_id,
            start_date=start,
            end_date=end,
            observed=Decimal(full_count),
            limit=Decimal(1),
            detail=(
                f"In {weeks} weekends: needs one full weekend off plus one other "
                "Saturday and one other Sunday off"
            ),
        )
        for start, end, full_count in merged
    ]


def check_roster_rules(
    roster_shifts: Sequence[RosterShift],
    rules: RosterRules,
    profiles: Mapping[UUID, EmployeeRuleProfile] | None = None,
    coverage: tuple[date, date] | None = None,
) -> list[RuleViolation]:
    """Violations of the enabled rules, ordered by employee, rule and date.

    ``profiles`` gives each employee's coverage and worker type; an employee who
    is missing from it is treated as covered with the department worker type.
    ``coverage`` is the date range the shifts were loaded for: weekend windows are
    only judged inside it, so a window with no loaded data is not blamed.
    """
    profiles = profiles or {}
    by_user: dict[UUID, list[RosterShift]] = defaultdict(list)
    for item in roster_shifts:
        if item.is_worked:
            by_user[item.user_id].append(item)
    if coverage is None and roster_shifts:
        dates = [item.assignment_date for item in roster_shifts]
        coverage = (min(dates), max(dates))
    found: list[RuleViolation] = []
    for user_id, items in by_user.items():
        profile = profiles.get(user_id, EmployeeRuleProfile())
        if not profile.covered:
            continue
        plan = _plan(rules, profile)
        days = sorted({item.assignment_date for item in items})
        if plan.rotation:
            if rules.max_consecutive_shifts is not None:
                found += _check_consecutive(
                    user_id,
                    days,
                    rules.max_consecutive_shifts,
                    rules.min_days_off_after_run,
                )
        else:
            found += _check_weekday_pattern(user_id, items)
        if plan.daily is not None:
            found += _check_daily(user_id, items, plan.daily)
        if plan.weekly is not None:
            found += _check_weekly(user_id, items, plan.weekly)
        if rules.weekend_window_weeks is not None and coverage is not None:
            found += _check_weekends(
                user_id, set(days), rules.weekend_window_weeks, coverage
            )
    return sorted(
        found, key=lambda v: (str(v.user_id), v.code.value, v.start_date, v.end_date)
    )


def check_notice(
    changed: Iterable[tuple[UUID, date]],
    *,
    today: date,
    rules: RosterRules,
    profiles: Mapping[UUID, EmployeeRuleProfile] | None = None,
) -> list[RuleViolation]:
    """Rule 4: a change to a published roster for a date less than ``notice_days``
    away. Past dates are corrections, not notice, and are not warned."""
    if rules.notice_days is None:
        return []
    profiles = profiles or {}
    limit = rules.notice_days
    found = []
    for user_id, day in sorted(set(changed), key=lambda c: (str(c[0]), c[1])):
        if not profiles.get(user_id, EmployeeRuleProfile()).covered:
            continue
        notice = (day - today).days
        if 0 <= notice < limit:
            found.append(
                RuleViolation(
                    code=RuleCode.SHORT_NOTICE,
                    user_id=user_id,
                    start_date=day,
                    end_date=day,
                    observed=Decimal(notice),
                    limit=Decimal(limit),
                    detail=(
                        f"Published roster changed with {notice} day"
                        f"{'s' if notice != 1 else ''} notice; {limit} required"
                    ),
                )
            )
    return found


def introduced(
    before: Sequence[RuleViolation], after: Sequence[RuleViolation]
) -> list[RuleViolation]:
    """Violations in ``after`` that ``before`` did not already have, so a
    pre-existing breach is not blamed on the change being checked."""
    existing = {v.key() for v in before}
    return [v for v in after if v.key() not in existing]


def with_worked_hours(item: RosterShift, hours: Decimal) -> RosterShift:
    return replace(item, worked_hours=hours)
