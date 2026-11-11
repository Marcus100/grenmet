"""Property-based tests for the eRegister's coded groups and humidity sums.

Example tests show known cases; these generate thousands of valid readings and
check rules that must hold for every one: a coded group decodes back to the
reading, humidity stays physical, a visibility code is always a real one.
Runs are derandomised so CI is reproducible; a failure prints the smallest
reading that breaks the rule, to copy into an example test.
"""

from decimal import ROUND_HALF_UP, Decimal
from math import isclose

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.eregister import derive, metar

PROPERTY = settings(max_examples=500, deadline=None, derandomize=True)

# Air temperature at a Caribbean station and its tenths, well beyond records.
temperatures = st.decimals(
    min_value=Decimal("-60.0"), max_value=Decimal("60.0"), places=1
)
# Station and sea-level pressure in tenths of hPa, inside the coded range.
pressures_hpa = st.decimals(
    min_value=Decimal("870.0"), max_value=Decimal("1085.0"), places=1
)


@PROPERTY
@given(temperatures)
def test_temperature_group_decodes_back_to_the_reading(celsius: Decimal) -> None:
    group = derive.temperature_group(float(celsius))
    assert len(group) == 4
    assert group[0] in "01"
    assert derive._tenths(group) == float(celsius)
    # Never "negative zero": 0.0 and -0.0 are both 0000.
    assert group != "1000"


@PROPERTY
@given(st.decimals(min_value=Decimal("-60.00"), max_value=Decimal("60.00"), places=2))
def test_temperature_group_rounds_half_away_from_zero(celsius: Decimal) -> None:
    tenths = abs(celsius).quantize(Decimal("0.1"), ROUND_HALF_UP)
    expected = float(-tenths if celsius < 0 else tenths)
    # Exact: a truncating encoder would fail on every .x5 to .x9 reading.
    assert derive._tenths(derive.temperature_group(float(celsius))) == expected


@PROPERTY
@given(pressures_hpa)
def test_pressure_group_decodes_back_to_the_reading(hpa: Decimal) -> None:
    group = derive.pressure_group(hpa)
    assert len(group) == 4
    assert group.isdigit()
    assert derive._group_hpa(group) == hpa


@PROPERTY
@given(st.floats(min_value=-40, max_value=50, allow_nan=False))
def test_magnus_formula_and_its_inverse_agree(celsius: float) -> None:
    vapour = derive.saturation_vapour_pressure_hpa(celsius)
    assert vapour > 0
    assert isclose(derive.dew_point_from_vapour_pressure(vapour), celsius, abs_tol=1e-9)


@PROPERTY
@given(
    st.floats(min_value=-30, max_value=50, allow_nan=False),
    st.integers(min_value=1, max_value=100),
)
def test_dew_point_never_exceeds_the_air_temperature(air: float, percent: int) -> None:
    dew = derive.dew_point_from_humidity(air, percent)
    assert dew <= round(air, 1)
    # Saturated air has its dew point at the air temperature.
    if percent == 100:
        assert abs(dew - air) <= 0.05 + 1e-9


@PROPERTY
@given(
    st.floats(min_value=-30, max_value=50, allow_nan=False),
    st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
)
def test_relative_humidity_is_the_vapour_ratio_as_a_percentage(
    air: float, ratio: float
) -> None:
    vapour = derive.saturation_vapour_pressure_hpa(air) * ratio
    percent = derive.relative_humidity_percent(air, vapour)
    # Half rounds up, like the entry screen: within one percent of the ratio.
    assert abs(percent - ratio * 100) <= 0.5 + 1e-9


@PROPERTY
@given(st.sampled_from([code for code in range(100) if not 51 <= code <= 55]))
def test_visibility_range_is_a_proper_interval_or_unused(code: int) -> None:
    span = metar.visibility_range_m(code)
    assert span is not None
    low, high = span
    assert 0 <= low < high


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        (80, (30_000.0, 35_000.0)),
        (81, (35_000.0, 40_000.0)),
        (87, (65_000.0, 70_000.0)),
        (88, (70_000.0, 70_100.0)),
        (89, (70_100.0, float("inf"))),
    ],
)
def test_coarse_visibility_codes_follow_code_table_4377(
    code: int, expected: tuple[float, float]
) -> None:
    assert metar.visibility_range_m(code) == expected
    assert metar.visibility_range_m(55) is None


