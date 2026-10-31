"""Overtime hours by rate band (#380, rule 5; no database).

October 2026: Friday 2, Saturday 3, Sunday 4, Monday 5.
"""

from collections.abc import Callable
from datetime import date, datetime, time
from decimal import Decimal

from src.hr.roster.overtime import (
    DayKind,
    OvertimeBand,
    OvertimeSpell,
    band_overtime,
    classify_day,
    extension_spell,
    merge_bands,
)
from src.hr.roster.rules import OvertimeBandRules

BANDS = OvertimeBandRules()
FRI, SAT, SUN, MON = (
    date(2026, 10, 2),
    date(2026, 10, 3),
    date(2026, 10, 4),
    date(2026, 10, 5),
)


def _at(day: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day, time(hh, mm))


def _kinds(
    holidays: set[date] | None = None, day_off: date | None = None
) -> Callable[[date], DayKind]:
    return lambda day: classify_day(
        day, holidays=holidays or set(), day_off=day == day_off
    )


def _bands(
    spells: list[OvertimeSpell],
    day: date,
    kinds: Callable[[date], DayKind] | None = None,
) -> dict[str, str]:
    result = band_overtime(
        spells, attributed_day=day, kind_for=kinds or _kinds(), bands=BANDS
    )
    return {str(b.rate): str(b.hours) for b in result}


def test_classify_day_order() -> None:
    holiday = {MON}
    assert classify_day(MON, holidays=holiday, day_off=True) == DayKind.PUBLIC_HOLIDAY
    assert classify_day(SUN, holidays=set(), day_off=True) == DayKind.SUNDAY
    assert classify_day(SAT, holidays=set(), day_off=True) == DayKind.DAY_OFF
    assert classify_day(SAT, holidays=set(), day_off=False) == DayKind.SATURDAY
    assert classify_day(FRI, holidays=set(), day_off=False) == DayKind.WEEKDAY


def test_weekday_first_four_hours_then_double() -> None:
    spell = OvertimeSpell(_at(MON, 16), _at(MON, 22))
    assert _bands([spell], MON) == {"1.5": "4.00", "2": "2.00"}


def test_weekday_counter_spans_spells_on_the_same_day() -> None:
    early = OvertimeSpell(_at(MON, 5), _at(MON, 8))  # 3 h before the shift
    late = OvertimeSpell(_at(MON, 16), _at(MON, 18))  # 2 h after
    assert _bands([early, late], MON) == {"1.5": "4.00", "2": "1.00"}


def test_after_midnight_is_at_least_double() -> None:
    # Friday 22:00 to Saturday 02:00: 2 h weekday, then 2 h after midnight.
    spell = OvertimeSpell(_at(FRI, 22), _at(SAT, 2))
    assert _bands([spell], FRI) == {"1.5": "2.00", "2": "2.00"}


def test_saturday_window_is_time_and_a_half() -> None:
    spell = OvertimeSpell(_at(SAT, 7), _at(SAT, 14))
    assert _bands([spell], SAT) == {"1.5": "4.00", "2": "3.00"}


def test_sunday_first_eight_hours_double_then_triple() -> None:
    spell = OvertimeSpell(_at(SUN, 6), _at(SUN, 17))
    assert _bands([spell], SUN) == {"2": "8.00", "3": "3.00"}


def test_public_holiday_uses_the_rest_day_band() -> None:
    spell = OvertimeSpell(_at(MON, 16), _at(MON, 18))
    assert _bands([spell], MON, _kinds(holidays={MON})) == {"2": "2.00"}


def test_rostered_day_off_uses_the_rest_day_band_even_on_saturday() -> None:
    spell = OvertimeSpell(_at(SAT, 8), _at(SAT, 18))
    assert _bands([spell], SAT, _kinds(day_off=SAT)) == {"2": "8.00", "3": "2.00"}


def test_saturday_night_into_sunday_takes_sunday_rates() -> None:
    # Saturday 22:00 to Sunday 03:00: 2 h Saturday outside the window (2x),
    # then 3 h on Sunday (rest-day band, first 8 h at 2x).
    spell = OvertimeSpell(_at(SAT, 22), _at(SUN, 3))
    assert _bands([spell], SAT) == {"2": "5.00"}


def test_long_sunday_spell_into_monday_after_midnight() -> None:
    # Sunday 14:00 to Monday 01:00: 10 h Sunday (8 at 2x, 2 at 3x), 1 h after
    # midnight on a weekday (2x).
    spell = OvertimeSpell(_at(SUN, 14), _at(MON, 1))
    assert _bands([spell], SUN) == {"2": "9.00", "3": "2.00"}


def test_no_overtime_gives_no_bands() -> None:
    assert _bands([], MON) == {}


def test_extension_spell_starts_at_shift_end_or_day_start() -> None:
    spell = extension_spell(_at(MON, 16), MON, Decimal("1.5"), day_start=time(8))
    assert spell == OvertimeSpell(_at(MON, 16), _at(MON, 17, 30))
    untimed = extension_spell(None, SAT, Decimal(5), day_start=time(8))
    assert untimed == OvertimeSpell(_at(SAT, 8), _at(SAT, 13))
    assert extension_spell(None, SAT, Decimal(0), day_start=time(8)) is None


def test_merge_bands_adds_by_rate() -> None:
    merged = merge_bands(
        [
            [OvertimeBand(Decimal("1.5"), Decimal(2))],
            [
                OvertimeBand(Decimal("1.5"), Decimal(1)),
                OvertimeBand(Decimal(2), Decimal(1)),
            ],
        ]
    )
    assert merged == [
        OvertimeBand(Decimal("1.5"), Decimal(3)),
        OvertimeBand(Decimal(2), Decimal(1)),
    ]
