from datetime import date, datetime

from tests.bookings.booking_day import MONDAY, next_monday, utc_at, utc_iso


def test_the_booking_monday_stays_a_week_or_more_ahead() -> None:
    # Saturday 31 Oct 2026: a week ahead is Saturday 7 Nov, so Monday 9 Nov.
    assert next_monday(date(2026, 10, 31)) == date(2026, 11, 9)
    # A Monday a week ahead is kept as it is.
    assert next_monday(date(2026, 11, 2)) == date(2026, 11, 9)
    assert MONDAY.weekday() == 0


def test_grenada_wall_clock_maps_to_utc_minus_four() -> None:
    day = date(2027, 1, 4)
    assert utc_at(9, 30, day) == datetime(2027, 1, 4, 13, 30)
    assert utc_iso(23, day=day) == "2027-01-05T03:00:00Z"
