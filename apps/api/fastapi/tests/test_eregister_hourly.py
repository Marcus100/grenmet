"""Hour-to-hour warnings: this observation against the saved ones 1 and 3 hours before.

Pure checks on decoded SI values; the previous hours come from the register (see the
API test in ``test_eregister_persistence``). Nothing here may block saving, so every
issue is a warning. PAPER_ROW is 12 UTC: 28.0 C, dew point 21.3 C, 15 kt from 070,
station pressure 1015.3 hPa, visibility 18 km.
"""

import pytest

from src.eregister import hourly, rules
from src.eregister.schemas import SynopWorkbook
from tests.test_eregister_validation import PAPER_ROW


def workbook(**changes: str) -> SynopWorkbook:
    return SynopWorkbook.model_validate({**PAPER_ROW, **changes})


def codes(
    previous: dict[str, str] | None = None,
    earlier: dict[str, str] | None = None,
    limits: hourly.HourlyLimits | None = None,
    **now: str,
) -> set[str]:
    """Issue codes of the hour-to-hour checks for this hour with 1 h and 3 h history."""
    history: dict[int, SynopWorkbook] = {}
    if previous is not None:
        history[1] = workbook(time_utc="11", **previous)
    if earlier is not None:
        history[3] = workbook(time_utc="09", **earlier)
    issues, _ = rules.validate_synop(workbook(**now), None, history, limits)
    return {issue.code for issue in issues} & {
        "temperature_jump",
        "dew_point_jump",
        "wind_speed_jump",
        "wind_direction_jump",
        "visibility_drop",
        "tendency_vs_pressure",
    }


def test_without_history_there_is_nothing_to_compare() -> None:
    assert codes() == set()
    assert codes(previous=None, earlier=None) == set()


@pytest.mark.parametrize(
    ("before", "warns"),
    [("220", True), ("230", True), ("231", False), ("250", False), ("350", True)],
)
def test_air_temperature_step(before: str, warns: bool) -> None:
    # Now 28.0 C: 22.0 and 35.0 differ by 6 and 7, 23.0 by exactly 5 (the limit).
    assert ("temperature_jump" in codes(previous={"air_temp": before})) is warns


def test_dew_point_step() -> None:
    assert "dew_point_jump" in codes(previous={"dew_point": "150"})  # 15.0 -> 21.3
    assert "dew_point_jump" not in codes(previous={"dew_point": "180"})  # 3.3


@pytest.mark.parametrize(
    ("before", "warns"), [("35", True), ("31", True), ("30", False), ("25", False)]
)
def test_wind_speed_step(before: str, warns: bool) -> None:
    # Now 15 kt = 7.7 m/s. 35 kt = 18.0 m/s (change 10.3); 31 kt = 15.9 (8.2, over the
    # 8 m/s limit); 30 kt = 15.4 (7.7, under it); 25 kt = 12.9 (5.1).
    assert ("wind_speed_jump" in codes(previous={"wind_speed": before})) is warns


@pytest.mark.parametrize(
    ("before_dir", "before_speed", "warns"),
    [
        ("25", "12", True),  # 250 against 070: 180 degrees at 6 m/s
        ("16", "12", True),  # 160 against 070: 90 degrees, the limit
        ("12", "12", False),  # 120: 50 degrees
        ("25", "05", False),  # light wind before (2.6 m/s): not compared
        ("99", "12", False),  # variable direction before
    ],
)
def test_wind_direction_step(before_dir: str, before_speed: str, warns: bool) -> None:
    issues = codes(previous={"wind_dir": before_dir, "wind_speed": before_speed})
    assert ("wind_direction_jump" in issues) is warns


def test_wind_direction_steps_wrap_around_north() -> None:
    # 350 and 030 are 40 degrees apart, not 320.
    issues = codes(
        previous={"wind_dir": "03", "wind_speed": "15"}, wind_dir="35", wind_speed="15"
    )
    assert "wind_direction_jump" not in issues


@pytest.mark.parametrize(
    ("ww", "visibility", "warns"),
    [
        ("00", "09", True),  # 18 km -> 900 m with clear weather
        ("45", "09", False),  # fog explains it
        ("61", "09", False),  # rain explains it
        ("06", "09", False),  # haze
        ("00", "10", False),  # 1000 m is not under the limit
        ("00", "50", False),  # a small drop that stays above the limit
    ],
)
def test_a_visibility_drop_needs_weather_that_explains_it(
    ww: str, visibility: str, warns: bool
) -> None:
    issues = codes(previous={"visibility": "68"}, present_wx=ww, visibility=visibility)
    assert ("visibility_drop" in issues) is warns


@pytest.mark.parametrize(
    ("tendency", "change", "warns"),
    [
        ("2", "010", False),  # rising 1.0 hPa as measured
        ("2", "014", False),  # within the 0.5 hPa tolerance
        ("2", "030", True),  # keyed 3.0, measured 1.0
        ("7", "010", True),  # keyed falling 1.0, measured rising 1.0
        ("4", "000", True),  # keyed steady, measured +1.0
        ("0", "010", False),  # increasing then decreasing, the same or higher
        ("5", "010", True),  # same or lower, measured higher
    ],
)
def test_station_pressure_change_agrees_with_the_keyed_tendency(
    tendency: str, change: str, warns: bool
) -> None:
    issues = codes(
        earlier={"station_pressure": "0143"},
        pressure_tendency=tendency,
        pressure_change=change,
    )
    assert ("tendency_vs_pressure" in issues) is warns


def test_steady_pressure_agrees_with_tendency_4() -> None:
    issues = codes(
        earlier={"station_pressure": "0153"},
        pressure_tendency="4",
        pressure_change="000",
    )
    assert "tendency_vs_pressure" not in issues


def test_each_check_uses_only_its_own_hour() -> None:
    # A 3 h comparison does not need the previous hour, and the reverse.
    assert "temperature_jump" not in codes(earlier={"air_temp": "200"})
    assert "tendency_vs_pressure" not in codes(
        previous={"station_pressure": "0100"},
        pressure_tendency="2",
        pressure_change="010",
    )


def test_missing_values_in_the_history_are_skipped() -> None:
    previous = {"air_temp": "", "dew_point": "", "wind_speed": "", "visibility": ""}
    assert codes(previous=previous) == set()


def test_custom_limits_replace_the_defaults() -> None:
    wide = hourly.HourlyLimits(air_temperature_step_c=20.0)
    assert "temperature_jump" not in codes(previous={"air_temp": "220"}, limits=wide)
    tight = hourly.HourlyLimits(air_temperature_step_c=1.0)
    assert "temperature_jump" in codes(previous={"air_temp": "260"}, limits=tight)


def test_hour_to_hour_issues_are_warnings_and_never_invalidate() -> None:
    issues, _ = rules.validate_synop(
        workbook(), None, {1: workbook(time_utc="11", air_temp="200")}
    )
    jumps = [i for i in issues if i.code == "temperature_jump"]
    assert [i.severity for i in jumps] == ["warning"]
    assert jumps[0].field == "air_temp"
    assert not [i for i in issues if i.severity == "error"]


def test_a_nil_report_gets_no_hour_to_hour_advice() -> None:
    nil = SynopWorkbook.model_validate(
        {k: v for k, v in PAPER_ROW.items() if k in rules.IDENTIFICATION}
    )
    issues, _ = rules.validate_synop(nil, None, {1: workbook(time_utc="11")})
    assert not [i for i in issues if i.code == "temperature_jump"]
