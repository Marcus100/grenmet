"""Shift expansion: the single translation from roster cells to concrete time.

Every consumer that needs to know *when* a rostered shift actually happens
(timesheet generation, on-duty queries, hour computation) must go through this
module rather than interpreting shift_catalog times itself. assignment_date is
always the day the shift STARTS; whether it ends the following day is carried
by the explicit ShiftCatalog.ends_next_day flag, never inferred from times.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from .models import ShiftCatalog


def expand_shift(
    assignment_date: date, shift: ShiftCatalog
) -> tuple[datetime, datetime] | None:
    """Concrete (start, end) interval for a shift on a given roster date.

    Returns None for codes without clock times (O, L, V, S). Datetimes are
    naive department-local time, matching how times are stored in the catalog.

    Raises ValueError for corrupt catalog data: a shift that ends at or before
    its start without ends_next_day set.
    """
    if shift.start_time is None or shift.end_time is None:
        return None
    start = datetime.combine(assignment_date, time.fromisoformat(shift.start_time))
    end_day = (
        assignment_date + timedelta(days=1) if shift.ends_next_day else assignment_date
    )
    end = datetime.combine(end_day, time.fromisoformat(shift.end_time))
    if end <= start:
        raise ValueError(
            f"Shift '{shift.code}' ends at or before it starts "
            f"({shift.start_time}-{shift.end_time}); "
            "midnight-crossing shifts must set ends_next_day"
        )
    return start, end


def shift_hours(shift: ShiftCatalog) -> Decimal | None:
    """Shift duration in hours (2 dp), or None for codes without clock times."""
    interval = expand_shift(date(2000, 1, 3), shift)
    if interval is None:
        return None
    start, end = interval
    seconds = (end - start).total_seconds()
    return (Decimal(seconds) / Decimal(3600)).quantize(Decimal("0.01"))
