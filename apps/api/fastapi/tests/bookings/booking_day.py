"""The Monday the bookings tests book on, kept ahead of the real clock.

Public availability hides slots before ``now + lead_time`` and after
``now + horizon`` (365 days in the fixtures), so a fixed date stops working
once it passes: ``2027-01-04`` would have broken every booking test on
2027-01-04. Grenada keeps UTC-4 all year, so 09:30 local is 13:30 UTC.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

GRENADA = ZoneInfo("America/Grenada")
#: Far enough ahead for the 24 h cancel cut-off and any fixture lead time.
MIN_DAYS_AHEAD = 7


def next_monday(today: date | None = None) -> date:
    """The first Monday at least MIN_DAYS_AHEAD days after today in Grenada."""
    today = today or datetime.now(UTC).astimezone(GRENADA).date()
    earliest = today + timedelta(days=MIN_DAYS_AHEAD)
    return earliest + timedelta(days=-earliest.weekday() % 7)


MONDAY = next_monday()
DAY = MONDAY.isoformat()


def utc_at(hour: int, minute: int = 0, day: date = MONDAY) -> datetime:
    """Naive UTC for a Grenada wall-clock time on ``day`` (the DB convention)."""
    local = datetime.combine(day, time(hour, minute), tzinfo=GRENADA)
    return local.astimezone(UTC).replace(tzinfo=None)


def utc_iso(hour: int, minute: int = 0, day: date = MONDAY) -> str:
    """The API's ``...Z`` form of :func:`utc_at`."""
    return utc_at(hour, minute, day).isoformat() + "Z"
