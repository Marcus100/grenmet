"""Shared timezone helpers.

Database datetimes are naive UTC (``src.utils.datetime.utc_now``). Business rules
that depend on a wall clock (opening hours, "today", reminders) convert through
these helpers instead of redefining ``ZoneInfo("America/Grenada")`` per module.
"""

from datetime import UTC, date, datetime, time
from functools import cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "America/Grenada"


@cache
def zone(name: str = DEFAULT_TIMEZONE) -> ZoneInfo:
    """The ``ZoneInfo`` for an IANA name; raises ``ValueError`` for unknown names."""
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError(f"Unknown timezone: {name}") from error


#: Grenada's zone (UTC-4, no daylight saving). Import this instead of
#: constructing ``ZoneInfo("America/Grenada")`` in a module.
GRENADA = zone(DEFAULT_TIMEZONE)


def is_valid_timezone(name: str) -> bool:
    try:
        zone(name)
    except ValueError:
        return False
    return True


def local_to_utc(day: date, at: time, tz: ZoneInfo) -> datetime:
    """A local wall-clock time as naive UTC.

    A time skipped by a daylight-saving jump resolves forward (``fold=0``
    semantics of ``zoneinfo``); an ambiguous time takes its first occurrence.
    """
    return datetime.combine(day, at, tzinfo=tz).astimezone(UTC).replace(tzinfo=None)


def utc_to_local(moment: datetime, tz: ZoneInfo) -> datetime:
    """A naive-UTC datetime as an aware local datetime."""
    return moment.replace(tzinfo=UTC).astimezone(tz)
