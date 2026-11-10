"""Sun, twilight, moon events and principal phases (pure; Astral, no I/O).

Everything here is UTC-aware. ``local_date`` values are Grenada calendar dates
(America/Grenada, UTC-4 all year), the day a table row or an API day stands for.

Principal phases are found by scanning daily ``astral.moon.phase`` values. Astral
resolves phase to a whole date, so a phase date can be a day early or late. That is
inside the accepted +/-1 day tolerance; it is not an instant.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from astral import Observer, moon, sun

from src.utils.timezones import GRENADA

#: Astral's phase scale: 0 new, 7 first quarter, 14 full, 21 last quarter.
CYCLE = 28.0

#: Principal phase keys (API and table values) and their phase-scale targets.
PRINCIPAL_PHASES: tuple[tuple[str, float], ...] = (
    ("new", 0.0),
    ("first_quarter", 7.0),
    ("full", 14.0),
    ("last_quarter", 21.0),
)

#: Eight names, one per 3.5-unit band centred on 0, 3.5, 7 ... (see ``phase_name``).
PHASE_NAMES: tuple[str, ...] = (
    "New Moon",
    "Waxing Crescent",
    "First Quarter",
    "Waxing Gibbous",
    "Full Moon",
    "Waning Gibbous",
    "Last Quarter",
    "Waning Crescent",
)


@dataclass(frozen=True)
class AstroDay:
    local_date: date
    sunrise_utc: datetime
    sunset_utc: datetime
    civil_dawn_utc: datetime
    civil_dusk_utc: datetime
    moonrise_utc: datetime | None
    moonset_utc: datetime | None
    moon_phase: str


def year_days(year: int) -> list[date]:
    """Every calendar date of ``year``, in order."""
    day = date(year, 1, 1)
    days: list[date] = []
    while day.year == year:
        days.append(day)
        day += timedelta(days=1)
    return days


def phase_name(value: float) -> str:
    """Name of the moon's phase on the Astral scale, one of ``PHASE_NAMES``."""
    # Bands are 3.5 wide and centred on 0, 3.5, 7 ... so shift by half a band first.
    index = int(((value + CYCLE / 16) % CYCLE) // (CYCLE / 8))
    return PHASE_NAMES[index]


def _offset(value: float, target: float) -> float:
    """Signed distance from ``target`` on the cycle, in [-CYCLE/2, CYCLE/2)."""
    return (value - target + CYCLE / 2) % CYCLE - CYCLE / 2


def principal_phase_dates(first_year: int, last_year: int) -> list[tuple[str, date]]:
    """Principal phases whose Grenada local date falls in the given years, in order.

    A phase is dated to the first day its phase value reaches the target. The date is
    accurate to +/-1 day.
    """
    day = date(first_year, 1, 1) - timedelta(days=1)
    end = date(last_year, 12, 31)
    samples: list[tuple[date, float]] = []
    while day <= end:
        samples.append((day, moon.phase(day)))
        day += timedelta(days=1)

    found: list[tuple[str, date]] = []
    for key, target in PRINCIPAL_PHASES:
        for (_, before), (day_now, now) in zip(samples, samples[1:], strict=False):
            if _offset(before, target) < 0 <= _offset(now, target):
                if first_year <= day_now.year <= last_year:
                    found.append((key, day_now))
    return sorted(found, key=lambda item: item[1])


def compute_day(latitude: float, longitude: float, local_date: date) -> AstroDay:
    """Sun, civil twilight, moon events and phase name for one Grenada date.

    Sun times use Grenada time (Astral's date match is reliable for the sun). Moon
    events are computed on UTC days and the first one inside the Grenada day is kept:
    Astral's Grenada-time moon mode raises spurious errors near local midnight.
    """
    observer = Observer(latitude=latitude, longitude=longitude, elevation=0)
    return AstroDay(
        local_date=local_date,
        sunrise_utc=_utc(sun.sunrise(observer, local_date, tzinfo=GRENADA)),
        sunset_utc=_utc(sun.sunset(observer, local_date, tzinfo=GRENADA)),
        civil_dawn_utc=_utc(sun.dawn(observer, local_date, tzinfo=GRENADA)),
        civil_dusk_utc=_utc(sun.dusk(observer, local_date, tzinfo=GRENADA)),
        moonrise_utc=_moon_event(moon.moonrise, observer, local_date),
        moonset_utc=_moon_event(moon.moonset, observer, local_date),
        moon_phase=phase_name(moon.phase(local_date)),
    )


def grenada_day_bounds(local_date: date) -> tuple[datetime, datetime]:
    """The Grenada calendar day as a half-open UTC interval."""
    start = datetime.combine(local_date, time(0), tzinfo=GRENADA)
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)


def _moon_event(
    event: Callable[..., datetime | None], observer: Observer, local_date: date
) -> datetime | None:
    """The first moonrise or moonset inside the Grenada day, or None.

    Astral raises ``ValueError`` ("never sets on this date") instead of returning None
    when there is no event on a UTC day. That is normal (about twice a month here), so
    it is not an error. A Grenada day spans two UTC days, so both are asked.
    """
    start, stop = grenada_day_bounds(local_date)
    for utc_day in (start.date(), stop.date()):
        try:
            value = event(observer, utc_day, tzinfo=UTC)
        except ValueError:
            continue
        if value is not None and start <= value.astimezone(UTC) < stop:
            return value.astimezone(UTC)
    return None


def _utc(value: datetime) -> datetime:
    return value.astimezone(UTC)
