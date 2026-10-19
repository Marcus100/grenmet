"""Open booking slots: a pure function, no database access.

Rules (ADR-0024, a clean-room port of the working-plan model used by
Easy!Appointments; no code is copied):

- A provider works in one or more periods per weekday (local wall clock). Gaps
  between periods are breaks.
- ``extra_hours`` exceptions add working time; ``time_off`` exceptions remove it.
- A slot starts on the profile's step, counted from local midnight, and the whole
  service (``duration``) must fit inside one working window.
- A booking blocks ``[start - buffer_before, end + buffer_after)``. A new slot is
  open only if its own blocked range overlaps no existing blocked range: the
  same rule the database exclusion constraint enforces.
- Slots start no earlier than ``now + lead_time`` and no later than
  ``now + horizon``.

All datetimes in and out are naive UTC; ``tz`` is the organisation's zone.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from src.utils.timezones import local_to_utc

Interval = tuple[datetime, datetime]


@dataclass(frozen=True)
class WorkingPeriod:
    weekday: int  # Monday = 0
    start: time
    end: time


@dataclass(frozen=True)
class ScheduleException:
    starts_at: datetime
    ends_at: datetime
    kind: str  # "time_off" | "extra_hours"


@dataclass(frozen=True)
class ProviderCalendar:
    provider_id: str
    periods: Sequence[WorkingPeriod]
    exceptions: Sequence[ScheduleException] = ()
    busy: Sequence[Interval] = ()  # existing blocked ranges, buffers included


@dataclass(frozen=True)
class SlotRules:
    duration: timedelta
    step: timedelta
    buffer_before: timedelta = timedelta(0)
    buffer_after: timedelta = timedelta(0)
    lead_time: timedelta = timedelta(0)
    horizon: timedelta = timedelta(days=60)


@dataclass
class Slot:
    starts_at: datetime
    ends_at: datetime
    provider_ids: list[str] = field(default_factory=list)


def merge(intervals: Iterable[Interval]) -> list[Interval]:
    """Sorted, non-overlapping union; touching intervals join."""
    result: list[Interval] = []
    for start, end in sorted(i for i in intervals if i[1] > i[0]):
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def subtract(windows: Sequence[Interval], cuts: Iterable[Interval]) -> list[Interval]:
    """``windows`` minus every cut."""
    remaining = list(windows)
    for cut_start, cut_end in merge(cuts):
        next_round: list[Interval] = []
        for start, end in remaining:
            if cut_end <= start or cut_start >= end:
                next_round.append((start, end))
                continue
            if start < cut_start:
                next_round.append((start, cut_start))
            if cut_end < end:
                next_round.append((cut_end, end))
        remaining = next_round
    return remaining


def blocked_range(starts_at: datetime, ends_at: datetime, rules: SlotRules) -> Interval:
    return (starts_at - rules.buffer_before, ends_at + rules.buffer_after)


def _overlaps(interval: Interval, others: Sequence[Interval]) -> bool:
    return any(interval[0] < end and start < interval[1] for start, end in others)


def working_windows(
    calendar: ProviderCalendar, day: date, tz: ZoneInfo
) -> list[Interval]:
    """The provider's working time on one local date, as naive-UTC intervals."""
    windows = [
        (local_to_utc(day, period.start, tz), local_to_utc(day, period.end, tz))
        for period in calendar.periods
        if period.weekday == day.weekday()
    ]
    day_start = local_to_utc(day, time(0), tz)
    day_end = local_to_utc(day + timedelta(days=1), time(0), tz)
    extra = [
        (max(e.starts_at, day_start), min(e.ends_at, day_end))
        for e in calendar.exceptions
        if e.kind == "extra_hours"
    ]
    time_off = [
        (e.starts_at, e.ends_at) for e in calendar.exceptions if e.kind == "time_off"
    ]
    return subtract(merge([*windows, *extra]), time_off)


def provider_slots(
    calendar: ProviderCalendar,
    rules: SlotRules,
    *,
    day: date,
    tz: ZoneInfo,
    now: datetime,
) -> list[Interval]:
    """Open ``(start, end)`` slots for one provider on one local date."""
    earliest = now + rules.lead_time
    latest = now + rules.horizon
    midnight = local_to_utc(day, time(0), tz)
    busy = merge(calendar.busy)
    slots: list[Interval] = []
    for window_start, window_end in working_windows(calendar, day, tz):
        # Align to the step grid counted from local midnight.
        offset = (window_start - midnight) % rules.step
        start = window_start if not offset else window_start + (rules.step - offset)
        while start + rules.duration <= window_end:
            end = start + rules.duration
            if earliest <= start <= latest and not _overlaps(
                blocked_range(start, end, rules), busy
            ):
                slots.append((start, end))
            start += rules.step
    return slots


def open_slots(
    calendars: Sequence[ProviderCalendar],
    rules: SlotRules,
    *,
    first_day: date,
    last_day: date,
    tz: ZoneInfo,
    now: datetime,
) -> list[Slot]:
    """Open slots across providers for local dates ``first_day..last_day``.

    Each slot lists every provider who can take it, so "any provider" bookings
    can pick one and a named-provider page can filter.
    """
    by_start: dict[datetime, Slot] = {}
    day = first_day
    while day <= last_day:
        for calendar in calendars:
            for start, end in provider_slots(calendar, rules, day=day, tz=tz, now=now):
                slot = by_start.setdefault(start, Slot(starts_at=start, ends_at=end))
                slot.provider_ids.append(calendar.provider_id)
        day += timedelta(days=1)
    return [by_start[key] for key in sorted(by_start)]
