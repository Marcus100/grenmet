"""Roster rule checks: minimum rest, consecutive days and weekly hours.

Pure functions over rostered shifts, with no database access, so every path that
changes a roster (publish, swap, leave, overtime) can call the same checker. A rule
whose limit is None is disabled; this module carries no default limits because the
GAA values are not yet confirmed by HR (docs/hr/product-roadmap.md, Phase 1).
Shift times always come from ``expansion.expand_shift``. Reporting weeks run
Sunday to Saturday and a shift belongs to the week of its start date.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from enum import Enum
from uuid import UUID

from .expansion import expand_shift, shift_hours
from .models import ShiftCatalog

_SECONDS_PER_HOUR = Decimal(3600)


class RuleCode(str, Enum):
    MIN_REST = "MIN_REST"
    MAX_CONSECUTIVE_DAYS = "MAX_CONSECUTIVE_DAYS"
    MAX_WEEKLY_HOURS = "MAX_WEEKLY_HOURS"


@dataclass(frozen=True)
class RosterRules:
    """Limits to enforce. None disables a rule."""

    min_rest_hours: Decimal | None = None
    max_consecutive_days: int | None = None
    max_weekly_hours: Decimal | None = None

    def __post_init__(self) -> None:
        if self.min_rest_hours is not None and self.min_rest_hours < 0:
            raise ValueError("min_rest_hours must not be negative")
        if self.max_consecutive_days is not None and self.max_consecutive_days < 1:
            raise ValueError("max_consecutive_days must be at least 1")
        if self.max_weekly_hours is not None and self.max_weekly_hours <= 0:
            raise ValueError("max_weekly_hours must be positive")


@dataclass(frozen=True)
class RosterShift:
    user_id: UUID
    assignment_date: date
    shift: ShiftCatalog


@dataclass(frozen=True)
class RuleViolation:
    code: RuleCode
    user_id: UUID
    start_date: date
    end_date: date
    observed: Decimal
    limit: Decimal
    detail: str


def week_start(day: date) -> date:
    """Sunday on or before ``day`` (GAA reporting weeks run Sunday to Saturday)."""
    return day - timedelta(days=(day.weekday() + 1) % 7)


def _worked(roster_shifts: Sequence[RosterShift]) -> dict[UUID, list[RosterShift]]:
    by_user: dict[UUID, list[RosterShift]] = defaultdict(list)
    for item in roster_shifts:
        if item.shift.counts_as_work_hours and shift_hours(item.shift) is not None:
            by_user[item.user_id].append(item)
    return by_user


def _check_rest(
    user_id: UUID, items: list[RosterShift], limit: Decimal
) -> list[RuleViolation]:
    intervals = sorted(
        interval
        for item in items
        if (interval := expand_shift(item.assignment_date, item.shift)) is not None
    )
    found: list[RuleViolation] = []
    for (_, prev_end), (next_start, _) in zip(intervals, intervals[1:], strict=False):
        rest = Decimal((next_start - prev_end).total_seconds()) / _SECONDS_PER_HOUR
        if rest < limit:
            found.append(
                RuleViolation(
                    code=RuleCode.MIN_REST,
                    user_id=user_id,
                    start_date=prev_end.date(),
                    end_date=next_start.date(),
                    observed=rest.quantize(Decimal("0.01")),
                    limit=limit,
                    detail=f"{rest:.2f} h rest between shifts; minimum is {limit} h",
                )
            )
    return found


def _check_consecutive(
    user_id: UUID, items: list[RosterShift], limit: int
) -> list[RuleViolation]:
    days = sorted({item.assignment_date for item in items})
    found: list[RuleViolation] = []
    run_start = previous = None
    for day in [*days, None]:
        if run_start is not None and previous is not None:
            consecutive = day is not None and day == previous + timedelta(days=1)
            if not consecutive:
                length = (previous - run_start).days + 1
                if length > limit:
                    found.append(
                        RuleViolation(
                            code=RuleCode.MAX_CONSECUTIVE_DAYS,
                            user_id=user_id,
                            start_date=run_start,
                            end_date=previous,
                            observed=Decimal(length),
                            limit=Decimal(limit),
                            detail=f"{length} consecutive working days; maximum is {limit}",
                        )
                    )
                run_start = day
        elif day is not None:
            run_start = day
        previous = day
    return found


def _check_weekly(
    user_id: UUID, items: list[RosterShift], limit: Decimal
) -> list[RuleViolation]:
    totals: dict[date, Decimal] = defaultdict(Decimal)
    for item in items:
        hours = shift_hours(item.shift)
        if hours is not None:
            totals[week_start(item.assignment_date)] += hours
    return [
        RuleViolation(
            code=RuleCode.MAX_WEEKLY_HOURS,
            user_id=user_id,
            start_date=start,
            end_date=start + timedelta(days=6),
            observed=total,
            limit=limit,
            detail=f"{total} h rostered in the week; maximum is {limit} h",
        )
        for start, total in sorted(totals.items())
        if total > limit
    ]


def check_roster_rules(
    roster_shifts: Sequence[RosterShift], rules: RosterRules
) -> list[RuleViolation]:
    """Violations of the enabled rules, ordered by employee, rule and date.

    Only shifts with clock times that count as work hours are considered; leave,
    off and sick codes neither add hours nor break a rest gap or a working run.
    """
    found: list[RuleViolation] = []
    for user_id, items in _worked(roster_shifts).items():
        if rules.min_rest_hours is not None:
            found += _check_rest(user_id, items, rules.min_rest_hours)
        if rules.max_consecutive_days is not None:
            found += _check_consecutive(user_id, items, rules.max_consecutive_days)
        if rules.max_weekly_hours is not None:
            found += _check_weekly(user_id, items, rules.max_weekly_hours)
    return sorted(
        found, key=lambda v: (str(v.user_id), v.code.value, v.start_date, v.end_date)
    )
