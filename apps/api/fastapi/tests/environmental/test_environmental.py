"""Environmental domain: parsing from synthetic datasets, disabled behaviour, endpoints."""

from datetime import UTC, datetime, timedelta

import httpx
import numpy as np
import pandas as pd
import pytest
import xarray as xr
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.environmental import parsing, providers, service
from src.environmental.config import EnvironmentalConfig, environmental_settings
from src.environmental.models import EnvironmentSeries
from src.environmental.points import POINT_IDS, POINTS, get_point
from src.environmental.schemas import MarineResponse

START = datetime(2026, 10, 18, 0, 0, tzinfo=UTC)
LATS = np.array([11.9, 12.0, 12.1, 12.2, 12.5, 12.6])
LONS = np.array([-61.9, -61.8, -61.7, -61.5, -61.4])


def _wave_ds(*, mask_first_cell: bool = False) -> xr.Dataset:
    times = pd.date_range("2026-10-18", periods=4, freq="3h")
    shape = (len(times), len(LATS), len(LONS))
    data = {
        "VHM0": np.full(shape, 1.5),
        "VHM0_SW1": np.full(shape, 1.1),
        "VTM01_SW1": np.full(shape, 9.0),
        "VMDR_SW1": np.full(shape, 75.4),
    }
    if mask_first_cell:
        for arr in data.values():
            arr[:, :, :] = np.nan
            arr[:, 4, 3] = 2.0  # one valid cell near Carriacou only
    return xr.Dataset(
        {k: (("time", "latitude", "longitude"), v) for k, v in data.items()},
        coords={"time": times, "latitude": LATS, "longitude": LONS},
    )


def _sst_ds() -> xr.Dataset:
    times = pd.date_range("2026-10-18", periods=12, freq="1h")
    shape = (len(times), 1, len(LATS), len(LONS))
    return xr.Dataset(
        {"thetao": (("time", "depth", "latitude", "longitude"), np.full(shape, 28.46))},
        coords={"time": times, "depth": [0.49], "latitude": LATS, "longitude": LONS},
    )


def _cams_ds() -> xr.Dataset:
    lats = np.array([11.8, 12.2, 12.6])
    lons = np.array([-62.0, -61.6, -61.2])
    steps = pd.to_timedelta([0, 3, 6, 9], unit="h")
    ref = np.datetime64("2026-10-18T00:00")
    # 0.025 W/m2 per UVI unit: a 3 h step at UVI 8 accumulates 8 * 0.025 * 10800 J/m2.
    dose = np.array(
        [0.0, 0.0, 8 * 0.025 * 10800, 8 * 0.025 * 10800 + 2 * 0.025 * 10800]
    )
    uv = np.broadcast_to(dose[:, None, None], (4, 3, 3)).copy()
    dust = np.full((4, 3, 3), 0.1234)
    ds = xr.Dataset(
        {
            "uvbed": (("forecast_period", "latitude", "longitude"), uv),
            "duaod550": (("forecast_period", "latitude", "longitude"), dust),
        },
        coords={
            "forecast_period": steps,
            "latitude": lats,
            "longitude": lons,
            "forecast_reference_time": ref,
        },
    )
    return ds.assign_coords(valid_time=("forecast_period", ref + steps.values))


def test_points_literal_matches_registry() -> None:
    from typing import get_args

    from src.environmental.points import PointId

    assert set(get_args(PointId)) == set(POINT_IDS)


def test_parse_marine_rows_per_point() -> None:
    rows = parsing.parse_marine(
        _wave_ds(),
        _sst_ds(),
        POINTS,
        start=START,
        end=START + timedelta(hours=6),
    )
    assert set(rows) == set(POINT_IDS)
    series = rows["st-georges"]
    assert [r["time"] for r in series] == [
        "2026-10-18T00:00:00Z",
        "2026-10-18T03:00:00Z",
        "2026-10-18T06:00:00Z",
    ]
    assert series[0] == {
        "time": "2026-10-18T00:00:00Z",
        "wave_height_m": 1.5,
        "swell_height_m": 1.1,
        "swell_period_s": 9.0,
        "swell_direction_deg": 75.0,
        "sea_surface_temp_c": 28.46,
    }


def test_parse_marine_uses_nearest_cell_with_data() -> None:
    rows = parsing.parse_marine(
        _wave_ds(mask_first_cell=True),
        None,
        POINTS,
        start=START,
        end=START + timedelta(hours=3),
    )
    assert rows["st-georges"][0]["wave_height_m"] == 2.0
    assert rows["st-georges"][0]["sea_surface_temp_c"] is None


def test_parse_marine_missing_variable_raises() -> None:
    with pytest.raises(parsing.ParseError):
        parsing.parse_marine(
            _wave_ds().drop_vars("VMDR_SW1"),
            None,
            POINTS,
            start=START,
            end=START + timedelta(hours=3),
        )


def test_parse_cams_converts_dose_to_uv_index_and_reads_dust() -> None:
    ds = _cams_ds()
    rows = parsing.parse_cams(ds, POINTS, end=START + timedelta(hours=9))
    series = rows["carriacou"]
    assert [r["time"] for r in series] == [
        "2026-10-18T03:00:00Z",
        "2026-10-18T06:00:00Z",
        "2026-10-18T09:00:00Z",
    ]
    assert [r["uv_index"] for r in series] == [0.0, 8.0, 2.0]
    assert series[0]["dust_aod_550"] == 0.123
    assert parsing.cams_issued_at(ds) == START


