"""Almanac and tide tables: storage, idempotent imports and the public endpoints."""

import re
from datetime import date
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.almanac import service
from src.almanac.models import AstroDay, MoonPhaseEvent, TidePrediction
from src.almanac.tides import parse_tide_csv
from src.config import settings

API = settings.API_V1_STR
HEADER = (
    "date_ast,event_number,event_type,time_ast,time_utc,"
    "height_m_pric_radar_datum,"
    "height_m_uhslc_station_datum_provisional_crosswalk,"
    "height_m_relative_uhslc_mllw_provisional_crosswalk,"
    "status,timing_quality,minimum_adjacent_excursion_m"
)
STATUS = "PROVISIONAL_INTERNAL_NOT_FOR_NAVIGATION"


def _tide_csv(height: str = "0.1000") -> list[str]:
    low = (
        f"2026-11-09,1,LOW,2026-11-09 00:10 AST,2026-11-09 04:10 UTC,"
        f"1.1,0.5,{height},{STATUS},STANDARD_MODEL_TURNING_POINT,0.1"
    )
    high = (
        f"2026-11-09,2,HIGH,2026-11-09 06:20 AST,2026-11-09 10:20 UTC,"
        f"1.9,1.3,0.9000,{STATUS},STANDARD_MODEL_TURNING_POINT,0.1"
    )
    return [HEADER, low, high]


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_tide_import_is_idempotent_and_updates_heights(
    db_async: AsyncSession,
) -> None:
    rows = parse_tide_csv(_tide_csv(), station_key="pric", source_version="v1.4")
    await service.upsert_tides(db_async, rows)
    await service.upsert_tides(db_async, rows)
    count = await db_async.scalar(
        select(func.count())
        .select_from(TidePrediction)
        .where(TidePrediction.station_key == "pric")
    )
    assert count == 2

    changed = parse_tide_csv(
        _tide_csv(height="0.2500"), station_key="pric", source_version="v1.4"
    )
    await service.upsert_tides(db_async, changed)
    low = await db_async.scalar(
        select(TidePrediction.height_m_mllw).where(
            TidePrediction.station_key == "pric",
            TidePrediction.event_type == "LOW",
        )
    )
    assert low == Decimal("0.2500")


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_astronomy_store_is_idempotent(db_async: AsyncSession) -> None:
    await service.store_astronomy(db_async, "mbia", date(2027, 3, 1), date(2027, 3, 10))
    await service.store_astronomy(db_async, "mbia", date(2027, 3, 1), date(2027, 3, 10))
    count = await db_async.scalar(
        select(func.count())
        .select_from(AstroDay)
        .where(
            AstroDay.location_key == "mbia",
            AstroDay.local_date >= date(2027, 3, 1),
            AstroDay.local_date <= date(2027, 3, 10),
        )
    )
    assert count == 10


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_phase_events_store_and_are_idempotent(db_async: AsyncSession) -> None:
    await service.store_phase_events(db_async, 2027, 2027)
    await service.store_phase_events(db_async, 2027, 2027)
    count = await db_async.scalar(
        select(func.count())
        .select_from(MoonPhaseEvent)
        .where(
            MoonPhaseEvent.local_date >= date(2027, 1, 1),
            MoonPhaseEvent.local_date <= date(2027, 12, 31),
        )
    )
    assert count is not None
    assert 48 <= count <= 52


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_public_astronomy_returns_days_local_times_and_phases(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    await service.store_astronomy(db_async, "mbia", date(2027, 3, 1), date(2027, 3, 3))
    await service.store_phase_events(db_async, 2027, 2027)

    response = await async_client.get(
        f"{API}/almanac/public/astronomy",
        params={"location": "mbia", "from": "2027-03-01", "to": "2027-03-03"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["timezone"] == "America/Grenada"
    assert body["location"]["key"] == "mbia"
    assert [d["date"] for d in body["days"]] == [
        "2027-03-01",
        "2027-03-02",
        "2027-03-03",
    ]
    first = body["days"][0]
    assert first["sunrise"]["utc"].startswith("2027-03-01T")
    assert re.fullmatch(
        r"2027-03-01T\d{2}:\d{2}:\d{2}-04:00", first["sunrise"]["local"]
    )
    assert first["moon_phase"]
    # Principal phases: the nearest one before and after the range, plus any inside it.
    phases = body["phases"]
    assert phases and all({"phase", "date"} <= set(p) for p in phases)
    assert [p["date"] for p in phases] == sorted(p["date"] for p in phases)
    assert response.headers["cache-control"].startswith("public")


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_public_astronomy_bounds_the_range(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(
        f"{API}/almanac/public/astronomy",
        params={"location": "mbia", "from": "2027-01-01", "to": "2028-12-31"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_public_astronomy_rejects_unknown_location(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(
        f"{API}/almanac/public/astronomy",
        params={"location": "nowhere", "from": "2027-01-01", "to": "2027-01-02"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_public_tides_carry_the_not_for_navigation_note(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    rows = parse_tide_csv(_tide_csv(), station_key="pric", source_version="v1.4")
    await service.upsert_tides(db_async, rows)

    response = await async_client.get(
        f"{API}/almanac/public/tides",
        params={"station": "pric", "from": "2026-11-09", "to": "2026-11-09"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "not for navigation" in body["note"].lower()
    assert body["status"] == STATUS
    assert body["source_version"] == "v1.4"
    assert [e["event_type"] for e in body["events"]] == ["LOW", "HIGH"]
    assert body["events"][0]["height_m_mllw"] == pytest.approx(0.1)
    assert body["events"][0]["time_local"] == "2026-11-09T00:10:00-04:00"


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_public_tides_bounds_range_and_station(
    async_client: httpx.AsyncClient,
) -> None:
    too_long = await async_client.get(
        f"{API}/almanac/public/tides",
        params={"station": "pric", "from": "2026-01-01", "to": "2027-12-31"},
    )
    assert too_long.status_code == 422
    unknown = await async_client.get(
        f"{API}/almanac/public/tides",
        params={"station": "elsewhere", "from": "2026-01-01", "to": "2026-01-02"},
    )
    assert unknown.status_code == 422
