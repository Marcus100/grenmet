"""MetPy as the oracle for the register's meteorological formulas.

MetPy 1.7.1 is a dev dependency of fast-back and never a runtime one: the image
stays free of scipy, matplotlib and pint. Each formula the register keeps is
compared with MetPy on realistic Grenada values (air 18-36 C, wet bulb 0-12 K
below air, pressure 1000-1020 hPa, relative humidity 40-100 per cent).

Where the register differs on purpose, the tolerance is stated and the reason
given in the test. Measured maxima on this grid are noted for each tolerance.
"""

import importlib.util
import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from metpy.calc import (
    dewpoint,
    dewpoint_from_relative_humidity,
    psychrometric_vapor_pressure_wet,
    relative_humidity_from_dewpoint,
    saturation_vapor_pressure,
)
from metpy.units import units

from src.eregister import derive, metar, public, rules
from src.wxproducts import units as wx_units

# Measured on the grid (see the audit): vapour pressure 0.100 hPa, dew point 0.076 C,
# relative humidity 0.57 points. The register uses the Magnus constants 6.1094,
# 17.625 and 243.04 over water; MetPy uses Bolton's 6.112, 17.67 and 243.5.
# The saturation constants account for all of it: the psychrometer equation is the same.
VAPOUR_TOLERANCE_HPA = 0.15
DEW_POINT_TOLERANCE_C = 0.1
# The register works in whole percent (a half rounds up): 0.6 points from the
# constants plus at most half a point of rounding.
RELATIVE_HUMIDITY_TOLERANCE = 1.1
# 9UUU dew points are measured at 0.103 C; the same saturation difference.
DEW_FROM_RH_TOLERANCE_C = 0.15
# public.humidity works from the dew point, with Magnus constants 17.62 and 243.12 (WMO).
PUBLIC_HUMIDITY_TOLERANCE = 1.1
# Wind factors: measured at 2.3 parts per million at most.
UNIT_FACTOR_RELATIVE_TOLERANCE = 1e-5

FIXTURE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "metpy_fixtures.py"


def wmo_coefficient(wet_c: float) -> float:
    """The register's psychrometer coefficient A(Tw), per K."""
    return 0.00066 * (1 + 0.00115 * wet_c)


def _tenths(value: float) -> str:
    return f"{round(value * 10):03d}"


def _realistic_grid() -> Iterator[tuple[float, float, str, float]]:
    """(air C, wet bulb C, station pressure group, pressure hPa) where RH is 40-100 %."""
    for dry_tenths in range(180, 361, 10):
        dry = dry_tenths / 10
        for depression_tenths in range(0, 121, 10):
            wet = (dry_tenths - depression_tenths) / 10
            for group, pressure in (
                ("0000", 1000.0),
                ("0050", 1005.0),
                ("0100", 1010.0),
                ("0150", 1015.0),
                ("0200", 1020.0),
            ):
                values = {
                    "air_temp": _tenths(dry),
                    "wet_bulb": _tenths(wet),
                    "station_pressure": group,
                }
                if derive.humidity_from_workbook(values) is None:
                    continue
                yield dry, wet, group, pressure


def _metpy_wet_bulb(
    dry: float, wet: float, pressure: float, coefficient: float | None
) -> float:
    """MetPy vapour pressure (hPa) from the psychrometer equation."""
    kwargs = {}
    if coefficient is not None:
        kwargs["psychrometer_coefficient"] = coefficient / units.kelvin
    return float(
        psychrometric_vapor_pressure_wet(
            pressure * units.hPa, dry * units.degC, wet * units.degC, **kwargs
        )
        .to("hPa")
        .m
    )


def _metpy_saturation(celsius: float) -> float:
    return float(saturation_vapor_pressure(celsius * units.degC).to("hPa").m)


def test_vapour_pressure_is_the_metpy_psychrometer_equation() -> None:
    worst = 0.0
    for dry, wet, group, pressure in _realistic_grid():
        expected = _metpy_wet_bulb(dry, wet, pressure, wmo_coefficient(wet))
        values = {
            "air_temp": _tenths(dry),
            "wet_bulb": _tenths(wet),
            "station_pressure": group,
        }
        result = derive.humidity_from_workbook(values)
        assert result is not None
        worst = max(worst, abs(result[1] - expected))
    assert worst <= VAPOUR_TOLERANCE_HPA


