"""Owner entry rules of 2026-10-23: station settings, 24 manual hours, extra groups."""

from collections.abc import AsyncGenerator
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
from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister import encode, rules
from src.eregister.dependencies import get_public_session, get_session
from src.eregister.schemas import SynopWorkbook
from src.main import app

from .test_eregister_validation import PAPER_ROW

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = "/api/v1/eregister/stations/78958/settings"


def _user(*, superuser: bool) -> User:
    return User(
        id=uuid4(),
        email="staff@example.test",
        is_active=True,
        is_superuser=superuser,
        registration_pending=False,
    )


@pytest.fixture
async def register_db(fresh_weather_engine: Engine) -> AsyncGenerator[Engine]:
    config = Config(str(ROOT / "src/eregister/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    yield fresh_weather_engine


@pytest.fixture
async def staff_client(register_db: Engine) -> AsyncGenerator[httpx.AsyncClient]:
    engine = create_async_engine(
        register_db.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )

    async def session() -> AsyncGenerator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as value:
            yield value

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_public_session] = session
    app.dependency_overrides[get_browser_or_token_user] = lambda: _user(superuser=True)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_public_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


def test_78958_is_observed_by_hand_every_hour_after_the_migration(
    register_db: Engine,
) -> None:
    with register_db.connect() as connection:
        row = connection.execute(
            text(
                "SELECT schedule, manual_hours_utc FROM observations.stations"
                " WHERE station_id = '78958'"
            )
        ).one()
    assert row.schedule == "manual"
    assert sorted(row.manual_hours_utc) == list(range(24))


OWNER_AMOUNTS = {
    "total_correction_hpa": 0.0,
    "qfe_offset_hpa": 0.3,
    "sea_level_offset_hpa": 1.0,
    "qnh_offset_hpa": 0.1,
}


async def test_78958_holds_the_owner_confirmed_pressure_amounts(
    staff_client: httpx.AsyncClient,
) -> None:
    response = await staff_client.get(SETTINGS)
    assert response.status_code == 200, response.text
    body = response.json()
    assert {key: body[key] for key in OWNER_AMOUNTS} == OWNER_AMOUNTS
    assert body["pending"] == []
    assert "no-store" in response.headers["cache-control"]


async def test_station_amounts_can_be_changed_and_cleared(
    staff_client: httpx.AsyncClient,
) -> None:
    saved = await staff_client.put(
        SETTINGS, json={**OWNER_AMOUNTS, "qfe_offset_hpa": 0.4}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["qfe_offset_hpa"] == 0.4
    assert saved.json()["updated_by"]
    assert (await staff_client.get(SETTINGS)).json()["qfe_offset_hpa"] == 0.4
    # An amount left out is cleared and listed as pending: nothing is assumed.
    partial = await staff_client.put(SETTINGS, json={"total_correction_hpa": 0.0})
    assert partial.json()["pending"] == [
        "qfe_offset_hpa",
        "sea_level_offset_hpa",
        "qnh_offset_hpa",
    ]


@pytest.mark.parametrize(
    "changes",
    [{"qfe_offset_hpa": 50}, {"sea_level_offset_hpa": -21}, {"qnh_offset_hpa": "x"}],
)
async def test_implausible_station_settings_are_refused(
    staff_client: httpx.AsyncClient, changes: dict
) -> None:
    assert (await staff_client.put(SETTINGS, json=changes)).status_code == 422


async def test_a_saved_barometer_reading_gives_groups_3_and_4(
    staff_client: httpx.AsyncClient,
) -> None:
    row = {
        **{
            k: v
            for k, v in PAPER_ROW.items()
            if k not in ("station_pressure", "msl_pressure")
        },
        "barometer_reading": "1012.8",
    }
    checked = await staff_client.post(
        "/api/v1/eregister/observations/validate-synop", json={"workbook": row}
    )
    assert checked.status_code == 200, checked.text
    result = checked.json()
    assert result["normalized"]["station_pressure"] == "0128"
    assert result["normalized"]["msl_pressure"] == "0138"
    assert result["decoded"]["station_pressure_pa"] == 101280
    assert result["decoded"]["mean_sea_level_pressure_pa"] == 101380
    assert result["decoded"]["qfe_pa"] == 101310
    assert result["decoded"]["qnh_pa"] == 101390
    saved = await staff_client.post(
        "/api/v1/eregister/observations",
        json={
            "station_id": "78958",
            "kind": "SYNOP",
            "observed_at": "2023-03-30T12:00:00Z",
            "body": row,
        },
    )
    assert saved.status_code == 201, saved.text
    body = saved.json()["body"]
    assert (body["station_pressure"], body["msl_pressure"]) == ("0128", "0138")


async def test_a_keyed_sea_level_group_that_breaks_the_rule_warns(
    staff_client: httpx.AsyncClient,
) -> None:
    row = {**PAPER_ROW, "station_pressure": "0157", "msl_pressure": "0170"}
    checked = await staff_client.post(
        "/api/v1/eregister/observations/validate-synop", json={"workbook": row}
    )
    issues = {i["field"]: (i["code"], i["severity"]) for i in checked.json()["issues"]}
    assert issues["msl_pressure"] == ("sea_level_mismatch", "warning")
    # The keyed figure is what is sent.
    assert checked.json()["normalized"]["msl_pressure"] == "0170"
    ok = {**PAPER_ROW, "station_pressure": "0157", "msl_pressure": "0167"}
    checked = await staff_client.post(
        "/api/v1/eregister/observations/validate-synop", json={"workbook": ok}
    )
    assert "msl_pressure" not in {i["field"] for i in checked.json()["issues"]}


async def test_unknown_station_has_no_settings(
    staff_client: httpx.AsyncClient,
) -> None:
    url = "/api/v1/eregister/stations/00000/settings"
    assert (await staff_client.get(url)).status_code == 404
    assert (await staff_client.put(url, json={})).status_code == 404


async def test_settings_need_register_access_and_changing_them_needs_qc(
    staff_client: httpx.AsyncClient,
) -> None:
    app.dependency_overrides[get_browser_or_token_user] = lambda: _user(superuser=False)
    assert (await staff_client.get(SETTINGS)).status_code == 403
    assert (await staff_client.put(SETTINGS, json={})).status_code == 403


def _check(**changes: str) -> dict[str, str]:
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, **changes})
    issues, _ = rules.validate_synop(workbook)
    return {f"{i.severity}:{i.field}": i.code for i in issues}


