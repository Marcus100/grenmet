"""The availability engine is pure: these tests need no database."""

from datetime import date, datetime, time, timedelta

import pytest

from src.bookings.availability import (
    ProviderCalendar,
    ScheduleException,
    SlotRules,
    WorkingPeriod,
    merge,
    open_slots,
    provider_slots,
    subtract,
)
from src.utils.timezones import local_to_utc, zone

GRENADA = zone("America/Grenada")  # UTC-4 all year
NEW_YORK = zone("America/New_York")
MONDAY = date(2026, 11, 2)
LONG_AGO = datetime(2026, 1, 1)


def _rules(**overrides: timedelta) -> SlotRules:
    values = {
        "duration": timedelta(minutes=60),
        "step": timedelta(minutes=30),
        "horizon": timedelta(days=400),
    }
    values.update(overrides)
    return SlotRules(**values)


def _local(day: date, hour: int, minute: int = 0, tz=GRENADA) -> datetime:
    return local_to_utc(day, time(hour, minute), tz)


def _calendar(*periods: tuple[int, int, int], **extra) -> ProviderCalendar:
    return ProviderCalendar(
        provider_id=extra.pop("provider_id", "jeriann"),
        periods=[WorkingPeriod(w, time(s), time(e)) for w, s, e in periods],
        **extra,
    )


def _starts(slots) -> list[tuple[int, int]]:
    out = []
    for start, _ in slots:
        local = start - timedelta(hours=4)  # Grenada offset, test convenience
        out.append((local.hour, local.minute))
    return out


def test_merge_and_subtract() -> None:
    a = datetime(2026, 1, 1, 9)
    h = timedelta(hours=1)
    assert merge([(a, a + h), (a + h, a + 2 * h), (a + 5 * h, a + 6 * h)]) == [
        (a, a + 2 * h),
        (a + 5 * h, a + 6 * h),
    ]
    assert subtract([(a, a + 4 * h)], [(a + h, a + 2 * h)]) == [
        (a, a + h),
        (a + 2 * h, a + 4 * h),
    ]
    assert subtract([(a, a + h)], [(a - h, a + 2 * h)]) == []


def test_slots_fill_working_hours_on_the_step() -> None:
    slots = provider_slots(
        _calendar((0, 9, 12)), _rules(), day=MONDAY, tz=GRENADA, now=LONG_AGO
    )
    assert _starts(slots) == [(9, 0), (9, 30), (10, 0), (10, 30), (11, 0)]
    assert slots[0][0] == datetime(2026, 11, 2, 13, 0)  # 09:00 local is 13:00 UTC


def test_no_slots_on_days_off() -> None:
    sunday = MONDAY - timedelta(days=1)
    assert (
        provider_slots(
            _calendar((0, 9, 17)), _rules(), day=sunday, tz=GRENADA, now=LONG_AGO
        )
        == []
    )


def test_breaks_are_gaps_between_periods() -> None:
    slots = provider_slots(
        _calendar((0, 9, 11), (0, 12, 14)),
        _rules(),
        day=MONDAY,
        tz=GRENADA,
        now=LONG_AGO,
    )
    assert _starts(slots) == [(9, 0), (9, 30), (10, 0), (12, 0), (12, 30), (13, 0)]


def test_window_start_off_the_grid_aligns_forward() -> None:
    calendar = ProviderCalendar(
        provider_id="p", periods=[WorkingPeriod(0, time(9, 10), time(11, 0))]
    )
    slots = provider_slots(calendar, _rules(), day=MONDAY, tz=GRENADA, now=LONG_AGO)
    assert _starts(slots) == [(9, 30), (10, 0)]