def test_dew_point_from_wet_bulb_matches_metpy() -> None:
    for dry, wet, group, pressure in _realistic_grid():
        values = {
            "air_temp": _tenths(dry),
            "wet_bulb": _tenths(wet),
            "station_pressure": group,
        }
        result = derive.humidity_from_workbook(values)
        assert result is not None
        vapour = _metpy_wet_bulb(dry, wet, pressure, wmo_coefficient(wet))
        expected = float(dewpoint(vapour * units.hPa).to("degC").m)
        assert result[0] == pytest.approx(expected, abs=DEW_POINT_TOLERANCE_C)


def test_relative_humidity_from_wet_bulb_matches_metpy_to_whole_percent() -> None:
    for dry, wet, group, pressure in _realistic_grid():
        values = {
            "air_temp": _tenths(dry),
            "wet_bulb": _tenths(wet),
            "station_pressure": group,
        }
        result = derive.humidity_from_workbook(values)
        assert result is not None
        vapour = _metpy_wet_bulb(dry, wet, pressure, wmo_coefficient(wet))
        expected = 100 * vapour / _metpy_saturation(dry)
        assert abs(result[2] - expected) <= RELATIVE_HUMIDITY_TOLERANCE


def test_the_register_keeps_the_wmo_coefficient_not_the_metpy_default() -> None:
    # MetPy's default psychrometer coefficient is a constant 6.21e-4 per K. The
    # register follows WMO-No. 8 (0.00066 (1 + 0.00115 Tw)), which makes the
    # psychrometer term depend on the wet bulb. The two differ by more than a
    # point of humidity at the warm, humid end of the grid, so the choice is pinned.
    largest = 0.0
    for dry, wet, group, pressure in _realistic_grid():
        values = {
            "air_temp": _tenths(dry),
            "wet_bulb": _tenths(wet),
            "station_pressure": group,
        }
        result = derive.humidity_from_workbook(values)
        assert result is not None
        default = _metpy_wet_bulb(dry, wet, pressure, None)
        expected = 100 * default / _metpy_saturation(dry)
        largest = max(largest, abs(result[2] - expected))
    assert largest > 1.0


def test_dew_point_from_a_9uuu_humidity_matches_metpy() -> None:
    for air in range(180, 361, 10):
        for percent in range(40, 101, 5):
            ours = derive.dew_point_from_humidity(air / 10, percent)
            expected = float(
                dewpoint_from_relative_humidity(
                    air / 10 * units.degC, percent * units.percent
                )
                .to("degC")
                .m
            )
            assert ours == pytest.approx(expected, abs=DEW_FROM_RH_TOLERANCE_C)


def test_public_humidity_from_dew_point_matches_metpy() -> None:
    for air in range(180, 361, 10):
        air_c = air / 10
        for dew_tenths in range(air - 120, air + 1, 5):
            dew_c = dew_tenths / 10
            ours = public.humidity(air_c, dew_c)
            assert ours is not None
            expected = float(
                relative_humidity_from_dewpoint(air_c * units.degC, dew_c * units.degC)
                .to("percent")
                .m
            )
            assert abs(ours - expected) <= PUBLIC_HUMIDITY_TOLERANCE


def test_public_and_register_relative_humidity_agree_to_a_point() -> None:
    # Both read a dew point and an air temperature; their constants differ slightly.
    for air in range(180, 361, 10):
        air_c = air / 10
        for dew_tenths in range(air - 120, air + 1, 5):
            dew_c = dew_tenths / 10
            public_rh = public.humidity(air_c, dew_c)
            register_rh = derive.relative_humidity_percent(
                air_c, derive.saturation_vapour_pressure_hpa(dew_c)
            )
            assert public_rh is not None
            assert abs(public_rh - register_rh) <= 1


@pytest.mark.parametrize(
    ("ours", "metpy_factor"),
    [
        (wx_units.KNOT_IN["mph"], (1 * units.knot).to("mph").m),
        (wx_units.KNOT_IN["km/h"], (1 * units.knot).to("km/h").m),
        (wx_units.KNOT_IN["m/s"], (1 * units.knot).to("m/s").m),
        (rules.KNOT_MS, (1 * units.knot).to("m/s").m),
        (metar.KNOTS_PER_MS, (1 * units("m/s")).to("knot").m),
    ],
)
def test_knot_factors_match_pint(ours: float, metpy_factor: float) -> None:
    assert ours == pytest.approx(metpy_factor, rel=UNIT_FACTOR_RELATIVE_TOLERANCE)


def test_committed_metpy_fixtures_are_current() -> None:
    spec = importlib.util.spec_from_file_location("metpy_fixtures", FIXTURE_SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for path, document in module.build_fixtures().items():
        assert json.loads(path.read_text(encoding="utf-8")) == document, (
            f"{path.name} is stale: run scripts/metpy_fixtures.py"
        )