@pytest.mark.parametrize("reading", ["1013.2", "1013", "998.0"])
def test_barometer_as_read_accepts_hpa(reading: str) -> None:
    assert "error:barometer_reading" not in _check(barometer_reading=reading)


@pytest.mark.parametrize("reading", ["abc", "1,013", "-5", "200", "2000", "1013.2.1"])
def test_barometer_as_read_rejects_other_text(reading: str) -> None:
    assert _check(barometer_reading=reading)["error:barometer_reading"] == (
        "invalid_barometer"
    )


def test_group_909_is_five_digits_starting_909() -> None:
    assert "error:s3_group_909" not in _check(s3_group_909="90912")
    for bad in ("90", "91012", "9091x", "909123"):
        assert _check(s3_group_909=bad)["error:s3_group_909"] == "invalid_format"


def test_group_909_is_sent_with_section_3() -> None:
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, "s3_group_909": "90912"})
    assert "90912=" in encode.synop_tac(workbook).split()


def test_time_marks_do_not_turn_a_nil_report_into_data() -> None:
    identification = {key: PAPER_ROW[key] for key in rules.IDENTIFICATION}
    marks = {
        "time_mark_anemograph": "1200",
        "time_mark_barograph": "1200",
        "time_mark_rain_recorder": "1200",
        "time_mark_thermohygrograph": "1200",
    }
    _, decoded = rules.validate_synop(
        SynopWorkbook.model_validate({**identification, **marks})
    )
    assert decoded.is_nil_report is True
