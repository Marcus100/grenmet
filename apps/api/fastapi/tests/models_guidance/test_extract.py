"""Point extraction from synthetic GRIB files and series building."""

from pathlib import Path

import pytest

from src.models_guidance import extract
from src.models_guidance.config import GuidancePoint

from .grib import write_grib

POINTS = [
    GuidancePoint(key="mbia", name="MBIA", latitude=12.004, longitude=-61.786),
    GuidancePoint(
        key="lauriston", name="Lauriston", latitude=12.476, longitude=-61.472
    ),
]


def test_ecmwf_style_file_becomes_a_series(tmp_path: Path):
    path = write_grib(
        tmp_path / "ifs.grib2",
        [
            {"step": 0, "temp_k": 300.15, "gust": 8.0, "accumulations": ((0, 0.0),)},
            {"step": 3, "temp_k": 301.15, "gust": 9.0, "accumulations": ((0, 0.002),)},
            {"step": 6, "temp_k": 299.15, "gust": 7.5, "accumulations": ((0, 0.005),)},
        ],
    )
    readings = extract.read_points(path, POINTS, "ifs")
    series = extract.build_series(readings, POINTS)["mbia"]

    assert series["valid_times"] == [
        "2026-10-18T00:00:00Z",
        "2026-10-18T03:00:00Z",
        "2026-10-18T06:00:00Z",
    ]
    assert series["temperature_c"] == [27.0, 28.0, 26.0]
    # u=3 (eastward), v=4 (northward): 5 m/s blowing from 217 degrees (SSW).
    assert series["wind_speed_ms"] == [5.0, 5.0, 5.0]
    assert series["wind_direction_deg"] == [217, 217, 217]
    assert series["wind_gust_ms"] == [8.0, 9.0, 7.5]
    # Totals in metres become per-interval millimetres; step 0 has no interval.
    assert series["precipitation_mm"] == [None, 2.0, 3.0]
    assert series["mslp_hpa"] == [1015.0, 1015.0, 1015.0]
    assert series["cloud_cover_pct"] == [50.0, 50.0, 50.0]
    assert readings.run_time is not None
    assert readings.run_time.isoformat() == "2026-10-18T00:00:00"


def test_every_point_is_extracted(tmp_path: Path):
    path = write_grib(tmp_path / "f.grib2", [{"step": 0, "temp_k": 290.0}])
    series = extract.build_series(extract.read_points(path, POINTS, "ifs"), POINTS)
    assert set(series) == {"mbia", "lauriston"}


def test_gfs_overlapping_accumulation_windows(tmp_path: Path):
    """GFS ships 0-6 and 3-6 windows together; 3-hour amounts come from either."""
    path = write_grib(
        tmp_path / "gfs.grib2",
        [
            {"step": 0, "temp_k": 300.0, "cloud": 40.0},
            {"step": 3, "temp_k": 300.0, "accumulations": ((0, 1.0),)},
            {"step": 6, "temp_k": 300.0, "accumulations": ((0, 4.0), (3, 3.0))},
            {"step": 9, "temp_k": 300.0, "accumulations": ((6, 2.0),)},
            {"step": 12, "temp_k": 300.0, "accumulations": ((6, 5.0),)},
        ],
    )
    readings = extract.read_points(path, POINTS, "gfs")
    series = extract.build_series(readings, POINTS)["mbia"]
    # GFS tp is already kg/m2 (mm); 9-12 is missing the 9-12 window and 6-9
    # exists, so 12 is the 6-12 total minus 6-9.
    assert series["precipitation_mm"] == [None, 1.0, 3.0, 2.0, 3.0]
    # GFS cloud cover is already a percentage (no x100 as for ECMWF fractions).
    assert series["cloud_cover_pct"][0] == 40.0
    assert series["wind_gust_ms"] == [None] * 5


def test_unrecognised_messages_are_ignored(tmp_path: Path):
    path = tmp_path / "x.grib2"
    path.write_bytes(b"")
    readings = extract.read_points(path, POINTS, "ifs")
    assert extract.build_series(readings, POINTS)["mbia"]["valid_times"] == []


@pytest.mark.parametrize(
    ("u", "v", "expected"),
    [(0.0, -5.0, 0), (-5.0, 0.0, 90), (0.0, 5.0, 180), (5.0, 0.0, 270)],
)
def test_wind_direction_is_where_the_wind_comes_from(tmp_path: Path, u, v, expected):
    path = write_grib(
        tmp_path / "w.grib2", [{"step": 0, "temp_k": 300.0, "u": u, "v": v}]
    )
    series = extract.build_series(extract.read_points(path, POINTS, "ifs"), POINTS)
    assert series["mbia"]["wind_direction_deg"] == [expected]
