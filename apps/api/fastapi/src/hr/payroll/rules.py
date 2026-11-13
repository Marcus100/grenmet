"""Pure pay-input rules: one approved shift in, quantities out. No I/O.

Every number a rule uses comes from the pay item's ``params`` (organisation
data), so a rule GAA has not confirmed is changed by editing data, not code.
Times are Grenada local (no daylight saving), so local wall-clock arithmetic
is exact.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from src.utils.timezones import GRENADA

from .models import PayItemMethod

HUNDREDTH = Decimal("0.01")
#: Arrival to departure, the memorandum's "8 hours inclusive of a lunch break".
ELAPSED = "ELAPSED"
#: Arrival to departure less the recorded break, the timesheet's approved hours.
NET_OF_BREAK = "NET_OF_BREAK"
HOURS_BASES = frozenset({ELAPSED, NET_OF_BREAK})


class PayRuleError(ValueError):
    """A pay item's params cannot drive its method."""


@dataclass(frozen=True)
class ShiftFacts:
    """One approved attendance record, as payroll sees it."""

    attendance_id: uuid.UUID
    revision: int
    user_id: uuid.UUID
    department_id: str
    work_date: date  # local roster date the shift started on
    arrived: datetime  # aware, Grenada
    departed: datetime  # aware, Grenada
    break_minutes: int
    shift_worker: bool

    def hours(self, basis: str = ELAPSED) -> Decimal:
        seconds = Decimal(str((self.departed - self.arrived).total_seconds()))
        if basis == NET_OF_BREAK:
            seconds -= Decimal(self.break_minutes * 60)
        return _hours(max(seconds, Decimal(0)))


def local(value: datetime) -> datetime:
    """Stored attendance times are naive UTC; payroll rules read local time."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(GRENADA)


def _hours(seconds: Decimal) -> Decimal:
    return (seconds / Decimal(3600)).quantize(HUNDREDTH)


def _decimal(params: dict[str, Any], key: str) -> Decimal | None:
    raw = params.get(key)
    if raw is None:
        return None
    try:
        value = Decimal(str(raw))
    except ArithmeticError as exc:
        raise PayRuleError(f"{key} must be a number") from exc
    if value < 0:
        raise PayRuleError(f"{key} cannot be negative")
    return value


def _clock(params: dict[str, Any], key: str) -> time | None:
    raw = params.get(key)
    if raw is None:
        return None
    try:
        return time.fromisoformat(str(raw))
    except ValueError as exc:
        raise PayRuleError(f"{key} must be a time such as 18:30") from exc


def _basis(params: dict[str, Any]) -> str:
    basis = str(params.get("hours_basis", ELAPSED))
    if basis not in HOURS_BASES:
        raise PayRuleError(f"hours_basis must be one of {sorted(HOURS_BASES)}")
    return basis


def overlap_hours(
    start: datetime, end: datetime, window_start: datetime, window_end: datetime
) -> Decimal:
    lo, hi = max(start, window_start), min(end, window_end)
    if hi <= lo:
        return Decimal("0.00")
    return _hours(Decimal(str((hi - lo).total_seconds())))


def base_hours(shift: ShiftFacts, params: dict[str, Any]) -> Decimal:
    """Hours up to the standard day; anything beyond is overtime (#380 bands)."""
    standard = _decimal(params, "standard_hours")
    worked = shift.hours(_basis(params))
    return worked if standard is None else min(worked, standard)


def window_hours(shift: ShiftFacts, params: dict[str, Any]) -> Decimal:
    """Hours inside a daily local window, e.g. 21:00 to 06:00 shift premium.

    The break is not deducted: attendance does not record when it was taken.
    """
    start, end = _clock(params, "start"), _clock(params, "end")
    if start is None or end is None or start == end:
        raise PayRuleError("start and end must be different times")
    total = Decimal("0.00")
    day = shift.arrived.date() - timedelta(days=1)
    while day <= shift.departed.date():
        window_start = datetime.combine(day, start, GRENADA)
        window_end = datetime.combine(
            day + timedelta(days=1) if end <= start else day, end, GRENADA
        )
        total += overlap_hours(shift.arrived, shift.departed, window_start, window_end)
        day += timedelta(days=1)
    return total


def holiday_hours(shift: ShiftFacts, holidays: frozenset[date]) -> Decimal:
    """Hours worked inside a public holiday's local calendar day."""
    total = Decimal("0.00")
    day = shift.arrived.date()
    while day <= shift.departed.date():
        if day in holidays:
            total += overlap_hours(
                shift.arrived,
                shift.departed,
                datetime.combine(day, time(0), GRENADA),
                datetime.combine(day + timedelta(days=1), time(0), GRENADA),
            )
        day += timedelta(days=1)
    return total


def threshold_count(shift: ShiftFacts, params: dict[str, Any]) -> Decimal:
    """1 when the shift crosses the item's threshold for this kind of worker.

    Shift worker: worked more than ``shift_worker_beyond_hours`` past
    ``shift_worker_standard_hours``. Non-shift worker: departed after
    ``non_shift_departs_after`` local time on the shift's own date.
    """
    if shift.shift_worker:
        standard = _decimal(params, "shift_worker_standard_hours")
        beyond = _decimal(params, "shift_worker_beyond_hours")
        if standard is None or beyond is None:
            return Decimal(0)
        return (
            Decimal(1)
            if shift.hours(_basis(params)) > standard + beyond
            else Decimal(0)
        )
    cutoff = _clock(params, "non_shift_departs_after")
    if cutoff is None:
        return Decimal(0)
    limit = datetime.combine(shift.work_date, cutoff, GRENADA)
    return Decimal(1) if shift.departed > limit else Decimal(0)


def validate_params(method: str, params: dict[str, Any]) -> None:
    """Refuse params the method cannot use, before they reach a computation."""
    if method == PayItemMethod.ATTENDANCE_BASE:
        _decimal(params, "standard_hours")
        _basis(params)
    elif method == PayItemMethod.TIME_WINDOW:
        start, end = _clock(params, "start"), _clock(params, "end")
        if start is None or end is None or start == end:
            raise PayRuleError("start and end must be different times")
    elif method == PayItemMethod.THRESHOLD_EVENT:
        _decimal(params, "shift_worker_standard_hours")
        _decimal(params, "shift_worker_beyond_hours")
        _clock(params, "non_shift_departs_after")
        _basis(params)
    elif method == PayItemMethod.OVERTIME_BAND:
        if not str(params.get("band", "")).strip():
            raise PayRuleError("band is required")


def quantity_for(
    method: str,
    shift: ShiftFacts,
    params: dict[str, Any],
    holidays: frozenset[date],
) -> Decimal:
    """The quantity one shift contributes to one computed (non-band) pay item."""
    if method == PayItemMethod.ATTENDANCE_BASE:
        return base_hours(shift, params)
    if method == PayItemMethod.TIME_WINDOW:
        return window_hours(shift, params)
    if method == PayItemMethod.PUBLIC_HOLIDAY:
        return holiday_hours(shift, holidays)
    if method == PayItemMethod.THRESHOLD_EVENT:
        return threshold_count(shift, params)
    return Decimal(0)