def test_existing_booking_and_buffers_block_overlapping_slots() -> None:
    # Existing booking 10:00-11:00 with 15 min buffers either side (already buffered).
    busy = [(_local(MONDAY, 9, 45), _local(MONDAY, 11, 15))]
    rules = _rules(buffer_after=timedelta(minutes=15))
    slots = provider_slots(
        _calendar((0, 8, 14), busy=busy), rules, day=MONDAY, tz=GRENADA, now=LONG_AGO
    )
    # 08:30 -> blocked until 09:45: touches, allowed. 09:00 would run into the busy range.
    assert _starts(slots) == [(8, 0), (8, 30), (11, 30), (12, 0), (12, 30), (13, 0)]


def test_time_off_removes_and_extra_hours_add() -> None:
    time_off = ScheduleException(_local(MONDAY, 9), _local(MONDAY, 10), "time_off")
    extra = ScheduleException(_local(MONDAY, 17), _local(MONDAY, 19), "extra_hours")
    slots = provider_slots(
        _calendar((0, 9, 12), exceptions=[time_off, extra]),
        _rules(),
        day=MONDAY,
        tz=GRENADA,
        now=LONG_AGO,
    )
    assert _starts(slots) == [(10, 0), (10, 30), (11, 0), (17, 0), (17, 30), (18, 0)]


def test_extra_hours_on_a_day_off() -> None:
    saturday = MONDAY + timedelta(days=5)
    extra = ScheduleException(_local(saturday, 10), _local(saturday, 12), "extra_hours")
    slots = provider_slots(
        _calendar((0, 9, 12), exceptions=[extra]),
        _rules(),
        day=saturday,
        tz=GRENADA,
        now=LONG_AGO,
    )
    assert _starts(slots) == [(10, 0), (10, 30), (11, 0)]


def test_lead_time_and_horizon() -> None:
    now = _local(MONDAY, 9, 5)
    slots = provider_slots(
        _calendar((0, 9, 17)),
        _rules(lead_time=timedelta(hours=2), horizon=timedelta(hours=5)),
        day=MONDAY,
        tz=GRENADA,
        now=now,
    )
    # Earliest 11:05 -> first slot 11:30; latest start 14:05 -> last slot 14:00.
    assert _starts(slots)[0] == (11, 30)
    assert _starts(slots)[-1] == (14, 0)


def test_service_longer_than_any_window_has_no_slots() -> None:
    slots = provider_slots(
        _calendar((0, 9, 11)),
        _rules(duration=timedelta(hours=3)),
        day=MONDAY,
        tz=GRENADA,
        now=LONG_AGO,
    )
    assert slots == []


@pytest.mark.parametrize(
    ("day", "expected_utc_hour"),
    [
        (date(2026, 3, 6), 14),  # Friday before DST: 09:00 EST = 14:00 UTC
        (date(2026, 3, 9), 13),  # Monday after DST starts: 09:00 EDT = 13:00 UTC
        (date(2026, 11, 2), 14),  # Monday after DST ends: back to EST
    ],
)
def test_wall_clock_hours_follow_daylight_saving(
    day: date, expected_utc_hour: int
) -> None:
    calendar = _calendar((day.weekday(), 9, 10))
    slots = provider_slots(calendar, _rules(), day=day, tz=NEW_YORK, now=LONG_AGO)
    assert slots[0][0].hour == expected_utc_hour


def test_open_slots_union_providers_and_days() -> None:
    a = _calendar((0, 9, 11), provider_id="a")
    b = _calendar((0, 10, 12), (1, 9, 10), provider_id="b")
    slots = open_slots(
        [a, b],
        _rules(),
        first_day=MONDAY,
        last_day=MONDAY + timedelta(days=1),
        tz=GRENADA,
        now=LONG_AGO,
    )
    by_start = {(s.starts_at - timedelta(hours=4)): s.provider_ids for s in slots}
    assert by_start[datetime(2026, 11, 2, 9, 0)] == ["a"]
    assert by_start[datetime(2026, 11, 2, 10, 0)] == ["a", "b"]
    assert by_start[datetime(2026, 11, 2, 11, 0)] == ["b"]
    assert by_start[datetime(2026, 11, 3, 9, 0)] == ["b"]
    assert [s.starts_at for s in slots] == sorted(s.starts_at for s in slots)
