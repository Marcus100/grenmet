"""Public current conditions: SYNOP decoding and the anonymous endpoint."""

import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.eregister import public
from src.eregister.dependencies import get_public_session
from src.main import app

ROOT = Path(__file__).resolve().parents[1]
URL = "/api/v1/eregister/public/current"
WORKBOOK = {
    "wind_indicator": "4",
    "wind_dir": "070",
    "wind_speed": "14",
    "air_temp": "31.0",
    "dew_point": "24.0",
    "msl_pressure": "1014.2",
    "pressure_tendency": "2",
    "pressure_change": "008",
    "precip_amount": "990",
    "precip_period": "7",
    "present_wx": "80",
    "total_cloud": "6",
}


def row(**body):
    return {
        "station_id": "78958",
        "station_name": "MBIA",
        "observed_at": datetime(2026, 9, 29, 17, tzinfo=UTC),
        "state": "draft",
        "body": {**WORKBOOK, **body},
    }


def test_decode_workbook_into_public_units():
    result = public.decode(row())
    assert result.status == "provisional"
    assert (result.temperature_c, result.dew_point_c) == (31.0, 24.0)
    assert result.relative_humidity == 66
    assert (result.wind_direction, result.wind_speed_kt) == ("ENE", 14)
    assert result.wind_speed_mph == 16
    assert (result.msl_pressure_hpa, result.pressure_trend) == (1014.2, "rising")
    assert result.pressure_change_hpa == 0.8
    assert (result.rain_mm, result.rain_trace, result.rain_period_hours) == (
        0.0,
        True,
        3,
    )
    assert result.weather == "Light shower"
    assert result.cloud == "Mostly cloudy"
    assert "actor" not in result.model_dump_json()


@pytest.mark.parametrize(
    ("body", "field", "expected"),
    [
        ({"wind_dir": "07"}, "wind_direction_deg", 70),  # dd in tens of degrees
        ({"wind_dir": "00", "wind_speed": "00"}, "wind_calm", True),
        ({"wind_indicator": "1", "wind_speed": "5"}, "wind_speed_kt", 10),
        ({"msl_pressure": "0149"}, "msl_pressure_hpa", 1014.9),
        ({"msl_pressure": "9985"}, "msl_pressure_hpa", 998.5),
        ({"msl_pressure": "12"}, "msl_pressure_hpa", None),
        ({"air_temp": "254"}, "temperature_c", None),  # coded, not °C: never guess
        ({"precip_amount": "993"}, "rain_mm", 0.3),
        ({"present_wx": "95"}, "weather", "Thunderstorm"),
        ({"pressure_tendency": "7"}, "pressure_trend", "falling"),
    ],
)
def test_decode_edge_codes(body, field, expected):
    assert getattr(public.decode(row(**body)), field) == expected


def test_decode_nested_workbook_and_accepted_state():
    nested = row()
    nested["body"] = {"workbook": {"air_temp": "28.5"}}
    nested["state"] = "accepted"
    result = public.decode(nested)
    assert (result.temperature_c, result.status) == (28.5, "accepted")
    assert result.wind_speed_kt is None


