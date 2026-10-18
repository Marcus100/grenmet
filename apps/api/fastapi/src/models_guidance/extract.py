"""Point extraction from GRIB files and conversion to API series.

Sync and CPU/disk bound: callers run it in a thread. ecCodes is read directly
(not through cfgrib/xarray) because GFS carries several overlapping APCP
accumulation windows per file; cfgrib merges messages by step and cannot keep
the ``startStep``/``endStep`` pair that the precipitation maths needs.
"""

import importlib
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import cache
from pathlib import Path
from types import ModuleType

from .config import GuidancePoint


@cache
def _eccodes() -> ModuleType:
    """Load ecCodes on first use, never at API start-up.

    ecCodes preloads eckitlib's own PROJ copy. If that happens before pyproj
    binds its PROJ wheel (gms_ingest imports pyproj first for this reason), the
    heap is corrupted at interpreter shutdown and the process aborts even though
    every call succeeded. Bind pyproj first when it is installed, then ecCodes.
    """
    try:
        importlib.import_module("pyproj")
    except ImportError:
        pass
    return importlib.import_module("eccodes")


#: GRIB shortName -> canonical field.
_SHORT_NAMES: dict[str, str] = {
    "2t": "t2m",
    "10u": "u10",
    "10v": "v10",
    "10fg": "gust",
    "i10fg": "gust",
    "gust": "gust",
    "msl": "mslp",
    "prmsl": "mslp",
    "tcc": "cloud",
    "tp": "precip",
}

#: Multiply the GRIB value to reach API units (after any offset below).
_SCALE: dict[str, dict[str, float]] = {
    # ECMWF: tp in metres, cloud as a 0-1 fraction. GFS: tp in kg/m2 (= mm), cloud in %.
    "ifs": {"precip": 1000.0, "cloud": 100.0},
    "aifs": {"precip": 1000.0, "cloud": 100.0},
    "gfs": {},
}

_KELVIN = 273.15


@dataclass
class Readings:
    """Raw fields for every point: ``instant[field][end_step][point]`` and
    ``accum[(start_step, end_step)][point]``; plus the run and valid times."""

    run_time: datetime | None = None
    valid_times: dict[int, datetime] = field(default_factory=dict)
    instant: dict[str, dict[int, dict[str, float]]] = field(
        default_factory=lambda: defaultdict(dict)
    )
    accum: dict[tuple[int, int], dict[str, float]] = field(default_factory=dict)

    def merge(self, other: Readings) -> None:
        self.run_time = self.run_time or other.run_time
        self.valid_times.update(other.valid_times)
        for name, steps in other.instant.items():
            self.instant[name].update(steps)
        self.accum.update(other.accum)


def _parse_time(date: int, hhmm: int) -> datetime:
    return datetime(date // 10000, date // 100 % 100, date % 100) + timedelta(
        hours=hhmm // 100, minutes=hhmm % 100
    )


def read_points(path: Path, points: list[GuidancePoint], model: str) -> Readings:
    """Nearest-grid-point values of every recognised message in ``path``."""
    scale = _SCALE.get(model, {})
    out = Readings()
    with path.open("rb") as handle:
        while (message := _eccodes().codes_grib_new_from_file(handle)) is not None:
            try:
                _read_message(message, points, scale, out)
            finally:
                _eccodes().codes_release(message)
    return out


def _read_message(
    message: int, points: list[GuidancePoint], scale: dict[str, float], out: Readings
) -> None:
    name = _SHORT_NAMES.get(str(_eccodes().codes_get(message, "shortName")))
    if name is None:
        return
    start = int(_eccodes().codes_get(message, "startStep"))
    end = int(_eccodes().codes_get(message, "endStep"))
    run = _parse_time(
        int(_eccodes().codes_get(message, "dataDate")),
        int(_eccodes().codes_get(message, "dataTime")),
    )
    out.run_time = out.run_time or run
    out.valid_times[end] = run + timedelta(hours=end)
    first_lon = float(
        _eccodes().codes_get(message, "longitudeOfFirstGridPointInDegrees")
    )
    factor = scale.get(name, 1.0)
    values: dict[str, float] = {}
    for point in points:
        lon = point.longitude if first_lon < 0 else point.longitude % 360.0
        nearest = _eccodes().codes_grib_find_nearest(message, point.latitude, lon)[0]
        value = float(nearest.value)
        if math.isnan(value) or value >= 1e20:  # GRIB missing-value sentinel
            continue
        values[point.key] = value * factor
    if name == "precip":
        out.accum[(start, end)] = values
    else:
        out.instant[name][end] = values


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def _interval_precip(
    accum: dict[tuple[int, int], dict[str, float]], prev: int, step: int, key: str
) -> float | None:
    """Precipitation over ``(prev, step]`` from whichever windows are present.

    ECMWF windows all start at 0 (difference of totals). GFS adds 3-6, 9-12 ...
    windows next to 0-6, 6-12 ... ones, so any shared start step works.
    """
    window = accum.get((prev, step), {}).get(key)
    if window is not None:
        return max(window, 0.0)
    for (start, end), values in accum.items():
        if end != step or start >= prev:
            continue
        earlier = accum.get((start, prev), {}).get(key)
        if earlier is not None and key in values:
            return max(values[key] - earlier, 0.0)
    return None


def build_series(
    readings: Readings, points: list[GuidancePoint]
) -> dict[str, dict[str, list[object]]]:
    """Per point ``{"valid_times": [iso...], variable: [value|None...]}``."""
    steps = sorted(set(readings.valid_times) & _instant_steps(readings))
    result: dict[str, dict[str, list[object]]] = {}
    for point in points:
        key = point.key
        series: dict[str, list[object]] = {
            "valid_times": [
                readings.valid_times[s].strftime("%Y-%m-%dT%H:%M:%SZ") for s in steps
            ],
            "temperature_c": [],
            "wind_speed_ms": [],
            "wind_direction_deg": [],
            "wind_gust_ms": [],
            "precipitation_mm": [],
            "mslp_hpa": [],
            "cloud_cover_pct": [],
        }
        previous: int | None = None
        for step in steps:
            temp = readings.instant["t2m"].get(step, {}).get(key)
            u = readings.instant["u10"].get(step, {}).get(key)
            v = readings.instant["v10"].get(step, {}).get(key)
            mslp = readings.instant["mslp"].get(step, {}).get(key)
            series["temperature_c"].append(
                _round(None if temp is None else temp - _KELVIN)
            )
            if u is None or v is None:
                series["wind_speed_ms"].append(None)
                series["wind_direction_deg"].append(None)
            else:
                series["wind_speed_ms"].append(_round(math.hypot(u, v)))
                # Meteorological direction: where the wind blows from.
                series["wind_direction_deg"].append(
                    round((270.0 - math.degrees(math.atan2(v, u))) % 360.0)
                )
            series["wind_gust_ms"].append(
                _round(readings.instant["gust"].get(step, {}).get(key))
            )
            series["precipitation_mm"].append(
                None
                if previous is None
                else _round(_interval_precip(readings.accum, previous, step, key))
            )
            series["mslp_hpa"].append(_round(None if mslp is None else mslp / 100.0))
            series["cloud_cover_pct"].append(
                _round(readings.instant["cloud"].get(step, {}).get(key), 0)
            )
            previous = step
        result[key] = series
    return result


def _instant_steps(readings: Readings) -> set[int]:
    return set(readings.instant.get("t2m", {}))
