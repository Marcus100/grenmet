"""Pure almanac calculations (Astral). No database, no network.

Anchors are published new and full moon instants (UTC). Principal-phase dates
are the Grenada local date of the phase, accepted within one day.
"""

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from src.almanac import astro
from src.almanac.locations import LOCATIONS

GRENADA = ZoneInfo("America/Grenada")

MBIA = LOCATIONS["mbia"]


def _local(value: datetime) -> datetime:
    return value.astimezone(GRENADA)


@pytest.mark.parametrize(
    ("phase_key", "instant_utc"),
    [
        ("new", datetime(2000, 1, 6, 18, 14, tzinfo=UTC)),
        ("full", datetime(2000, 1, 21, 4, 40, tzinfo=UTC)),
        ("new", datetime(2024, 4, 8, 18, 21, tzinfo=UTC)),
        ("full", datetime(2024, 5, 23, 6, 53, tzinfo=UTC)),
    ],
)
def test_principal_phase_dates_match_published_instants(
    phase_key: str, instant_utc: datetime
) -> None:
    expected = _local(instant_utc).date()
    found = astro.principal_phase_dates(expected.year, expected.year)
    dates = [day for key, day in found if key == phase_key]
    assert any(abs((day - expected).days) <= 1 for day in dates), (
        f"{phase_key} near {expected} not found in {dates}"
    )


def test_principal_phases_are_about_a_week_apart_and_in_order() -> None:
    found = astro.principal_phase_dates(2026, 2026)
    days = [day for _, day in found]
    assert days == sorted(days)
    assert 48 <= len(found) <= 52  # four principal phases per ~29.5-day lunation
    gaps = [(b - a).days for a, b in zip(days, days[1:], strict=False)]
    assert all(5 <= gap <= 9 for gap in gaps), gaps


def test_phase_name_bins_cover_the_cycle() -> None:
    assert astro.phase_name(0.0) == "New Moon"
    assert astro.phase_name(7.0) == "First Quarter"
    assert astro.phase_name(14.0) == "Full Moon"
    assert astro.phase_name(21.0) == "Last Quarter"
    assert astro.phase_name(3.0) == "Waxing Crescent"
    assert astro.phase_name(27.5) == "New Moon"


def test_compute_day_sun_times_are_ordered_and_plausible_for_grenada() -> None:
    day = astro.compute_day(MBIA.latitude, MBIA.longitude, date(2026, 11, 9))
    assert day.civil_dawn_utc < day.sunrise_utc < day.sunset_utc < day.civil_dusk_utc
    sunrise = _local(day.sunrise_utc)
    sunset = _local(day.sunset_utc)
    assert sunrise.date() == date(2026, 11, 9)
    assert sunset.date() == date(2026, 11, 9)
    assert 5 <= sunrise.hour <= 6
    assert 17 <= sunset.hour <= 18
    assert day.sunrise_utc.tzinfo is UTC


def test_compute_day_moon_events_are_optional_and_utc() -> None:
    day = astro.compute_day(MBIA.latitude, MBIA.longitude, date(2026, 11, 9))
    for event in (day.moonrise_utc, day.moonset_utc):
        if event is not None:
            assert event.tzinfo is UTC
            # The event falls on the Grenada calendar day it is stored against.
            assert _local(event).date() == date(2026, 11, 9)
    assert day.moon_phase in astro.PHASE_NAMES


def test_moonrise_is_about_a_lunar_day_after_the_previous_one() -> None:
    """Sanity check: a moonrise recurs about 24 h 50 min later (not a published value)."""
    first = astro.compute_day(MBIA.latitude, MBIA.longitude, date(2026, 11, 9))
    second = astro.compute_day(MBIA.latitude, MBIA.longitude, date(2026, 11, 10))
    if first.moonrise_utc and second.moonrise_utc:
        gap = second.moonrise_utc - first.moonrise_utc
        assert timedelta(hours=24, minutes=30) <= gap <= timedelta(hours=25, minutes=30)


def test_year_covers_every_local_date_once() -> None:
    days = astro.year_days(2027)
    assert len(days) == 365
    assert days[0] == date(2027, 1, 1)
    assert days[-1] == date(2027, 12, 31)


def test_a_whole_year_computes_and_missing_moon_events_are_none() -> None:
    days = [
        astro.compute_day(MBIA.latitude, MBIA.longitude, day)
        for day in astro.year_days(2027)
    ]
    assert len(days) == 365
    for name in ("moonrise_utc", "moonset_utc"):
        events = [getattr(day, name) for day in days]
        missing = sum(1 for event in events if event is None)
        # About one day in a lunar month has no event here (13 a year in 2027).
        assert 5 <= missing <= 25, name
        present = [event for event in events if event is not None]
        gaps = [
            later - earlier
            for earlier, later in zip(present, present[1:], strict=False)
        ]
        # One event a lunar day apart (~24 h 50 min), or two when a day is skipped.
        for gap in gaps:
            assert timedelta(hours=22) <= gap <= timedelta(hours=28) or (
                timedelta(hours=46) <= gap <= timedelta(hours=54)
            ), (name, gap)


def test_locations_are_the_documented_grenada_points() -> None:
    assert set(LOCATIONS) == {"mbia", "lauriston"}
    assert LOCATIONS["mbia"].latitude == pytest.approx(12.0042, abs=1e-4)
    assert LOCATIONS["lauriston"].longitude == pytest.approx(-61.472, abs=1e-3)


#: Reference values from the US Naval Observatory API (aa.usno.navy.mil,
#: ``rstt/oneday`` at 12.00,-61.79, tz -4), committed once as a fixture. The
#: fixture is missing until someone with unrestricted access fetches it; the
#: skip reason is shown by pytest -rs. Never fetch from the network in tests.
USNO_FIXTURE = Path(__file__).parent / "fixtures" / "usno_oneday_grenada.json"


@pytest.mark.skipif(
    not USNO_FIXTURE.exists(),
    reason="USNO reference fixture not yet committed (see docs/operations/almanac-and-tides.md)",
)
def test_sun_and_moon_match_usno_within_tolerance() -> None:
    reference = json.loads(USNO_FIXTURE.read_text(encoding="utf-8"))
    for case in reference["days"]:
        day = date.fromisoformat(case["date"])
        computed = astro.compute_day(12.00, -61.79, day)
        for field in ("sunrise", "sunset"):
            expected = datetime.fromisoformat(case[field]).astimezone(UTC)
            actual = getattr(computed, f"{field}_utc")
            assert abs((actual - expected).total_seconds()) <= 120, (day, field)
        expected_phase_date = date.fromisoformat(case["phase_date"])
        dates = [
            found
            for key, found in astro.principal_phase_dates(day.year, day.year)
            if key == case["phase"]
        ]
        assert any(abs((d - expected_phase_date).days) <= 1 for d in dates), (
            day,
            case["phase"],
        )
