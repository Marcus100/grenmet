"""The SQL ``IN`` list for live punches is exactly the set that ``status != REJECTED``
used to select, so the clock queries keep their meaning (src/hr/attendance/transitions.py).
"""

from src.hr.attendance import transitions as pt
from src.hr.attendance.models import ClockPunchStatus


def test_live_values_are_the_stored_strings_of_the_live_set() -> None:
    assert pt.LIVE_PUNCH_VALUES == ("APPROVED", "PENDING")


def test_live_values_are_every_status_but_rejected() -> None:
    assert set(pt.LIVE_PUNCH_VALUES) == {
        status.value
        for status in ClockPunchStatus
        if status is not ClockPunchStatus.REJECTED
    }