def test_parse_cams_without_valid_time_coordinate() -> None:
    ds = _cams_ds().drop_vars("valid_time")
    rows = parsing.parse_cams(ds, POINTS, end=START + timedelta(hours=9))
    assert rows["st-georges"][1]["uv_index"] == 8.0


def test_parse_cams_missing_variable_raises() -> None:
    with pytest.raises(parsing.ParseError):
        parsing.parse_cams(
            _cams_ds().drop_vars("duaod550"), POINTS, end=START + timedelta(hours=9)
        )


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (
            datetime(2026, 10, 18, 9, 59, tzinfo=UTC),
            datetime(2026, 10, 17, 12, tzinfo=UTC),
        ),
        (
            datetime(2026, 10, 18, 10, 0, tzinfo=UTC),
            datetime(2026, 10, 18, 0, tzinfo=UTC),
        ),
        (
            datetime(2026, 10, 18, 22, 0, tzinfo=UTC),
            datetime(2026, 10, 18, 12, tzinfo=UTC),
        ),
    ],
)
def test_latest_cams_run_waits_for_publication(
    now: datetime, expected: datetime
) -> None:
    assert providers.latest_cams_run(now) == expected


def test_config_disabled_without_credentials() -> None:
    config = EnvironmentalConfig(_env_file=None)
    assert not config.marine_enabled
    assert not config.air_enabled
    enabled = EnvironmentalConfig(
        _env_file=None,
        COPERNICUSMARINE_SERVICE_USERNAME="u",
        COPERNICUSMARINE_SERVICE_PASSWORD=SecretStr("p"),
        CDSAPI_KEY=SecretStr("k"),
    )
    assert enabled.marine_enabled
    assert enabled.air_enabled


async def test_refresh_is_noop_when_disabled(db_async: AsyncSession) -> None:
    config = EnvironmentalConfig(_env_file=None)
    assert await service.refresh_marine(db_async, config=config) == 0
    assert await service.refresh_air(db_async, config=config) == 0


@pytest.mark.usefixtures("db_async")
async def test_endpoints_unavailable_when_disabled(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        environmental_settings, "COPERNICUSMARINE_SERVICE_USERNAME", None
    )
    monkeypatch.setattr(environmental_settings, "CDSAPI_KEY", None)
    for path in ("marine", "air"):
        response = await async_client.get(f"/api/v1/environment/{path}")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["available"] is False
        assert body["series"] == []
        assert body["provenance"] is None
        assert body["is_gms_product"] is False
        assert "Not a GMS product" in body["attribution"]
        assert response.headers["cache-control"].startswith("public")


async def test_unknown_point_is_rejected(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get("/api/v1/environment/marine?point=nowhere")
    assert response.status_code == 422


def _enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        environmental_settings, "COPERNICUSMARINE_SERVICE_USERNAME", "u"
    )
    monkeypatch.setattr(
        environmental_settings, "COPERNICUSMARINE_SERVICE_PASSWORD", SecretStr("p")
    )
    monkeypatch.setattr(environmental_settings, "CDSAPI_KEY", SecretStr("k"))


async def test_refresh_then_endpoints_serve_stored_series(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enabled(monkeypatch)
    now = START + timedelta(hours=1)
    monkeypatch.setattr(
        providers, "fetch_marine", lambda *_a, **_k: (_wave_ds(), _sst_ds())
    )
    monkeypatch.setattr(providers, "fetch_cams", lambda *_a, **_k: _cams_ds())

    assert (
        await service.refresh_marine(db_async, config=environmental_settings, now=now)
        == 4
    )
    assert (
        await service.refresh_air(db_async, config=environmental_settings, now=now) == 4
    )
    # A second run replaces rows instead of adding duplicates.
    assert (
        await service.refresh_marine(db_async, config=environmental_settings, now=now)
        == 4
    )

    marine = await async_client.get("/api/v1/environment/marine?point=carriacou")
    assert marine.status_code == 200, marine.text
    body = marine.json()
    assert body["available"] is True
    assert body["is_gms_product"] is False
    assert body["provenance"]["status"] == "external"
    assert body["provenance"]["source"].startswith("Copernicus Marine")
    assert body["provenance"]["issued_at"] and body["provenance"]["fetched_at"]
    assert body["series"][0]["wave_height_m"] == 1.5
    assert body["latest"]["sea_surface_temp_c"] == 28.46
    assert "s-maxage" in marine.headers["cache-control"]

    air = await async_client.get("/api/v1/environment/air")
    assert air.status_code == 200, air.text
    air_body = air.json()
    assert air_body["available"] is True
    assert air_body["provenance"]["issued_at"].startswith("2026-10-18")
    assert [r["uv_index"] for r in air_body["series"]] == [0.0, 8.0, 2.0]

    count = await db_async.execute(select(func.count()).select_from(EnvironmentSeries))
    assert count.scalar_one() == 8


async def test_stale_flag_and_latest_selection(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enabled(monkeypatch)
    old = datetime(2026, 10, 17, 6, 0)
    db_async.add(
        EnvironmentSeries(
            kind="marine",
            point_id="carriacou",
            issued_at=old,
            fetched_at=old,
            products="x",
            rows=[
                {"time": "2026-10-18T00:00:00Z", "wave_height_m": 1.0},
                {"time": "2026-10-18T03:00:00Z", "wave_height_m": 2.0},
            ],
        )
    )
    await db_async.commit()
    result: MarineResponse = await service.get_marine(
        db_async,
        get_point("carriacou"),
        now=datetime(2026, 10, 18, 2, 0, tzinfo=UTC),
    )
    assert result.available
    assert result.stale is True
    assert result.latest is not None
    assert result.latest.wave_height_m == 2.0
