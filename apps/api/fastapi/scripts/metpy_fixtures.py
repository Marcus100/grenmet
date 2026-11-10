"""MetPy oracle fixtures for the TypeScript met calculations.

MetPy is a fast-back dev dependency (never a runtime one). The TypeScript
functions cannot run MetPy, so this script writes the MetPy values as JSON that
the TypeScript tests read:

* ``apps/web/gms/src/lib/metpy-heat-index.fixture.json``: heat index (NWS
  Rothfusz with the low and high humidity adjustments) from ``metpy.calc``.
* ``apps/web/gaa-admin/src/components/wxproducts/metpy-humidity.fixture.json``:
  vapour pressure, dew point and relative humidity from dry bulb, wet bulb and
  station pressure, using the register's WMO psychrometer coefficient.

Run from ``apps/api/fastapi``::

    uv run --frozen --package fast-back python scripts/metpy_fixtures.py

``tests/test_eregister_metpy_oracle.py`` regenerates the fixtures in memory and
fails if the committed JSON is stale.
"""

import json
from pathlib import Path
from typing import Any

import numpy as np
from metpy.calc import (
    dewpoint,
    heat_index,
    psychrometric_vapor_pressure_wet,
    saturation_vapor_pressure,
)
from metpy.units import units

REPO_ROOT = Path(__file__).resolve().parents[4]
HEAT_INDEX_FIXTURE = REPO_ROOT / "apps/web/gms/src/lib/metpy-heat-index.fixture.json"
HUMIDITY_FIXTURE = (
    REPO_ROOT
    / "apps/web/gaa-admin/src/components/wxproducts/metpy-humidity.fixture.json"
)

# NWS heat index applies from 80 F (26.67 C); below that it is the air temperature.
HEAT_INDEX_MIN_F = 80
HEAT_INDEX_RELATIVE_HUMIDITY = (
    5,
    10,
    13,
    20,
    30,
    40,
    50,
    60,
    70,
    80,
    85,
    86,
    90,
    95,
    100,
)
HUMIDITY_PRESSURE_GROUPS = {"0000": 1000.0, "0100": 1010.0, "0200": 1020.0}
# Realistic for Grenada: relative humidity between 40 and 100 per cent.
REALISTIC_RH = (40.0, 100.0)
ROUNDING = 6


def wmo_psychrometer_coefficient(wet_c: float) -> float:
    """A(Tw) = 0.00066 (1 + 0.00115 Tw), per K: the register's WMO coefficient."""
    return 0.00066 * (1 + 0.00115 * wet_c)


def heat_index_points() -> list[dict[str, Any]]:
    """MetPy heat index where the NWS heat index applies (air temperature 80 F or more)."""
    points: list[dict[str, Any]] = []
    for tenths in range(260, 361, 5):
        air = tenths / 10
        if air * 9 / 5 + 32 < HEAT_INDEX_MIN_F:
            continue
        for rh in HEAT_INDEX_RELATIVE_HUMIDITY:
            value = heat_index(
                air * units.degC, rh * units.percent, mask_undefined=False
            )
            points.append(
                {
                    "airC": air,
                    "relativeHumidity": float(rh),
                    "heatIndexC": round(
                        float(np.asarray(value.to("degC").m).item()), ROUNDING
                    ),
                }
            )
    return points


def humidity_points() -> list[dict[str, Any]]:
    """Register inputs (tenths of a degree, pressure group) with MetPy's answer."""
    points: list[dict[str, Any]] = []
    for dry in range(180, 361, 20):
        for depression in range(0, 121, 20):
            wet = (dry - depression) / 10
            dry_c = dry / 10
            if wet < 0:
                continue
            for group, pressure in HUMIDITY_PRESSURE_GROUPS.items():
                vapour = psychrometric_vapor_pressure_wet(
                    pressure * units.hPa,
                    dry_c * units.degC,
                    wet * units.degC,
                    psychrometer_coefficient=wmo_psychrometer_coefficient(wet)
                    / units.kelvin,
                ).to("hPa")
                saturation = saturation_vapor_pressure(dry_c * units.degC).to("hPa")
                rh = float((100 * vapour / saturation).m)
                if not REALISTIC_RH[0] <= rh <= REALISTIC_RH[1]:
                    continue
                points.append(
                    {
                        "airTemp": f"{dry:03d}",
                        "wetBulb": f"{round(wet * 10):03d}",
                        "stationPressure": group,
                        "vapourHpa": round(float(vapour.m), ROUNDING),
                        "dewPointC": round(
                            float(dewpoint(vapour).to("degC").m), ROUNDING
                        ),
                        "relativeHumidity": round(rh, ROUNDING),
                    }
                )
    return points


def _document(source: str, points: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "source": source,
        "generatedBy": "apps/api/fastapi/scripts/metpy_fixtures.py",
        "points": points,
    }


def build_fixtures() -> dict[Path, dict[str, Any]]:
    """The two fixture documents keyed by the file they are written to."""
    return {
        HEAT_INDEX_FIXTURE: _document(
            "MetPy 1.7.1 metpy.calc.heat_index(mask_undefined=False), 80 F and above",
            heat_index_points(),
        ),
        HUMIDITY_FIXTURE: _document(
            "MetPy 1.7.1 psychrometric_vapor_pressure_wet with the WMO coefficient "
            "0.00066 (1 + 0.00115 Tw), dewpoint, saturation_vapor_pressure; "
            "relative humidity from realistic points (40 to 100 per cent)",
            humidity_points(),
        ),
    }


def write_fixtures() -> list[Path]:
    written = []
    for path, document in build_fixtures().items():
        path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        written.append(path)
    return written


if __name__ == "__main__":
    for written in write_fixtures():
        print(written)
