import math
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest
from conftest import GOES19

from gnc_collector.goes import CARIBBEAN, Area, crop_window, parse_name, scan_angles


def test_parse_name_reads_band_satellite_and_scan_start() -> None:
    scan = parse_name(
        Path(
            "OR_ABI-L2-CMIPF-M6C13_G19_s20262991200212_e20262991209532_c20262991210011.nc"
        )
    )
    assert scan is not None
    assert (scan.band, scan.satellite, scan.scene) == (13, 19, "F")
    # Day-of-year 299 in 2026 is 26 October.
    assert scan.scan_start == datetime(2026, 10, 26, 12, 0, 21, tzinfo=UTC)


@pytest.mark.parametrize(
    "name",
    [
        "OR_ABI-L1b-RadF-M6C13_G19_s20262991200212_e20262991209532_c20262991210011.nc",
        "OR_ABI-L2-CMIPF-M6C13_G19_s20262991200212.nc",
        "readme.txt",
    ],
)
def test_parse_name_ignores_other_files(name: str) -> None:
    assert parse_name(Path(name)) is None


def test_sub_satellite_point_is_the_grid_origin() -> None:
    x, y = scan_angles(GOES19, 0.0, GOES19.lon0)
    assert x == pytest.approx(0.0, abs=1e-12)
    assert y == pytest.approx(0.0, abs=1e-12)


def test_scan_angles_match_the_product_user_guide_example() -> None:
    # PUG volume 3, section 5.1.2.8.2: 33.846162 N, 84.690932 W seen from
    # GOES-East at 75 W gives x = -0.024052 rad, y = 0.095340 rad.
    east = GOES19.__class__(GOES19.semi_major, GOES19.semi_minor, GOES19.height, -75.0)
    x, y = scan_angles(east, 33.846162, -84.690932)
    assert x == pytest.approx(-0.024052, abs=1e-6)
    assert y == pytest.approx(0.095340, abs=1e-6)


def test_north_and_east_increase_the_scan_angles() -> None:
    x0, y0 = scan_angles(GOES19, 12.0, -62.0)
    x1, y1 = scan_angles(GOES19, 13.0, -61.0)
    assert x1 > x0 and y1 > y0
    assert math.isfinite(x1) and math.isfinite(y1)


def test_crop_window_selects_only_the_area() -> None:
    x = np.linspace(-0.15, 0.15, 3001)
    y = np.linspace(0.15, -0.15, 3001)
    rows, columns = crop_window(GOES19, x, y, CARIBBEAN)
    assert 0 < rows.start < rows.stop < y.size
    assert 0 < columns.start < columns.stop < x.size
    # The Caribbean is east of 75.2 W and north of the equator.
    assert x[columns.start] > 0 and y[rows.stop - 1] > 0


def test_crop_window_rejects_an_area_off_the_disk() -> None:
    x = np.linspace(-0.01, 0.01, 11)
    with pytest.raises(ValueError, match="outside"):
        crop_window(GOES19, x, x[::-1], Area("far", "Far", 100, 110, 40, 50))
