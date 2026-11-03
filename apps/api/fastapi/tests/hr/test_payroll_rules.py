"""Pure pay-input rules: edges and parameter validation (no database)."""

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest

from src.hr.payroll import rules
from src.hr.payroll.catalogue import GAA_PAY_ITEMS
from src.hr.payroll.models import PayItemMethod
from src.utils.timezones import GRENADA

MEAL = {
    "shift_worker_standard_hours": "8",
    "shift_worker_beyond_hours": "2",
    "non_shift_departs_after": "18:30",
}


def shift(
    arrive: str, depart: str, *, shift_worker: bool = False, break_minutes: int = 0
) -> rules.ShiftFacts:
    arrived = datetime.fromisoformat(arrive).replace(tzinfo=GRENADA)
    return rules.ShiftFacts(
        attendance_id=uuid.uuid4(),
        revision=1,
        user_id=uuid.uuid4(),
        department_id="dept",
        work_date=arrived.date(),
        arrived=arrived,
        departed=datetime.fromisoformat(depart).replace(tzinfo=GRENADA),
        break_minutes=break_minutes,
        shift_worker=shift_worker,
    )


def test_base_hours_cap_at_the_standard_day_and_honour_the_basis() -> None:
    long = shift("2026-09-08T07:00", "2026-09-08T19:00", break_minutes=60)
    assert rules.base_hours(long, {"standard_hours": "8"}) == Decimal("8.00")
    short = shift("2026-09-08T08:00", "2026-09-08T15:00", break_minutes=60)
    assert rules.base_hours(short, {"standard_hours": "8"}) == Decimal("7.00")
    assert rules.base_hours(
        short, {"standard_hours": "8", "hours_basis": "NET_OF_BREAK"}
    ) == Decimal("6.00")


@pytest.mark.parametrize(
    ("arrive", "depart", "expected"),
    [
        ("2026-09-11T20:00", "2026-09-12T04:00", "7.00"),
        ("2026-09-11T07:00", "2026-09-11T19:00", "0.00"),
        ("2026-09-11T05:00", "2026-09-11T22:00", "2.00"),  # 05-06 and 21-22
        ("2026-09-11T21:00", "2026-09-12T06:00", "9.00"),
        ("2026-09-11T22:30", "2026-09-12T07:15", "7.50"),
    ],
)
def test_shift_premium_window_crosses_midnight(
    arrive: str, depart: str, expected: str
) -> None:
    params = {"start": "21:00", "end": "06:00"}
    assert rules.window_hours(shift(arrive, depart), params) == Decimal(expected)


@pytest.mark.parametrize(
    ("depart", "meals"),
    [("2026-09-09T18:29", 0), ("2026-09-09T18:30", 0), ("2026-09-09T18:31", 1)],
)
def test_non_shift_meal_needs_a_departure_after_eighteen_thirty(
    depart: str, meals: int
) -> None:
    assert rules.threshold_count(shift("2026-09-09T08:00", depart), MEAL) == meals


@pytest.mark.parametrize(
    ("depart", "meals"),
    [("2026-09-09T17:00", 0), ("2026-09-09T17:01", 1), ("2026-09-09T19:00", 1)],
)
def test_shift_worker_meal_needs_more_than_two_hours_past_eight(
    depart: str, meals: int
) -> None:
    worked = shift("2026-09-09T07:00", depart, shift_worker=True)
    assert rules.threshold_count(worked, MEAL) == meals


def test_shift_worker_ignores_the_evening_cutoff() -> None:
    evening = shift("2026-09-09T12:00", "2026-09-09T20:00", shift_worker=True)
    assert rules.threshold_count(evening, MEAL) == 0


def test_public_holiday_hours_count_only_inside_the_holiday() -> None:
    night = shift("2026-09-30T20:00", "2026-10-01T04:00")
    holidays = frozenset({date(2026, 10, 1)})
    assert rules.holiday_hours(night, holidays) == Decimal("4.00")
    assert rules.holiday_hours(night, frozenset()) == Decimal("0.00")


@pytest.mark.parametrize(
    ("method", "params"),
    [
        (PayItemMethod.TIME_WINDOW, {"start": "21:00", "end": "21:00"}),
        (PayItemMethod.TIME_WINDOW, {"start": "nine", "end": "06:00"}),
        (PayItemMethod.ATTENDANCE_BASE, {"standard_hours": "-1"}),
        (PayItemMethod.ATTENDANCE_BASE, {"hours_basis": "GROSS"}),
        (PayItemMethod.THRESHOLD_EVENT, {"non_shift_departs_after": "late"}),
        (PayItemMethod.OVERTIME_BAND, {}),
    ],
)
def test_invalid_params_are_refused(
    method: PayItemMethod, params: dict[str, str]
) -> None:
    with pytest.raises(rules.PayRuleError):
        rules.validate_params(method, params)


def test_gaa_catalogue_params_are_valid_and_hold_no_money() -> None:
    for seed in GAA_PAY_ITEMS:
        rules.validate_params(seed.method, seed.params)
        assert not {"rate", "amount", "multiplier"} & set(seed.params), seed.code
        assert seed.source