@PROPERTY
@given(
    st.decimals(min_value=Decimal("0"), max_value=Decimal("999.9"), places=1),
    st.decimals(min_value=Decimal("0"), max_value=Decimal("999.9"), places=1),
)
def test_visibility_code_is_valid_and_never_falls_as_visibility_rises(
    first: Decimal, second: Decimal
) -> None:
    low_km, high_km = sorted((first, second))
    low_code = derive.visibility_code_from_km(low_km)
    high_code = derive.visibility_code_from_km(high_km)
    for code in (low_code, high_code):
        assert len(code) == 2
        assert code.isdigit()
        assert not 51 <= int(code) <= 55
    assert int(low_code) <= int(high_code)


def metar_visibility_m(km: Decimal) -> int:
    """ICAO Annex 3 METAR visibility: rounded down to 50 m below 800 m, 100 m below
    5 km, whole kilometres below 10 km, and 9999 from 10 km."""
    metres = int(km * 1000)
    if metres >= 10_000:
        return 9999
    step = 50 if metres < 800 else 100 if metres < 5000 else 1000
    return metres - metres % step


@PROPERTY
@given(st.decimals(min_value=Decimal("0"), max_value=Decimal("200"), places=1))
def test_the_metar_visibility_of_a_reading_is_allowed_by_its_synop_code(
    km: Decimal,
) -> None:
    """The METAR cross-check accepts what an observer would report for the reading."""
    code = int(derive.visibility_code_from_km(km))
    allowed = metar.visibility_values(code)
    assert allowed is not None
    assert metar_visibility_m(km) in allowed


@st.composite
def synop_readings(draw: st.DrawFn) -> dict[str, str]:
    """A plausible 78958 main-hour report: air, dew point, pressures, wind, visibility."""
    air = draw(st.integers(min_value=150, max_value=360))  # tenths of a degree
    dew = draw(st.integers(min_value=100, max_value=air))
    station = draw(st.integers(min_value=10_000, max_value=10_200))  # tenths of hPa
    # 78958 sea level is the station pressure plus 1.0 hPa (GMS rule).
    sea_level = station + 10
    direction = draw(st.integers(min_value=1, max_value=36))
    speed = draw(st.integers(min_value=1, max_value=40))
    visibility = draw(
        st.integers(min_value=10, max_value=89).filter(
            lambda code: not 51 <= code <= 55
        )
    )
    return {
        "air_temp": f"{air:03d}",
        "dew_point": f"{dew:03d}",
        "station_pressure": f"{station % 10_000:04d}",
        "msl_pressure": f"{sea_level % 10_000:04d}",
        "wind_dir": f"{direction:02d}",
        "wind_speed": f"{speed:02d}",
        "wind_gust": "",
        "visibility": f"{visibility:02d}",
    }


@settings(max_examples=200, deadline=None, derandomize=True)
@given(synop_readings())
def test_an_independent_decoder_reads_every_encoded_report_as_the_register_does(
    reading: dict[str, str],
) -> None:
    """Encode with the register, decode with pymetdecoder: both must agree."""
    from pymetdecoder import synop

    from src.eregister import encode, rules
    from tests.test_eregister_send import workbook

    book = workbook(**reading)
    _, ours = rules.validate_synop(book)
    other = synop.SYNOP().decode(encode.synop_tac(book))
    assert ours.air_temperature_k == pytest.approx(
        other["air_temperature"]["value"] + 273.15
    )
    assert ours.dew_point_k == pytest.approx(
        other["dewpoint_temperature"]["value"] + 273.15
    )
    assert ours.station_pressure_pa == pytest.approx(
        other["station_pressure"]["value"] * 100
    )
    assert ours.mean_sea_level_pressure_pa == pytest.approx(
        other["sea_level_pressure"]["value"] * 100
    )
    assert ours.wind_direction_deg == other["surface_wind"]["direction"]["value"]
    assert ours.wind_speed_ms == pytest.approx(
        other["surface_wind"]["speed"]["value"] * 1852 / 3600, abs=0.05
    )
    if reading["visibility"] == "89":
        # Over 70 km: pymetdecoder gives the 70 km bound ("isGreater"); BUFR
        # carries 81 900 m by WMO B/C1 regulation 1.4.2.2.2 (rules.py).
        assert other["visibility"]["quantifier"] == "isGreater"
        assert ours.visibility_m == pytest.approx(81_900)
    else:
        assert ours.visibility_m == pytest.approx(other["visibility"]["value"])
