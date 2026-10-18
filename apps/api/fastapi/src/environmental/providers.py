"""Blocking Copernicus clients (copernicusmarine, cdsapi). Run via asyncio.to_thread.

Each function loads the (small) result fully so no lazy network access happens
later on the event loop.
"""

from __future__ import annotations

import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from .config import EnvironmentalConfig
from .parsing import WAVE_VARIABLES
from .points import BBOX_EAST, BBOX_NORTH, BBOX_SOUTH, BBOX_WEST

if TYPE_CHECKING:
    import xarray as xr

# CAMS global forecasts start at 00 and 12 UTC and are published roughly 9 to
# 10 hours later; do not ask for a run before then.
CAMS_RUN_HOURS = (0, 12)
CAMS_PUBLISH_DELAY = timedelta(hours=10)
CAMS_STEP_HOURS = 3
# The CAMS grid is 0.4 degrees, so pad the box by one cell.
CAMS_AREA = [BBOX_NORTH + 0.4, BBOX_WEST - 0.4, BBOX_SOUTH - 0.4, BBOX_EAST + 0.4]
CAMS_VARIABLES = ["uv_biologically_effective_dose", "dust_aerosol_optical_depth_550nm"]


class ProviderError(RuntimeError):
    """A Copernicus request failed; callers keep the previous stored series."""


def fetch_marine(
    config: EnvironmentalConfig, *, start: datetime, end: datetime
) -> tuple[xr.Dataset, xr.Dataset]:
    """Wave and SST subsets for the Grenada box between start and end (UTC)."""
    import copernicusmarine

    password = config.COPERNICUSMARINE_SERVICE_PASSWORD
    if not config.COPERNICUSMARINE_SERVICE_USERNAME or password is None:
        raise ProviderError("Copernicus Marine credentials are not set")
    common = {
        "username": config.COPERNICUSMARINE_SERVICE_USERNAME,
        "password": password.get_secret_value(),
        "minimum_longitude": BBOX_WEST,
        "maximum_longitude": BBOX_EAST,
        "minimum_latitude": BBOX_SOUTH,
        "maximum_latitude": BBOX_NORTH,
        "start_datetime": start.strftime("%Y-%m-%dT%H:%M:%S"),
        "end_datetime": end.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    try:
        waves = copernicusmarine.open_dataset(
            dataset_id=config.COPERNICUS_WAVE_DATASET_ID,
            variables=list(WAVE_VARIABLES),
            **common,
        ).load()
        sst = copernicusmarine.open_dataset(
            dataset_id=config.COPERNICUS_SST_DATASET_ID,
            variables=["thetao"],
            minimum_depth=0,
            maximum_depth=2,
            **common,
        ).load()
    except Exception as exc:
        raise ProviderError(f"Copernicus Marine request failed: {exc}") from exc
    return waves, sst


def latest_cams_run(now: datetime) -> datetime:
    """Most recent CAMS forecast reference time that should be published by now."""
    cutoff = now.astimezone(UTC) - CAMS_PUBLISH_DELAY
    day = cutoff.replace(hour=0, minute=0, second=0, microsecond=0)
    for hour in sorted(CAMS_RUN_HOURS, reverse=True):
        candidate = day.replace(hour=hour)
        if candidate <= cutoff:
            return candidate
    return day.replace(hour=CAMS_RUN_HOURS[-1]) - timedelta(days=1)


def fetch_cams(config: EnvironmentalConfig, *, run: datetime) -> xr.Dataset:
    """UV dose and dust AOD forecast from the ADS for the run, as a loaded Dataset."""
    import cdsapi
    import xarray as xr

    if config.CDSAPI_KEY is None:
        raise ProviderError("CDSAPI_KEY is not set")
    request = {
        "variable": CAMS_VARIABLES,
        "date": [f"{run:%Y-%m-%d}/{run:%Y-%m-%d}"],
        "time": [f"{run:%H}:00"],
        "leadtime_hour": [
            str(h)
            for h in range(0, config.ENVIRONMENT_FORECAST_HOURS + 1, CAMS_STEP_HOURS)
        ],
        "type": ["forecast"],
        "data_format": "netcdf",
        "area": CAMS_AREA,
    }
    try:
        client = cdsapi.Client(
            url=config.CDSAPI_URL,
            key=config.CDSAPI_KEY.get_secret_value(),
            quiet=True,
            timeout=config.ENVIRONMENT_REQUEST_TIMEOUT_SECONDS,
        )
        with tempfile.TemporaryDirectory(prefix="cams-") as tmp:
            target = Path(tmp) / "cams.nc"
            client.retrieve(config.CAMS_DATASET_ID, request, str(target))
            with xr.open_dataset(target, engine="h5netcdf") as ds:
                return ds.load()
    except Exception as exc:
        raise ProviderError(f"CAMS request failed: {exc}") from exc
