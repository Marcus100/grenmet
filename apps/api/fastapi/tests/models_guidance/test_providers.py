"""Providers and worker ingest, served from fakes (no network)."""

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory
from src.models_guidance import extract, ingest, providers, service
from src.models_guidance.config import GuidancePoint, guidance_settings
from src.models_guidance.models import ModelGuidanceRun, ModelGuidanceSeries

from .grib import write_grib

POINTS = [GuidancePoint(key="mbia", name="MBIA", latitude=12.004, longitude=-61.786)]
# Yesterday's 00:00 UTC cycle: always inside the retention window, so the
# prune test does not start failing as the calendar moves on.
RUN = (datetime.now(UTC) - timedelta(days=1)).replace(
    hour=0, minute=0, second=0, microsecond=0, tzinfo=None
)


def test_ecmwf_steps_follow_published_cadence():
    ifs_00 = providers.ecmwf_steps("ifs", 0, 240)
    assert ifs_00[:3] == [0, 3, 6]
    assert 144 in ifs_00
    assert ifs_00[ifs_00.index(144) + 1] == 150
    assert ifs_00[-1] == 240
    # 06/18 UTC cycles stop at 90 h; AIFS is 6-hourly.
    assert max(providers.ecmwf_steps("ifs", 6, 240)) == 90
    assert providers.ecmwf_steps("aifs", 0, 24) == [0, 6, 12, 18, 24]
    assert max(providers.ecmwf_steps("ifs", 0, 48)) == 48


def _gfs_client_factory(handler):
    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_gfs_latest_run_picks_newest_complete_cycle(monkeypatch):
    monkeypatch.setattr(guidance_settings, "HORIZON_HOURS", 24)
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        # Only the 06 UTC cycle of 2026-10-18 is complete.
        done = "gfs.20261018/06/atmos/gfs.t06z.pgrb2.0p25.f024.idx" in request.url.path
        return httpx.Response(200 if done else 404)

    fetcher = providers.GfsFetcher(_gfs_client_factory(handler))
    monkeypatch.setattr(
        providers,
        "datetime",
        type(
            "FrozenDatetime",
            (datetime,),
            {
                "now": classmethod(
                    lambda cls, tz=None: datetime(2026, 10, 18, 13, 5, tzinfo=UTC)
                )
            },
        ),
    )
    assert await fetcher.latest_run() == datetime(2026, 10, 18, 6)
    assert seen[0].endswith("gfs.t12z.pgrb2.0p25.f024.idx")  # newest tried first


async def test_gfs_latest_run_is_none_when_nomads_is_down():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    fetcher = providers.GfsFetcher(_gfs_client_factory(handler))
    assert await fetcher.latest_run() is None


async def test_gfs_fetch_requests_a_small_filtered_box_per_step(
    monkeypatch, tmp_path: Path
):
    monkeypatch.setattr(guidance_settings, "HORIZON_HOURS", 24)
    monkeypatch.setattr(guidance_settings, "GFS_REQUEST_PAUSE_SECONDS", 0)
    monkeypatch.setattr(guidance_settings, "CACHE_DIR", str(tmp_path))
    requested: list[httpx.QueryParams] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.params)
        step = int(request.url.params["file"][-3:])
        grib = write_grib(
            tmp_path / f"served{step}.grib",
            [
                {
                    "step": step,
                    "temp_k": 300.0 + step,
                    "accumulations": ((max(step - 3, 0), 1.0),) if step else (),
                }
            ],
        )
        return httpx.Response(200, content=grib.read_bytes())

    readings = await providers.GfsFetcher(_gfs_client_factory(handler)).fetch_run(
        RUN, POINTS
    )
    assert [p["file"] for p in requested] == [
        f"gfs.t00z.pgrb2.0p25.f{h:03d}" for h in range(0, 25, 3)
    ]
    first = requested[0]
    assert first["dir"] == f"/gfs.{RUN:%Y%m%d}/00/atmos"
    assert first["var_TMP"] == "on"
    assert first["lev_2_m_above_ground"] == "on"
    assert float(first["toplat"]) - float(first["bottomlat"]) < 2
    assert sorted(readings.instant["t2m"]) == list(range(0, 25, 3))
    # Scratch GRIB is removed once read.
    assert not await asyncio.to_thread(lambda: list(tmp_path.glob("guidance-*")))


