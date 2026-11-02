"""Overtime hours by rate band (#380, rule 5). Hours only; payroll is future work.

Bands (defaults in ``rules.OvertimeBandRules``):
- weekday beyond normal hours: the first 4 hours at 1.5x, then 2x;
- Saturday: hours inside 08:00-12:00 at 1.5x, other hours at 2x;
- Sunday, public holiday or a rostered day off: the first 8 hours at 2x, then 3x;
- after midnight: at least 2x.

Readings used (documented in docs/hr/roster-rules.md):
- Overtime is attributed to the day its shift starts. Hours that run past
  midnight into the next calendar day are "after midnight" and never below the
  after-midnight rate. If that next day is itself a Sunday, public holiday or
  rostered day off, its rest-day band applies to those hours.
- The weekday "first 4 hours" counter is per attributed day; the rest-day "first
  8 hours" counter is per calendar day.
- A day's kind is decided in this order: public holiday, Sunday, rostered day off,
  Saturday, weekday.
"""

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from enum import Enum

from .rules import OvertimeBandRules

_HOUR = Decimal(3600)
_SATURDAY = 5
_SUNDAY = 6


class DayKind(str, Enum):
    WEEKDAY = "WEEKDAY"
    SATURDAY = "SATURDAY"
    SUNDAY = "SUNDAY"
    PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"
    DAY_OFF = "DAY_OFF"


_REST_KINDS = frozenset({DayKind.SUNDAY, DayKind.PUBLIC_HOLIDAY, DayKind.DAY_OFF})


@dataclass(frozen=True)
class OvertimeSpell:
    """Overtime worked from ``start`` to ``end`` (naive local time)."""

    start: datetime
    end: datetime


@dataclass(frozen=True)
class OvertimeBand:
    rate: Decimal
    hours: Decimal


def classify_day(day: date, *, holidays: set[date], day_off: bool) -> DayKind:
    if day in holidays:
        return DayKind.PUBLIC_HOLIDAY
    if day.weekday() == _SUNDAY:
        return DayKind.SUNDAY
    if day_off:
        return DayKind.DAY_OFF
    if day.weekday() == _SATURDAY:
        return DayKind.SATURDAY
    return DayKind.WEEKDAY


def _pieces(
    spell: OvertimeSpell, bands: OvertimeBandRules
) -> Iterable[tuple[datetime, datetime]]:
    """Cut a spell at midnights and at Saturday window edges."""
    cursor = spell.start
    while cursor < spell.end:
        day = cursor.date()
        cuts = [datetime.combine(day + timedelta(days=1), time(0))]
        if day.weekday() == _SATURDAY:
            cuts += [
                datetime.combine(day, bands.saturday_window_start),
                datetime.combine(day, bands.saturday_window_end),
            ]
        nxt = min([c for c in cuts if c > cursor] + [spell.end])
        yield cursor, nxt
        cursor = nxt


def _split(
    hours: Decimal, used: Decimal, first_hours: Decimal
) -> tuple[Decimal, Decimal]:
    """(hours inside the first band, hours after it) given ``used`` already."""
    inside = max(Decimal(0), min(hours, first_hours - used))
    return inside, hours - inside


def band_overtime(
    spells: Iterable[OvertimeSpell],
    *,
    attributed_day: date,
    kind_for: Callable[[date], DayKind],
    bands: OvertimeBandRules,
) -> list[OvertimeBand]:
    """Hours per rate for the overtime attributed to one working day."""
    totals: dict[Decimal, Decimal] = defaultdict(Decimal)
    weekday_used = Decimal(0)
    rest_used: dict[date, Decimal] = defaultdict(Decimal)

    def add(rate: Decimal, hours: Decimal, after_midnight: bool) -> None:
        if hours <= 0:
            return
        if after_midnight:
            rate = max(rate, bands.after_midnight_rate)
        totals[rate] += hours

    for spell in sorted(spells, key=lambda s: s.start):
        for start, end in _pieces(spell, bands):
            hours = Decimal(str((end - start).total_seconds())) / _HOUR
            day = start.date()
            kind = kind_for(day)
            after_midnight = day > attributed_day
            if kind in _REST_KINDS:
                inside, rest = _split(hours, rest_used[day], bands.rest_day_first_hours)
                rest_used[day] += hours
                add(bands.rest_day_first_rate, inside, after_midnight)
                add(bands.rest_day_after_rate, rest, after_midnight)
            elif after_midnight:
                add(bands.after_midnight_rate, hours, after_midnight)
            elif kind == DayKind.SATURDAY:
                in_window = (
                    bands.saturday_window_start <= start.time()
                    and end <= datetime.combine(day, bands.saturday_window_end)
                )
                rate = (
                    bands.saturday_window_rate
                    if in_window
                    else bands.saturday_after_rate
                )
                add(rate, hours, after_midnight)
            else:
                inside, rest = _split(hours, weekday_used, bands.weekday_first_hours)
                weekday_used += hours
                add(bands.weekday_first_rate, inside, after_midnight)
                add(bands.weekday_after_rate, rest, after_midnight)
    return [
        OvertimeBand(rate=rate, hours=hours.quantize(Decimal("0.01")))
        for rate, hours in sorted(totals.items())
        if hours > 0
    ]


def merge_bands(groups: Iterable[Iterable[OvertimeBand]]) -> list[OvertimeBand]:
    totals: dict[Decimal, Decimal] = defaultdict(Decimal)
    for group in groups:
        for band in group:
            totals[band.rate] += band.hours
    return [OvertimeBand(rate=r, hours=h) for r, h in sorted(totals.items()) if h > 0]


def extension_spell(
    shift_end: datetime | None, day: date, hours: Decimal, *, day_start: time
) -> OvertimeSpell | None:
    """A timesheet's overtime hours as a spell: right after the shift ends (an
    extension), or from ``day_start`` when the day had no timed shift."""
    if hours <= 0:
        return None
    start = shift_end or datetime.combine(day, day_start)
    return OvertimeSpell(
        start=start, end=start + timedelta(seconds=float(hours * _HOUR))
    )
