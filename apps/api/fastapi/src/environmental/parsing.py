"""Pure xarray parsing for Copernicus Marine and CAMS datasets (no network).

xarray and numpy are imported inside functions so importing the API (or the
worker health probe) does not pay for them.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from .points import Point

if TYPE_CHECKING:
    import xarray as xr

Row = dict[str, Any]

# Wave product variables and the output key for each.
WAVE_VARIABLES: dict[str, str] = {
    "VHM0": "wave_height_m",
    "VHM0_SW1": "swell_height_m",
    "VTM01_SW1": "swell_period_s",
    "VMDR_SW1": "swell_direction_deg",
}
SST_VARIABLE = "thetao"
# One UV index unit is 25 mW/m2 of erythemal irradiance.
UVI_WATTS_PER_UNIT = 0.025
UVBED_NAMES = ("uvbed", "uv_biologically_effective_dose")
DUST_AOD_NAMES = ("duaod550", "dust_aerosol_optical_depth_550nm")
_HORIZONTAL = ("time", "latitude", "longitude")


class ParseError(ValueError):
    """The dataset does not have the shape this domain expects."""


def _iso(value: Any) -> str:
    import pandas as pd

    stamp = pd.Timestamp(value)
    stamp = stamp.tz_localize(UTC) if stamp.tzinfo is None else stamp.tz_convert(UTC)
    return str(stamp.strftime("%Y-%m-%dT%H:%M:%SZ"))


def _num(value: Any, digits: int) -> float | None:
    number = float(value)
    return None if math.isnan(number) else round(number, digits)


def _first_name(ds: xr.Dataset, names: tuple[str, ...]) -> str:
    for name in names:
        if name in ds.data_vars:
            return name
    raise ParseError(f"none of {names} in dataset variables {list(ds.data_vars)}")


def _drop_extra_dims(da: xr.DataArray, keep: tuple[str, ...]) -> xr.DataArray:
    """Select index 0 of every dimension that is not time or horizontal."""
    for dim in list(da.dims):
        if dim not in keep:
            da = da.isel({str(dim): 0})
    return da


def _nearest_valid_cell(da: xr.DataArray, lat: float, lon: float) -> xr.DataArray:
    """Series (over time) of the nearest grid cell that has data.

    Ocean models mask land, so the exact nearest cell of a coastal point can be
    empty; take the closest cell with any value.
    """
    import numpy as np

    valid = da.notnull().any("time").values
    if not valid.any():
        raise ParseError("no valid cell in the requested box")
    lats = da["latitude"].values
    lons = da["longitude"].values
    dist = (lats[:, None] - lat) ** 2 + (
        (lons[None, :] - lon) * math.cos(math.radians(lat))
    ) ** 2
    dist = np.where(valid, dist, np.inf)
    i, j = np.unravel_index(int(np.argmin(dist)), dist.shape)
    return da.isel(latitude=int(i), longitude=int(j))


def parse_marine(
    waves: xr.Dataset,
    sst: xr.Dataset | None,
    points: tuple[Point, ...],
    *,
    start: datetime,
    end: datetime,
) -> dict[str, list[Row]]:
    """Per-point rows on the wave time axis: waves, swell and sea surface temperature."""
    import pandas as pd

    lo = pd.Timestamp(start.replace(tzinfo=None))
    hi = pd.Timestamp(end.replace(tzinfo=None))
    result: dict[str, list[Row]] = {}
    for point in points:
        columns: dict[str, pd.Series] = {}
        for name, key in WAVE_VARIABLES.items():
            if name not in waves.data_vars:
                raise ParseError(f"wave variable {name} missing")
            da = _drop_extra_dims(waves[name], _HORIZONTAL)
            columns[key] = _nearest_valid_cell(da, point.lat, point.lon).to_series()
        frame = pd.DataFrame(columns)
        if sst is not None and SST_VARIABLE in sst.data_vars:
            da = _drop_extra_dims(sst[SST_VARIABLE], _HORIZONTAL)
            series = _nearest_valid_cell(da, point.lat, point.lon).to_series()
            frame["sea_surface_temp_c"] = series.reindex(
                frame.index,
                method="nearest",
                tolerance=pd.Timedelta(hours=1, minutes=30),
            )
        else:
            frame["sea_surface_temp_c"] = float("nan")
        frame = frame[(frame.index >= lo) & (frame.index <= hi)].dropna(how="all")
        rows: list[Row] = []
        for stamp, values in frame.iterrows():
            row: Row = {"time": _iso(stamp)}
            for key in (*WAVE_VARIABLES.values(), "sea_surface_temp_c"):
                row[key] = _num(values[key], 0 if key == "swell_direction_deg" else 2)
            rows.append(row)
        result[point.id] = rows
    return result


def _reference_time(ds: xr.Dataset) -> Any:
    import pandas as pd

    name = (
        "forecast_reference_time"
        if "forecast_reference_time" in ds.variables
        else "time"
    )
    if name not in ds.variables:
        raise ParseError("forecast reference time missing")
    return pd.Timestamp(ds[name].values.reshape(-1)[0])


def cams_issued_at(ds: xr.Dataset) -> datetime:
    stamp: datetime = _reference_time(ds).to_pydatetime()
    return stamp.replace(tzinfo=UTC)


def _cams_valid_times(ds: xr.Dataset, step_dim: str) -> list[Any]:
    import pandas as pd

    if "valid_time" in ds.coords and ds["valid_time"].dims == (step_dim,):
        return list(pd.to_datetime(ds["valid_time"].values))
    ref = _reference_time(ds)
    steps = ds[step_dim].values
    if steps.dtype.kind == "m":
        return [ref + pd.Timedelta(s) for s in steps]
    return [ref + pd.Timedelta(hours=float(s)) for s in steps]


def _step_dim(da: xr.DataArray) -> str:
    for name in ("forecast_period", "step", "time"):
        if name in da.dims:
            return name
    raise ParseError(f"no forecast step dimension in {da.dims}")


def parse_cams(
    ds: xr.Dataset, points: tuple[Point, ...], *, end: datetime
) -> dict[str, list[Row]]:
    """Per-point UV index (from accumulated UV biologically effective dose) and dust AOD.

    The UV index is the mean over the preceding forecast step (accumulated dose
    differenced and divided by the step length), so it is lower than the
    instantaneous midday peak.
    """
    import numpy as np
    import pandas as pd

    uv_name = _first_name(ds, UVBED_NAMES)
    dust_name = _first_name(ds, DUST_AOD_NAMES)
    keep = ("forecast_period", "step", "time", "latitude", "longitude")
    uv = _drop_extra_dims(ds[uv_name], keep)
    dust = _drop_extra_dims(ds[dust_name], keep)
    step_dim = _step_dim(uv)
    times = _cams_valid_times(ds, step_dim)
    limit = pd.Timestamp(end.replace(tzinfo=None))
    result: dict[str, list[Row]] = {}
    for point in points:
        uv_cell = uv.sel(latitude=point.lat, longitude=point.lon, method="nearest")
        dust_cell = dust.sel(latitude=point.lat, longitude=point.lon, method="nearest")
        dose = np.asarray(uv_cell.values, dtype=float)
        aod = np.asarray(dust_cell.values, dtype=float)
        rows: list[Row] = []
        for k in range(1, len(times)):
            seconds = (times[k] - times[k - 1]).total_seconds()
            if seconds <= 0 or times[k] > limit:
                continue
            uvi = (dose[k] - dose[k - 1]) / seconds / UVI_WATTS_PER_UNIT
            rows.append(
                {
                    "time": _iso(times[k]),
                    "uv_index": None if math.isnan(uvi) else round(max(uvi, 0.0), 1),
                    "dust_aod_550": _num(aod[k], 3),
                }
            )
        result[point.id] = rows
    return result