class FakeFetcher:
    model = "gfs"

    def __init__(self, run: datetime | None, tmp_path: Path):
        self.run = run
        self.tmp_path = tmp_path
        self.fetched = 0

    async def latest_run(self) -> datetime | None:
        return self.run

    async def fetch_run(self, run_time, points) -> extract.Readings:
        self.fetched += 1
        path = write_grib(
            self.tmp_path / "f.grib2",
            [{"step": 0, "temp_k": 300.15}, {"step": 3, "temp_k": 301.15}],
        )
        return extract.read_points(path, points, "gfs")


async def test_refresh_stores_once_and_skips_stored_runs(
    db_async: AsyncSession, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(guidance_settings, "POINTS", POINTS)
    fetcher = FakeFetcher(RUN, tmp_path)
    assert await ingest.refresh_model(async_session_factory, "gfs", fetcher) == "stored"
    assert (
        await ingest.refresh_model(async_session_factory, "gfs", fetcher) == "current"
    )
    assert fetcher.fetched == 1
    db_async.expire_all()
    assert (
        await db_async.scalar(select(func.count()).select_from(ModelGuidanceRun)) == 1
    )
    series = await db_async.scalar(select(ModelGuidanceSeries.series))
    assert series is not None
    assert series["temperature_c"] == [27.0, 28.0]


async def test_refresh_reports_unavailable_runs(db_async: AsyncSession, tmp_path: Path):
    _ = db_async
    fetcher = FakeFetcher(None, tmp_path)
    assert (
        await ingest.refresh_model(async_session_factory, "gfs", fetcher)
        == "unavailable"
    )
    assert fetcher.fetched == 0


async def test_refresh_all_isolates_failures_and_prunes(
    db_async: AsyncSession, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(guidance_settings, "MODELS", "ifs,gfs")
    monkeypatch.setattr(guidance_settings, "POINTS", POINTS)
    old = ModelGuidanceRun(
        model="gfs",
        run_time=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=30),
    )
    db_async.add(old)
    await db_async.commit()

    def fetcher_for(model: str):
        if model == "ifs":
            raise RuntimeError("ECMWF unreachable")
        return FakeFetcher(RUN, tmp_path)

    monkeypatch.setattr(providers, "fetcher_for", fetcher_for)
    outcomes = await ingest.refresh_all(async_session_factory)
    assert outcomes == {"ifs": "error", "gfs": "stored"}
    db_async.expire_all()
    runs = (await db_async.scalars(select(ModelGuidanceRun))).all()
    assert [r.run_time for r in runs] == [RUN]  # the 30-day-old run was pruned


async def test_store_run_ignores_runs_without_data(db_async: AsyncSession):
    stored = await service.store_run(
        db_async,
        model="gfs",
        run_time=RUN,
        readings=extract.Readings(),
        points=POINTS,
    )
    assert stored is None


def test_worker_registers_the_guidance_job():
    from src.worker.main import WorkerSettings, fetch_model_guidance

    assert fetch_model_guidance in WorkerSettings.functions
    job = next(
        c for c in WorkerSettings.cron_jobs if c.coroutine is fetch_model_guidance
    )
    assert job.timeout_s == 3600


async def test_worker_job_is_a_noop_when_disabled(monkeypatch):
    from src.worker.main import fetch_model_guidance

    monkeypatch.setattr(guidance_settings, "ENABLED", False)
    assert await fetch_model_guidance({}) == {}
