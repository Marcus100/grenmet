"""Model data sources: ECMWF open data (IFS, AIFS) and NOAA GFS (NOMADS).

``fetch_run`` downloads the run in small chunks, reads the point values from
each chunk and deletes it, so at most one chunk of GRIB sits on disk at a time
(ECMWF open data cannot be sub-setted by area server side).
"""

import asyncio
import logging
import shutil
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

import httpx
from ecmwf.opendata import Client

from . import extract
from .config import GuidancePoint, guidance_settings

logger = logging.getLogger(__name__)

_ECMWF_PARAMS_IFS = ["2t", "10u", "10v", "10fg", "tp", "msl", "tcc"]
_ECMWF_PARAMS_AIFS = ["2t", "10u", "10v", "tp", "msl", "tcc"]  # AIFS has no gust
_ECMWF_CHUNK_STEPS = 8
_GFS_STEP_HOURS = 3
_GFS_CYCLES_BACK = 5


class RunFetcher(Protocol):
    model: str

    async def latest_run(self) -> datetime | None: ...

    async def fetch_run(
        self, run_time: datetime, points: list[GuidancePoint]
    ) -> extract.Readings: ...


def _scratch_dir() -> Path:
    parent = guidance_settings.CACHE_DIR or None
    if parent:
        Path(parent).mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="guidance-", dir=parent))


def ecmwf_steps(model: str, run_hour: int, horizon: int) -> list[int]:
    """Forecast steps (hours) published as open data for a cycle."""
    if model == "aifs":
        return list(range(0, horizon + 1, 6))
    # IFS HRES: 3-hourly to 144 h, 6-hourly beyond; 06/18 UTC cycles end at 90 h.
    limit = 90 if run_hour in (6, 18) else horizon
    steps = list(range(0, min(limit, 144) + 1, 3))
    steps += list(range(150, min(limit, horizon) + 1, 6))
    return [s for s in steps if s <= horizon]


class EcmwfFetcher:
    def __init__(self, model: str) -> None:
        self.model = model
        self._client_model = "aifs-single" if model == "aifs" else "ifs"

    def _params(self) -> list[str]:
        return _ECMWF_PARAMS_AIFS if self.model == "aifs" else _ECMWF_PARAMS_IFS

    async def latest_run(self) -> datetime | None:
        horizon = guidance_settings.HORIZON_HOURS

        def probe() -> datetime | None:
            client = Client(source="ecmwf", model=self._client_model)
            # Only the 00/12 cycles reach the full horizon for IFS.
            last = max(ecmwf_steps(self.model, 0, horizon))
            found = client.latest(type="fc", step=last, param="2t")
            return found.replace(tzinfo=None) if found else None

        return await asyncio.to_thread(probe)

    async def fetch_run(
        self, run_time: datetime, points: list[GuidancePoint]
    ) -> extract.Readings:
        steps = ecmwf_steps(self.model, run_time.hour, guidance_settings.HORIZON_HOURS)

        def work() -> extract.Readings:
            client = Client(source="ecmwf", model=self._client_model)
            scratch = _scratch_dir()
            readings = extract.Readings()
            try:
                for i in range(0, len(steps), _ECMWF_CHUNK_STEPS):
                    chunk = steps[i : i + _ECMWF_CHUNK_STEPS]
                    target = scratch / f"chunk{i}.grib2"
                    client.retrieve(
                        date=run_time.strftime("%Y%m%d"),
                        time=run_time.hour,
                        type="fc",
                        step=chunk,
                        param=self._params(),
                        target=str(target),
                    )
                    readings.merge(extract.read_points(target, points, self.model))
                    target.unlink(missing_ok=True)
            finally:
                shutil.rmtree(scratch, ignore_errors=True)
            return readings

        return await asyncio.to_thread(work)


class GfsFetcher:
    model = "gfs"

    def __init__(self, client_factory: Callable[[], httpx.AsyncClient] | None = None):
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(
                timeout=guidance_settings.TIMEOUT_SECONDS, follow_redirects=True
            )
        )

    def _steps(self) -> list[int]:
        return list(range(0, guidance_settings.HORIZON_HOURS + 1, _GFS_STEP_HOURS))

    @staticmethod
    def _dir(run_time: datetime) -> str:
        return f"gfs.{run_time:%Y%m%d}/{run_time:%H}/atmos"

    @staticmethod
    def _file(run_time: datetime, step: int) -> str:
        return f"gfs.t{run_time:%H}z.pgrb2.0p25.f{step:03d}"

    async def latest_run(self) -> datetime | None:
        now = datetime.now(UTC).replace(tzinfo=None)
        cycle = now.replace(minute=0, second=0, microsecond=0)
        cycle -= timedelta(hours=cycle.hour % 6)
        last = self._steps()[-1]
        async with self._client_factory() as client:
            for back in range(_GFS_CYCLES_BACK):
                candidate = cycle - timedelta(hours=6 * back)
                # The last forecast hour is written last: its index means the run is complete.
                url = (
                    f"{guidance_settings.GFS_DATA_URL}/{self._dir(candidate)}/"
                    f"{self._file(candidate, last)}.idx"
                )
                try:
                    response = await client.head(url)
                except httpx.HTTPError:
                    logger.warning("GFS probe failed", extra={"cycle": str(candidate)})
                    return None
                if response.status_code == 200:
                    return candidate
        return None

    def _query(self, run_time: datetime, step: int, points: list[GuidancePoint]):
        lats = [p.latitude for p in points]
        lons = [p.longitude % 360.0 for p in points]
        pad = 0.5
        query = {
            "dir": f"/{self._dir(run_time)}",
            "file": self._file(run_time, step),
            "var_TMP": "on",
            "lev_2_m_above_ground": "on",
            "var_UGRD": "on",
            "var_VGRD": "on",
            "lev_10_m_above_ground": "on",
            "var_GUST": "on",
            "var_APCP": "on",
            "lev_surface": "on",
            "var_PRMSL": "on",
            "lev_mean_sea_level": "on",
            "var_TCDC": "on",
            "lev_entire_atmosphere": "on",
            "subregion": "",
            "toplat": f"{max(lats) + pad:.2f}",
            "bottomlat": f"{min(lats) - pad:.2f}",
            "leftlon": f"{min(lons) - pad:.2f}",
            "rightlon": f"{max(lons) + pad:.2f}",
        }
        return query

    async def fetch_run(
        self, run_time: datetime, points: list[GuidancePoint]
    ) -> extract.Readings:
        readings = extract.Readings()
        scratch = _scratch_dir()
        try:
            async with self._client_factory() as client:
                for step in self._steps():
                    response = await client.get(
                        guidance_settings.GFS_FILTER_URL,
                        params=self._query(run_time, step, points),
                    )
                    response.raise_for_status()
                    target = scratch / f"f{step:03d}.grib2"
                    target.write_bytes(response.content)
                    readings.merge(
                        await asyncio.to_thread(
                            extract.read_points, target, points, "gfs"
                        )
                    )
                    target.unlink(missing_ok=True)
                    await asyncio.sleep(guidance_settings.GFS_REQUEST_PAUSE_SECONDS)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)
        return readings


def fetcher_for(model: str) -> RunFetcher:
    if model == "gfs":
        return GfsFetcher()
    if model in ("ifs", "aifs"):
        return EcmwfFetcher(model)
    raise ValueError(f"Unknown model {model!r}")