@pytest.fixture
async def register_db(fresh_weather_engine: Engine) -> AsyncGenerator[AsyncSession]:
    config = Config(str(ROOT / "src/eregister/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
    await engine.dispose()


async def insert(session, *, minutes_ago, state="draft", air_temp="30.0", **extra):
    identifier = uuid4()
    await session.execute(
        text(
            """
            INSERT INTO register_observations
              (id, station_id, kind, observed_at, body, state, actor_id, supersedes_id)
            VALUES (:id, :station, 'SYNOP', :at, CAST(:body AS jsonb),
                    CAST(:state AS register_state), 'PRIVATE-ACTOR', :supersedes)
            """
        ),
        {
            "id": identifier,
            "station": extra.get("station", "78958"),
            "at": datetime.now(UTC) - timedelta(minutes=minutes_ago),
            "body": f'{{"air_temp": "{air_temp}", "notes": "PRIVATE NOTE"}}',
            "state": state,
            "supersedes": extra.get("supersedes"),
        },
    )
    await session.commit()
    return identifier


async def test_public_endpoint_selects_latest_usable_reading(register_db):
    async def override():
        yield register_db

    app.dependency_overrides[get_public_session] = override
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            empty = await client.get(URL)
            assert empty.status_code == 200 and empty.json() == {"observation": None}

            old = await insert(register_db, minutes_ago=120, air_temp="27.0")
            await insert(register_db, minutes_ago=60, state="rejected", air_temp="40.0")
            await insert(register_db, minutes_ago=30, station="78999", air_temp="41.0")
            await insert(register_db, minutes_ago=-120, air_temp="42.0")  # future typo
            result = await client.get(URL)
            assert result.headers["cache-control"] == "no-store"
            body = result.json()["observation"]
            assert body["temperature_c"] == 27.0 and body["status"] == "provisional"
            assert "PRIVATE" not in result.text

            await insert(register_db, minutes_ago=90, air_temp="28.0", supersedes=old)
            await insert(register_db, minutes_ago=100, state="superseded")
            body = (await client.get(URL)).json()["observation"]
            assert body["temperature_c"] == 28.0

        async def unavailable():
            yield None

        app.dependency_overrides[get_public_session] = unavailable
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.get(URL)).status_code == 503
    finally:
        app.dependency_overrides.pop(get_public_session, None)


SUMMARY_URL = "/api/v1/eregister/public/month-summary"
NOW = datetime(2026, 10, 18, 15, tzinfo=UTC)


async def put(session, at, *, state="draft", station="78958", **fields):
    await session.execute(
        text(
            """
            INSERT INTO register_observations
              (id, station_id, station_name, kind, observed_at, body, state, actor_id)
            VALUES (:id, :station, 'MBIA', 'SYNOP', :at, CAST(:body AS jsonb),
                    CAST(:state AS register_state), 'PRIVATE-ACTOR')
            """
        ),
        {
            "id": uuid4(),
            "station": station,
            "at": at,
            "body": json.dumps(fields),
            "state": state,
        },
    )
    await session.commit()


def test_month_bounds_handle_boundaries():
    assert public.month_bounds(None, NOW)[0] == "2026-10"
    assert public.month_bounds("2026-02", NOW) == (
        "2026-02",
        datetime(2026, 2, 1, tzinfo=UTC),
        datetime(2026, 3, 1, tzinfo=UTC),
    )
    assert public.month_bounds("2026-12", NOW)[2] == datetime(2027, 1, 1, tzinfo=UTC)


async def test_month_summary_aggregates_in_sql(register_db):
    s = register_db
    assert await public.month_summary(s, None, NOW) is None  # no data: not zeros

    # Out of month, other station, rejected: all ignored.
    await put(s, datetime(2026, 9, 30, 23, 59, tzinfo=UTC), s3_rainfall_24h="005")
    await put(
        s, datetime(2026, 10, 2, 12, tzinfo=UTC), station="78999", s3_rainfall_24h="400"
    )
    await put(
        s,
        datetime(2026, 10, 2, 12, tzinfo=UTC),
        state="rejected",
        s3_rainfall_24h="400",
        s3_max_temp="0450",
    )
    # Only an air temperature so far: rain stays null, not zero.
    await put(s, datetime(2026, 10, 1, 0, tzinfo=UTC), air_temp="24.1")
    partial = await public.month_summary(s, None, NOW)
    assert partial is not None
    assert partial.rainfall_mm is None and partial.rain_days is None
    assert (partial.max_temperature_c, partial.min_temperature_c) == (24.1, 24.1)

    await put(
        s,
        datetime(2026, 10, 1, 12, tzinfo=UTC),
        s3_rainfall_24h="990",  # trace: counts as 0 mm, not a rain day
        s3_max_temp="0321",
        s3_min_temp="0239",
    )
    await put(s, datetime(2026, 10, 3, 12, tzinfo=UTC), s3_rainfall_24h="992")  # 0.2
    await put(s, datetime(2026, 10, 4, 12, tzinfo=UTC), s3_rainfall_24h="991")  # 0.1
    await put(
        s,
        datetime(2026, 10, 5, 12, tzinfo=UTC),
        state="accepted",
        s3_rainfall_24h="012",
        s3_max_temp="0326",
    )
    await put(
        s,
        datetime(2026, 10, 6, 12, tzinfo=UTC),
        s3_rainfall_24h="n/a",  # junk is ignored, never read as zero
        s3_min_temp="1015",  # sign digit 1: negative
    )
    await put(s, datetime(2026, 10, 18, 20, tzinfo=UTC), s3_rainfall_24h="999")

    result = await public.month_summary(s, None, NOW)
    assert result is not None
    assert result.rainfall_mm == 12.3  # 0 + 0.2 + 0.1 + 12
    assert (result.rain_report_days, result.rain_days) == (4, 2)
    assert result.rain_day_threshold_mm == 0.2
    assert result.max_temperature_c == 32.6
    assert result.max_temperature_at == datetime(2026, 10, 5, 12, tzinfo=UTC)
    assert result.min_temperature_c == -1.5
    assert result.observation_count == 6  # future-dated typo excluded
    assert result.days_elapsed == 18
    assert result.period_end == NOW
    assert result.provisional is True

    # Past month: full period, nothing from October leaks in.
    sept = await public.month_summary(s, "2026-09", NOW)
    assert sept is not None and sept.rainfall_mm == 5.0
    assert sept.period_end == datetime(2026, 10, 1, tzinfo=UTC)
    assert await public.month_summary(s, "2026-11", NOW) is None


async def test_month_summary_endpoint(register_db):
    async def override():
        yield register_db

    app.dependency_overrides[get_public_session] = override
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            empty = await client.get(SUMMARY_URL)
            assert empty.status_code == 200 and empty.json() == {"summary": None}
            bad = await client.get(SUMMARY_URL, params={"month": "2026-13"})
            assert bad.status_code == 422

            await put(
                register_db,
                datetime.now(UTC) - timedelta(minutes=5),
                state="accepted",
                s3_rainfall_24h="995",
                air_temp="29.5",
                notes="PRIVATE NOTE",
            )
            result = await client.get(SUMMARY_URL)
            assert "max-age=300" in result.headers["cache-control"]
            body = result.json()["summary"]
            assert body["rainfall_mm"] == 0.5 and body["provisional"] is False
            assert body["rain_days"] == 1 and body["station_id"] == "78958"
            assert "PRIVATE" not in result.text

        async def unavailable():
            yield None

        app.dependency_overrides[get_public_session] = unavailable
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            down = await client.get(SUMMARY_URL)
            assert down.status_code == 503
            assert down.headers["cache-control"] == "no-store"
    finally:
        app.dependency_overrides.pop(get_public_session, None)
