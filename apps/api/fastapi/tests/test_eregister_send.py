"""eRegister send actions: TAC and CSV encoders, email and WIS2 queueing, job."""

import asyncio
import csv
import io
import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.audit.models import AuditEntry
from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister import derive, encode, entries, gate, publisher, rules, sends, store
from src.eregister.config import Wis2boxConfig
from src.eregister.dependencies import get_session
from src.eregister.models import ERegisterSend
from src.eregister.schemas import SynopWorkbook
from src.main import app
from src.notifications.models import OutboundEmail
from tests.factories import assign_role, make_role_with_permission, make_user

ROOT = Path(__file__).resolve().parents[1]
OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)

FULL_ROW = {
    "report_type": "AAXX",
    "day": "30",
    "time_utc": "12",
    "wind_indicator": "4",
    "station_id": "78958",
    "precip_indicator": "1",
    "station_wx_indicator": "1",
    "cloud_base": "4",
    "visibility": "68",
    "total_cloud": "1",
    "wind_dir": "07",
    "wind_speed": "15",
    "wind_gust": "25",
    "air_temp": "280",
    "dew_point": "213",
    "station_pressure": "0153",
    "msl_pressure": "0163",
    "pressure_tendency": "2",
    "pressure_change": "012",
    "precip_amount": "004",
    "precip_period": "1",
    "present_wx": "06",
    "past_wx_1": "0",
    "past_wx_2": "0",
    "low_cloud_amount": "1",
    "low_cloud_type": "1",
    "mid_cloud_type": "0",
    "high_cloud_type": "0",
    "s3_max_temp": "0310",
    "s3_min_temp": "0240",
    "s3_baro_change_24h": "9015",
    "s3_rainfall_24h": "0123",
    "s3_layer1_amount": "1",
    "s3_layer1_form": "8",
    "s3_layer1_height": "10",
}
NIL_ROW = {
    key: FULL_ROW[key]
    for key in ("report_type", "day", "time_utc", "station_id", "wind_indicator")
}


def workbook(**changes: str) -> SynopWorkbook:
    return SynopWorkbook.model_validate({**FULL_ROW, **changes})


# --- encoders -----------------------------------------------------------------


def test_tac_assembles_the_keyed_groups_in_section_order() -> None:
    assert encode.synop_tac(workbook()) == (
        "AAXX 30124 78958 11468 10715 10280 20213 30153 40163 52012 60041 70600 "
        "81100 333 10310 20240 59015 70123 81810 91025="
    )


def test_tac_nil_report_is_identification_only() -> None:
    assert encode.synop_tac(SynopWorkbook.model_validate(NIL_ROW)) == (
        "AAXX 30124 78958 NIL="
    )


def test_tac_a_typed_metar_alone_does_not_make_a_data_report() -> None:
    # metar_text is not SYNOP data: validation calls this NIL, so the TAC must too.
    row = {**NIL_ROW, "metar_text": "METAR TGPY 301200Z 07015KT 9999 NSC 28/21 Q1013="}
    assert encode.synop_tac(SynopWorkbook.model_validate(row)) == (
        "AAXX 30124 78958 NIL="
    )


def test_tac_sign_digit_and_three_digit_wind() -> None:
    tac = encode.synop_tac(workbook(air_temp="1034", wind_speed="105", wind_gust="110"))
    assert " 11034 " in tac
    # ff=99 in Nddff, then 00fff; gust uses the same rule.
    assert " 10799 00105 " in tac
    assert " 91099 00110" in tac


def test_tac_uses_relative_humidity_when_dew_point_is_missing() -> None:
    tac = encode.synop_tac(workbook(dew_point="", relative_humidity="76"))
    assert " 29076 " in tac
    assert " 2021" not in tac


def test_every_encoded_workbook_passes_the_rules() -> None:
    issues, _ = rules.validate_synop(workbook())
    assert [i for i in issues if i.severity == "error"] == []


def _csv_row(**changes: str) -> dict[str, str]:
    book = workbook(**changes)
    _, decoded = rules.validate_synop(book)
    return encode.wis2_row(book, decoded, OBSERVED, Wis2boxConfig())


def test_wis2_row_maps_si_values_to_the_template_columns() -> None:
    row = _csv_row()
    assert (row["wsi_series"], row["wsi_issuer"], row["wsi_local"]) == (
        "0",
        "20000",
        "78958",
    )
    assert (row["wmo_block_number"], row["wmo_station_number"]) == ("78", "958")
    assert (row["year"], row["month"], row["day"], row["hour"], row["minute"]) == (
        "2026",
        "3",
        "30",
        "12",
        "0",
    )
    assert row["station_type"] == "1"
    assert row["air_temperature"] == "301.15"
    assert row["dewpoint_temperature"] == "294.45"
    assert row["maximum_air_temperature"] == "304.15"
    assert row["minimum_air_temperature"] == "297.15"
    assert row["station_pressure"] == "101530"
    assert row["msl_pressure"] == "101630"
    assert row["24_hour_barometric_change"] == "-150"
    assert row["wind_direction"] == "70"
    assert row["wind_speed"] == "7.7"  # 15 kt
    assert row["maximum_wind_gust_speed_10_minutes"] == "12.9"  # 25 kt
    assert row["time_period_of_wind"] == "-10"
    # The template multiplies visibility by 1000, so the CSV carries km.
    assert row["visibility"] == "18"
    assert row["cloud_cover_tot"] == "1"
    assert row["lowest_cloud_height"] == "300"
    assert row["present_weather"] == "6"
    assert row["precipitation"] == "4"
    assert row["precipitation_period_duration"] == "-6"
    assert row["total_precipitation_24_hours"] == "12.3"
    assert row["cloud_coverage_l1"] == "1"
    assert row["genus_of_cloud_l1"] == "8"
    assert row["height_of_cloud_base_l1"] == "300"
    assert row["low_cloud_type"] == "1"


def test_wis2_row_carries_the_state_of_the_ground() -> None:
    assert _csv_row(s3_ground_state="2")["ground_state"] == "2"
    assert _csv_row()["ground_state"] == ""


def test_wis2_row_leaves_unreported_values_empty() -> None:
    row = _csv_row(wind_dir="", wind_speed="", wind_gust="", precip_amount="")
    assert row["wind_speed"] == ""
    assert row["time_period_of_wind"] == ""
    assert row["anemometer_height"] == ""
    assert row["precipitation"] == ""
    assert row["precipitation_period_duration"] == ""


def test_wis2_csv_has_the_template_header_and_one_row() -> None:
    text_csv = encode.wis2_csv(_csv_row())
    rows = list(csv.reader(io.StringIO(text_csv)))
    assert len(rows) == 2
    assert rows[0] == encode.WIS2_COLUMNS
    assert len(rows[1]) == len(encode.WIS2_COLUMNS)
    assert encode.wis2_filename(Wis2boxConfig(), OBSERVED) == (
        "wmo_data_0-20000-0-78958_20260330T1200.csv"
    )


def test_wis2_columns_match_the_vendored_template() -> None:
    template = Path(ROOT.parents[2] / "scripts/wis2-setup/test-data").glob("*.csv")
    header = next(iter(template)).read_text().splitlines()[0].split(",")
    assert header == encode.WIS2_COLUMNS


def test_workbook_from_body_accepts_flat_and_nested_bodies() -> None:
    flat = encode.workbook_from_body({**FULL_ROW, "source": "x", "validation": "y"})
    nested = encode.workbook_from_body({"workbook": FULL_ROW})
    assert flat == nested == workbook()


# --- endpoints ----------------------------------------------------------------


@pytest.fixture
async def send_client(
    fresh_weather_engine: Engine, db_async: AsyncSession
) -> AsyncGenerator[tuple[httpx.AsyncClient, User]]:
    config = Config(str(ROOT / "src/eregister/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        # 78958 is seeded `automatic` (SURFACE publishes it); these tests act
        # as if the owner has given eRegister the hours.
        connection.execute(text("UPDATE observations.stations SET schedule = 'manual'"))
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )

    async def register_session() -> AsyncGenerator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as value:
            yield value

    user = await make_user(db_async, superuser=True)
    app.dependency_overrides[get_session] = register_session
    app.dependency_overrides[get_browser_or_token_user] = lambda: user
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client, user
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


async def save(
    client: httpx.AsyncClient,
    row: dict[str, str] | None = None,
    *,
    accepted: bool = False,
    **extra: Any,
) -> str:
    response = await client.post(
        "/api/v1/eregister/observations",
        json={
            "station_id": "78958",
            "kind": "SYNOP",
            "observed_at": OBSERVED.isoformat(),
            "body": {**(row or FULL_ROW), "source": "eregister-workbook"},
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    if accepted:
        await set_state(response.json()["id"], "accepted")
    return response.json()["id"]


@pytest.fixture
def recipients(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        sends.eregister_settings, "OBS_RECIPIENTS", "A@gms.test, b@gms.test;a@gms.test"
    )


@pytest.fixture
def incoming(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setattr(sends.wis2box_settings, "WIS2BOX_INCOMING_DIR", str(tmp_path))
    return tmp_path


@pytest.mark.usefixtures("recipients")
async def test_email_queues_one_outbox_row_per_distinct_recipient(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    client, user = send_client
    observation = await save(client)
    response = await client.post(f"/api/v1/eregister/observations/{observation}/email")
    assert response.status_code == 202, response.text
    sent = response.json()
    assert (sent["target"], sent["status"], sent["recipients"]) == (
        "email",
        "queued",
        2,
    )
    mails = (await db_async.scalars(select(OutboundEmail))).all()
    assert sorted(mail.to_email for mail in mails) == ["a@gms.test", "b@gms.test"]
    assert all(mail.transactional for mail in mails)
    assert mails[0].subject == "SYNOP 78958 30 Mar 2026 1200Z"
    assert "AAXX 30124 78958" in (mails[0].html or "")
    log = (await db_async.scalars(select(ERegisterSend))).one()
    assert log.created_by == user.id
    assert str(log.observation_id) == observation


async def test_email_without_recipients_is_409(
    send_client: tuple[httpx.AsyncClient, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = send_client
    monkeypatch.setattr(sends.eregister_settings, "OBS_RECIPIENTS", "")
    observation = await save(client)
    response = await client.post(f"/api/v1/eregister/observations/{observation}/email")
    assert response.status_code == 409
    assert response.json()["detail"] == "No recipients configured"


@pytest.mark.usefixtures("recipients")
async def test_repeat_email_needs_resend(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    client, _ = send_client
    observation = await save(client)
    url = f"/api/v1/eregister/observations/{observation}/email"
    assert (await client.post(url)).status_code == 202
    again = await client.post(url)
    assert again.status_code == 409
    assert "resend=true" in again.json()["detail"]
    assert (await client.post(url, json={"resend": True})).status_code == 202
    assert len((await db_async.scalars(select(ERegisterSend))).all()) == 2


@pytest.mark.usefixtures("recipients")
async def test_send_requires_the_send_permission(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    client, _ = send_client
    observation = await save(client)
    plain = await make_user(db_async)
    app.dependency_overrides[get_browser_or_token_user] = lambda: plain
    url = f"/api/v1/eregister/observations/{observation}/email"
    assert (await client.post(url)).status_code == 403
    assert (
        await client.post(f"/api/v1/eregister/observations/{observation}/publish")
    ).status_code == 403
    role, _perms = await make_role_with_permission(db_async, "eregister.send")
    allowed = await assign_role(db_async, user=plain, role=role) and plain
    app.dependency_overrides[get_browser_or_token_user] = lambda: allowed
    assert (await client.post(url)).status_code == 202


async def test_register_needs_a_register_permission(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    # Saved readings show on the public site, so a signed-in account alone
    # (a self-registered Join, say) may not record or read the register.
    client, _ = send_client
    observation = await save(client)
    plain = await make_user(db_async)
    app.dependency_overrides[get_browser_or_token_user] = lambda: plain
    record = {
        "station_id": "78958",
        "kind": "SYNOP",
        "observed_at": OBSERVED.isoformat(),
        "body": {**FULL_ROW, "source": "eregister-workbook"},
    }
    list_url = "/api/v1/eregister/observations"
    sends_url = f"/api/v1/eregister/observations/{observation}/sends"
    assert (await client.post(list_url, json=record)).status_code == 403
    assert (await client.get(list_url)).status_code == 403
    assert (await client.get(sends_url)).status_code == 403
    for minute, key in enumerate(
        ("eregister.observe", "eregister.qc", "eregister.send"), start=1
    ):
        record["observed_at"] = (OBSERVED + timedelta(minutes=minute)).isoformat()
        holder = await make_user(db_async)
        role, _perms = await make_role_with_permission(db_async, key)
        await assign_role(db_async, user=holder, role=role)
        app.dependency_overrides[get_browser_or_token_user] = lambda u=holder: u
        assert (await client.post(list_url, json=record)).status_code == 201, key
        assert (await client.get(list_url)).status_code == 200, key
        assert (await client.get(sends_url)).status_code == 200, key


def test_observer_role_carries_the_observe_permission() -> None:
    from src.auth.permissions import DEFAULT_ROLES

    assert DEFAULT_ROLES["eregister-observer"][1] == ("eregister.observe",)


async def set_state(observation: str, state: str) -> None:
    """Put an observation in a QC state directly (the QC endpoints have their own tests)."""
    register = await anext(app.dependency_overrides[get_session]())
    await register.execute(
        text(
            "UPDATE register_observations SET state = CAST(:s AS register_state) "
            "WHERE id = :i"
        ),
        {"s": state, "i": observation},
    )
    await register.commit()


@pytest.mark.parametrize("state", ["rejected", "superseded"])
@pytest.mark.usefixtures("recipients")
async def test_rejected_and_superseded_observations_are_refused(
    send_client: tuple[httpx.AsyncClient, User], state: str
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_state(observation, state)
    response = await client.post(f"/api/v1/eregister/observations/{observation}/email")
    assert response.status_code == 409
    assert state in response.json()["detail"]


@pytest.mark.usefixtures("recipients")
async def test_only_synop_can_be_sent(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client, kind="METAR")
    response = await client.post(f"/api/v1/eregister/observations/{observation}/email")
    assert response.status_code == 409


@pytest.mark.usefixtures("recipients")
async def test_acceptance_can_be_required(
    send_client: tuple[httpx.AsyncClient, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = send_client
    monkeypatch.setattr(sends.eregister_settings, "SEND_REQUIRE_ACCEPTED", True)
    observation = await save(client)
    url = f"/api/v1/eregister/observations/{observation}/email"
    assert (await client.post(url)).status_code == 409
    await set_state(observation, "accepted")
    assert (await client.post(url)).status_code == 202


@pytest.mark.usefixtures("recipients")
async def test_invalid_workbook_is_422(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_body(observation, {**FULL_ROW, "dew_point": "290"})
    response = await client.post(f"/api/v1/eregister/observations/{observation}/email")
    assert response.status_code == 422
    assert "dew_point" in response.json()["detail"]


@pytest.mark.usefixtures("recipients")
async def test_unknown_observation_is_404(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    response = await client.post(f"/api/v1/eregister/observations/{uuid4()}/email")
    assert response.status_code == 404


async def test_publish_is_409_until_configured(
    send_client: tuple[httpx.AsyncClient, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = send_client
    monkeypatch.setattr(sends.wis2box_settings, "WIS2BOX_INCOMING_DIR", None)
    monkeypatch.setattr(sends.wis2box_settings, "WIS2BOX_S3_ENDPOINT_URL", None)
    observation = await save(client, accepted=True)
    response = await client.post(
        f"/api/v1/eregister/observations/{observation}/publish"
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "WIS2 publication is not configured"


@pytest.mark.usefixtures("incoming")
async def test_publish_other_station_is_409(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client, {**FULL_ROW, "station_id": "78959"}, accepted=True)
    response = await client.post(
        f"/api/v1/eregister/observations/{observation}/publish"
    )
    assert response.status_code == 409
    assert "78959" in response.json()["detail"]


async def test_publish_queues_then_the_job_writes_the_csv(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    observation = await save(client, accepted=True)
    url = f"/api/v1/eregister/observations/{observation}/publish"
    response = await client.post(url)
    assert response.status_code == 202, response.text
    assert response.json()["status"] == "queued"
    again = await client.post(url)
    assert again.status_code == 409
    assert not found(incoming, "*.csv")

    handled = await publisher.process_due_publications(
        session=db_async, config=sends.wis2box_settings
    )
    assert handled == 1
    files = found(incoming, "wmo_data_*.csv")
    assert [f.name for f in files] == ["wmo_data_0-20000-0-78958_20260330T1200.csv"]
    assert files[0].parent.relative_to(incoming).as_posix() == (
        "origin/a/wis2/gd-metservice/data/core/weather/surface-based-observations/synop"
    )
    assert first_line(files[0]) == ",".join(encode.WIS2_COLUMNS)
    assert not found(incoming, "*.part")

    listed = (
        await client.get(f"/api/v1/eregister/observations/{observation}/sends")
    ).json()
    assert [(s["target"], s["status"], s["attempts"]) for s in listed["sends"]] == [
        ("wis2", "sent", 1)
    ]
    log = (await db_async.scalars(select(ERegisterSend))).one()
    await db_async.refresh(log)
    assert "content" not in log.detail
    # Nothing left to do on the next tick.
    assert (
        await publisher.process_due_publications(
            session=db_async, config=sends.wis2box_settings
        )
        == 0
    )


def found(root: Path, pattern: str) -> list[Path]:
    return list(root.rglob(pattern))


def first_line(path: Path) -> str:
    return path.read_text().splitlines()[0]


async def _queued_wis2(
    client: httpx.AsyncClient, db_async: AsyncSession
) -> ERegisterSend:
    observation = await save(client, accepted=True)
    response = await client.post(
        f"/api/v1/eregister/observations/{observation}/publish"
    )
    assert response.status_code == 202, response.text
    log = await db_async.get(ERegisterSend, UUID(response.json()["id"]))
    assert log is not None
    return log


async def test_job_failure_retries_with_backoff_then_fails(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    log = await _queued_wis2(client, db_async)
    calls: list[str] = []

    def failing(key: str, _content: str) -> None:
        calls.append(key)
        raise OSError("wis2box unreachable")

    config = Wis2boxConfig(WIS2BOX_INCOMING_DIR=str(incoming), WIS2BOX_MAX_ATTEMPTS=3)
    assert (
        await publisher.process_due_publications(
            session=db_async, sink=failing, config=config
        )
        == 1
    )
    await db_async.refresh(log)
    assert (log.status, log.attempts) == ("queued", 1)
    assert log.last_error == "wis2box unreachable"
    assert log.next_retry_at is not None
    # Not due yet: the job leaves it alone.
    assert (
        await publisher.process_due_publications(
            session=db_async, sink=failing, config=config
        )
        == 0
    )
    for attempt in (2, 3):
        log.next_retry_at = log.next_retry_at - timedelta(days=1)
        await db_async.commit()
        await publisher.process_due_publications(
            session=db_async, sink=failing, config=config
        )
        await db_async.refresh(log)
        assert log.attempts == attempt
    assert log.status == "failed"
    assert len(calls) == 3
    assert publisher.retry_delay_seconds(1) == 60
    assert publisher.retry_delay_seconds(3) == 240
    assert publisher.retry_delay_seconds(30) == 3600
    # A failed publish may be queued again without an explicit resend.
    again = await client.post(
        f"/api/v1/eregister/observations/{log.observation_id}/publish"
    )
    assert again.status_code == 202


async def test_job_recovers_after_a_failure(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    log = await _queued_wis2(client, db_async)
    stored: list[str] = []
    state = {"fail": True}

    def flaky(key: str, _content: str) -> None:
        if state["fail"]:
            raise OSError("down")
        stored.append(key)

    config = Wis2boxConfig(WIS2BOX_INCOMING_DIR=str(incoming))
    await publisher.process_due_publications(
        session=db_async, sink=flaky, config=config
    )
    state["fail"] = False
    await db_async.refresh(log)
    log.next_retry_at = log.next_retry_at - timedelta(days=1)
    await db_async.commit()
    await publisher.process_due_publications(
        session=db_async, sink=flaky, config=config
    )
    await db_async.refresh(log)
    assert (log.status, log.attempts, log.last_error) == ("sent", 2, None)
    assert len(stored) == 1


def test_directory_sink_refuses_keys_outside_the_directory(tmp_path: Path) -> None:
    sink = publisher.directory_sink(Wis2boxConfig(WIS2BOX_INCOMING_DIR=str(tmp_path)))
    with pytest.raises(ValueError, match="escapes"):
        sink("../outside.csv", "x")


@pytest.mark.usefixtures("recipients")
async def test_email_history_follows_the_outbox(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    client, _ = send_client
    observation = await save(client)
    await client.post(f"/api/v1/eregister/observations/{observation}/email")
    history = f"/api/v1/eregister/observations/{observation}/sends"
    assert (await client.get(history)).json()["sends"][0]["status"] == "queued"
    for mail in (await db_async.scalars(select(OutboundEmail))).all():
        mail.status = "sent"
        mail.sent_at = datetime.now(UTC).replace(tzinfo=None)
    await db_async.commit()
    assert (await client.get(history)).json()["sends"][0]["status"] == "sent"


@pytest.mark.usefixtures("recipients")
async def test_email_history_reports_a_delivery_that_gave_up(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    client, _ = send_client
    observation = await save(client)
    await client.post(f"/api/v1/eregister/observations/{observation}/email")
    for mail in (await db_async.scalars(select(OutboundEmail))).all():
        mail.status = "failed"
        mail.attempts = 99
        mail.last_error = "mailbox full"
    await db_async.commit()
    sent = (
        await client.get(f"/api/v1/eregister/observations/{observation}/sends")
    ).json()
    assert sent["sends"][0]["status"] == "failed"
    assert sent["sends"][0]["last_error"] == "mailbox full"


# --- Accept, optional review, reject, reopen ------------------------------------


async def as_staff(db_async: AsyncSession, key: str = "eregister.qc") -> User:
    """Switch the request user to someone holding only one register permission."""
    person = await make_user(db_async)
    role, _perms = await make_role_with_permission(db_async, key)
    await assign_role(db_async, user=person, role=role)
    app.dependency_overrides[get_browser_or_token_user] = lambda: person
    return person


def qc_url(observation: str, action: str) -> str:
    return f"/api/v1/eregister/observations/{observation}/{action}"


async def set_body(observation: str, body: dict[str, Any]) -> None:
    """Store a body directly (saving a workbook with errors is refused)."""
    await register_exec(
        "UPDATE register_observations SET body = CAST(:b AS jsonb) WHERE id = :i",
        b=json.dumps(body),
        i=observation,
    )


@pytest.mark.usefixtures("incoming", "recipients")
async def test_observer_accepts_alone_and_it_goes_out_at_once(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, observer = send_client
    observation = await save(client)
    accepted = await client.post(
        qc_url(observation, "accept"), json={"reason": "checked against the log"}
    )
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert body["state"] == "accepted"
    assert body["qc_by"] == str(observer.id)
    assert body["reviewed_at"] is None
    listed = (await client.get(qc_url(observation, "sends"))).json()["sends"]
    assert {(s["target"], s["status"]) for s in listed} == {
        ("wis2", "queued"),
        ("email", "queued"),
    }
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.entity_id == observation)
        )
    ).all()
    assert [(e.action, e.actor_user_id) for e in entries] == [("accept", observer.id)]
    assert (await client.post(qc_url(observation, "accept"))).status_code == 409


async def test_other_register_staff_may_accept_too(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client)
    staff = await as_staff(db_async, "eregister.observe")
    accepted = await client.post(qc_url(observation, "accept"))
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["qc_by"] == str(staff.id)


@pytest.mark.usefixtures("incoming", "recipients")
async def test_review_is_optional_recorded_and_never_blocks_sending(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, observer = send_client
    observation = await save(client)
    # The observer cannot review their own record.
    own = await client.post(qc_url(observation, "review"), json={"outcome": "reviewed"})
    assert own.status_code == 403
    assert (await client.post(qc_url(observation, "accept"))).status_code == 200
    queue = "/api/v1/eregister/observations?state=accepted&reviewed=false"
    assert [o["id"] for o in (await client.get(queue)).json()["observations"]] == [
        observation
    ]
    reviewer = await as_staff(db_async, "eregister.send")
    # A query needs a note; a plain review does not.
    bare = await client.post(qc_url(observation, "review"), json={"outcome": "query"})
    assert bare.status_code == 422
    queried = await client.post(
        qc_url(observation, "review"),
        json={"outcome": "query", "note": "Pressure looks high"},
    )
    assert queried.status_code == 200, queried.text
    body = queried.json()
    assert body["state"] == "accepted"
    assert (body["review_outcome"], body["review_note"]) == (
        "query",
        "Pressure looks high",
    )
    assert body["reviewed_by"] == str(reviewer.id)
    assert (await client.get(queue)).json()["observations"] == []
    done = "/api/v1/eregister/observations?reviewed=true"
    assert len((await client.get(done)).json()["observations"]) == 1
    final = await client.post(
        qc_url(observation, "review"), json={"outcome": "reviewed"}
    )
    assert final.json()["review_outcome"] == "reviewed"
    # Nothing was held back or added by the reviews.
    sent = (await client.get(qc_url(observation, "sends"))).json()["sends"]
    assert len(sent) == 2
    actions = (
        await db_async.scalars(
            select(AuditEntry.action)
            .where(AuditEntry.entity_id == observation)
            .order_by(AuditEntry.created_at)
        )
    ).all()
    assert list(actions) == ["accept", "review", "review"]
    del observer


async def test_review_is_refused_for_rejected_observations(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_state(observation, "rejected")
    await as_staff(db_async)
    response = await client.post(
        qc_url(observation, "review"), json={"outcome": "reviewed"}
    )
    assert response.status_code == 409


async def test_qc_needs_register_access(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client)
    plain = await make_user(db_async)
    app.dependency_overrides[get_browser_or_token_user] = lambda: plain
    for action in ("accept", "reject", "reopen"):
        response = await client.post(
            qc_url(observation, action), json={"reason": "x y z"}
        )
        assert response.status_code == 403, action
    review = await client.post(
        qc_url(observation, "review"), json={"outcome": "reviewed"}
    )
    assert review.status_code == 403


async def test_accept_rejects_a_workbook_that_fails_validation(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client)
    await set_body(observation, {**FULL_ROW, "dew_point": "290"})
    response = await client.post(qc_url(observation, "accept"))
    assert response.status_code == 422
    assert "dew_point" in response.json()["detail"]["message"]
    assert any(i["field"] == "dew_point" for i in response.json()["detail"]["issues"])


async def test_reject_and_reopen_need_a_reason(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client)
    await as_staff(db_async)
    assert (await client.post(qc_url(observation, "reject"))).status_code == 422
    rejected = await client.post(
        qc_url(observation, "reject"), json={"reason": "Wrong station"}
    )
    assert rejected.status_code == 200
    assert rejected.json()["state"] == "rejected"
    assert (await client.post(qc_url(observation, "accept"))).status_code == 409
    assert (await client.post(qc_url(observation, "reopen"))).status_code == 422
    reopened = await client.post(
        qc_url(observation, "reopen"), json={"reason": "Observer corrected it"}
    )
    assert reopened.json()["state"] == "qc_pending"
    accepted = await client.post(qc_url(observation, "accept"))
    assert accepted.json()["state"] == "accepted"
    assert (await client.post(qc_url(observation, "accept"))).status_code == 409
    actions = (
        await db_async.scalars(
            select(AuditEntry.action)
            .where(AuditEntry.entity_id == observation)
            .order_by(AuditEntry.created_at)
        )
    ).all()
    assert list(actions) == ["reject", "reopen", "accept"]


async def test_qc_unknown_observation_is_404_and_metar_is_not_accepted(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    metar = await save(client, kind="METAR")
    assert (await client.post(qc_url(str(uuid4()), "accept"))).status_code == 404
    assert (await client.post(qc_url(metar, "accept"))).status_code == 409


async def test_queue_filters_by_state_and_pages(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    base = "/api/v1/eregister/observations"
    first = await save(client)
    await save(client, observed_at=(OBSERVED + timedelta(minutes=1)).isoformat())
    third = await save(
        client, accepted=True, observed_at=(OBSERVED + timedelta(minutes=2)).isoformat()
    )
    listed = (await client.get(f"{base}?state=draft")).json()
    assert listed["total"] == 2
    assert first in {o["id"] for o in listed["observations"]}
    listed = (await client.get(f"{base}?state=accepted")).json()
    assert [o["id"] for o in listed["observations"]] == [third]
    listed = (await client.get(f"{base}?state=draft,accepted")).json()
    assert listed["total"] == 3
    page = (await client.get(f"{base}?limit=2&offset=2")).json()
    assert page["total"] == 3
    assert [o["id"] for o in page["observations"]] == [first]
    assert (await client.get(f"{base}?state=bogus")).status_code == 422
    # Queue rows carry the coded row, findings and who recorded them.
    row = (await client.get(f"{base}?state=draft")).json()["observations"][0]
    assert row["coded"].startswith("AAXX 30124 78958")
    assert row["actor_name"]
    assert isinstance(row["issues"], list)


@pytest.mark.usefixtures("incoming")
async def test_wis2_needs_acceptance_but_email_does_not(
    send_client: tuple[httpx.AsyncClient, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = send_client
    monkeypatch.setattr(sends.eregister_settings, "SEND_REQUIRE_ACCEPTED", False)
    monkeypatch.setattr(sends.eregister_settings, "OBS_RECIPIENTS", "a@gms.test")
    observation = await save(client)
    base = f"/api/v1/eregister/observations/{observation}"
    refused = await client.post(f"{base}/publish")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Only QC-accepted observations can be sent"
    assert (await client.post(f"{base}/email")).status_code == 202


@pytest.mark.usefixtures("incoming")
async def test_reopen_is_refused_once_queued_for_wis2(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client, accepted=True)
    queued = await client.post(f"/api/v1/eregister/observations/{observation}/publish")
    assert queued.status_code == 202, queued.text
    await as_staff(db_async)
    response = await client.post(
        qc_url(observation, "reopen"), json={"reason": "Found an error"}
    )
    assert response.status_code == 409
    assert "WIS2" in response.json()["detail"]


# --- Saving: validation, one live row per hour, corrections ---------------------

OBS_URL = "/api/v1/eregister/observations"


def record(**changes: Any) -> dict[str, Any]:
    return {
        "station_id": "78958",
        "kind": "SYNOP",
        "observed_at": OBSERVED.isoformat(),
        "body": {**FULL_ROW, "source": "eregister-workbook"},
        **changes,
    }


async def test_save_refuses_a_synop_with_errors_and_returns_the_issues(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    bad = record(body={**FULL_ROW, "dew_point": "290"})
    response = await client.post(OBS_URL, json=bad)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "dew_point" in detail["message"]
    assert any(i["code"] == "dew_above_air" for i in detail["issues"])
    assert (await client.get(OBS_URL)).json()["observations"] == []


async def test_save_refuses_a_workbook_time_that_differs_from_observed_at(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    for changes in ({"time_utc": "09"}, {"day": "29"}):
        response = await client.post(OBS_URL, json=record(body={**FULL_ROW, **changes}))
        assert response.status_code == 422, changes
        codes = {i["code"] for i in response.json()["detail"]["issues"]}
        assert "time_mismatch" in codes


async def test_save_allows_warnings_and_does_not_validate_aviation_text(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    at = OBSERVED + timedelta(hours=1)  # 13 UTC is a non-synoptic hour: a warning
    ok = await client.post(
        OBS_URL,
        json=record(observed_at=at.isoformat(), body={**FULL_ROW, "time_utc": "13"}),
    )
    assert ok.status_code == 201, ok.text
    metar = await client.post(OBS_URL, json=record(kind="METAR", body={"x": "y"}))
    assert metar.status_code == 201


async def test_a_failing_history_query_does_not_break_saving_or_correcting(
    send_client: tuple[httpx.AsyncClient, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = send_client
    real_text = entries.text

    def broken_history(sql: str) -> Any:
        # Only the hour-to-hour history query fails; the transaction goes on.
        if "ORDER BY created_at DESC LIMIT 1" in sql:
            return real_text("SELECT body FROM no_such_history_table")
        return real_text(sql)

    monkeypatch.setattr(entries, "text", broken_history)
    first = await client.post(OBS_URL, json=record())
    assert first.status_code == 201, first.text
    edited = {**FULL_ROW, "air_temp": "0291", "source": "eregister-workbook"}
    corrected = await client.post(
        f"{OBS_URL}/{first.json()['id']}/correct",
        json={"body": edited, "reason": "typo in the air temperature"},
    )
    assert corrected.status_code == 201, corrected.text


async def test_resaving_the_same_hour_updates_the_observers_own_draft(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    first = await client.post(OBS_URL, json=record())
    assert first.status_code == 201
    edited = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    again = await client.post(OBS_URL, json=record(body=edited))
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["body"]["air_temp"] == "0290"
    assert len((await client.get(OBS_URL)).json()["observations"]) == 1
    # Someone else cannot overwrite it.
    await as_staff(db_async, "eregister.observe")
    clash = await client.post(OBS_URL, json=record())
    assert clash.status_code == 409
    assert first.json()["id"] in clash.json()["detail"]


async def test_an_accepted_hour_cannot_be_resaved_only_corrected(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    await save(client, accepted=True)
    assert (await client.post(OBS_URL, json=record())).status_code == 409


async def test_the_database_allows_one_live_row_per_station_hour_and_kind(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client)
    with pytest.raises(IntegrityError):
        await register_exec(
            "INSERT INTO register_observations (id, station_id, kind, observed_at,"
            " body, actor_id) VALUES (gen_random_uuid(), '78958', 'SYNOP',"
            " :at, '{}', 'x')",
            at=OBSERVED,
        )
    # A rejected row leaves the live set, so the hour can be keyed again.
    await set_state(observation, "rejected")
    assert (await client.post(OBS_URL, json=record())).status_code == 201


@pytest.mark.usefixtures("incoming", "recipients")
async def test_correction_after_wis2_is_sent_again_marked_as_a_correction(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (await client.post(qc_url(original, "accept"))).status_code == 200
    await publisher.process_due_publications(
        session=db_async, config=sends.wis2box_settings
    )
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    fixed = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    assert fixed.status_code == 201, fixed.text
    replacement = fixed.json()
    assert replacement["supersedes_id"] == original
    assert replacement["state"] == "draft"
    listed = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    # The old reading stays listed (the UI shows it struck through).
    assert listed == {original: "superseded", replacement["id"]: "draft"}
    again = await client.post(qc_url(original, "correct"), json={"body": fixed_body})
    assert again.status_code == 409
    assert "superseded" in again.json()["detail"]
    # Accepting the replacement queues a correction for the sent hour.
    accepted = await client.post(qc_url(replacement["id"], "accept"))
    assert accepted.status_code == 200
    sent = (await client.get(qc_url(replacement["id"], "sends"))).json()["sends"]
    wis2 = [s for s in sent if s["target"] == "wis2"]
    assert [(s["status"], s["is_correction"]) for s in wis2] == [("queued", True)]
    email = [s for s in sent if s["target"] == "email"]
    assert [s["is_correction"] for s in email] == [True]
    holders = await register_rows(
        "SELECT observation_id FROM observations.publish_gate"
    )
    assert [str(r["observation_id"]) for r in holders] == [replacement["id"]]
    mails = (await db_async.scalars(select(OutboundEmail))).all()
    assert any("CORRECTION" in mail.subject for mail in mails)
    assert any(m.html and "CCA" in m.html for m in mails)
    # The same hour cannot be sent a second time as a plain publish.
    assert (await client.post(publish_url(replacement["id"]))).status_code == 409


async def test_a_bad_or_rejected_correction_is_refused(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client)
    bad = await client.post(
        qc_url(observation, "correct"),
        json={"body": {**FULL_ROW, "dew_point": "290"}},
    )
    assert bad.status_code == 422
    assert (await client.get(OBS_URL)).json()["observations"][0]["state"] == "draft"
    missing = await client.post(
        qc_url(str(uuid4()), "correct"), json={"body": FULL_ROW}
    )
    assert missing.status_code == 404
    await set_state(observation, "rejected")
    refused = await client.post(qc_url(observation, "correct"), json={"body": FULL_ROW})
    assert refused.status_code == 409
    assert "rejected" in refused.json()["detail"]


# --- ADR-0032 observation store and publish gate -------------------------------


def test_official_source_follows_the_schedule_in_utc() -> None:
    noon = datetime(2026, 3, 30, 12, 30, tzinfo=UTC)
    night = datetime(2026, 3, 30, 2, 0, tzinfo=UTC)
    assert gate.official_source("automatic", [], noon) == "automatic"
    assert gate.official_source("manual", [], night) == "manual"
    hours = list(range(10, 22))
    assert gate.official_source("hybrid", hours, noon) == "manual"
    assert gate.official_source("hybrid", hours, night) == "automatic"
    assert gate.valid_hour(noon) == datetime(2026, 3, 30, 12, 0, tzinfo=UTC)


async def register_rows(sql: str, **params: Any) -> list[dict[str, Any]]:
    """Query the register DB through the test's session override."""
    async with asynccontextmanager(app.dependency_overrides[get_session])() as value:
        result = await value.execute(text(sql), params)
        return [dict(row) for row in result.mappings()]


async def register_exec(sql: str, **params: Any) -> None:
    async with asynccontextmanager(app.dependency_overrides[get_session])() as value:
        await value.execute(text(sql), params)
        await value.commit()


def publish_url(observation: str) -> str:
    return f"/api/v1/eregister/observations/{observation}/publish"


async def test_gate_refuses_an_hour_the_schedule_gives_to_automatic(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    await register_exec("UPDATE observations.stations SET schedule = 'automatic'")
    observation = await save(client, accepted=True)
    refused = await client.post(publish_url(observation))
    assert refused.status_code == 409
    assert "automatic source" in refused.json()["detail"]
    assert (
        await publisher.process_due_publications(
            session=db_async, config=sends.wis2box_settings
        )
        == 0
    )
    assert not found(incoming, "*.csv")
    decisions = await register_rows(
        "SELECT outcome, official_source FROM observations.publish_gate_decisions"
    )
    assert decisions == [{"outcome": "refused", "official_source": "automatic"}]
    assert await register_rows("SELECT * FROM observations.publish_gate") == []


@pytest.mark.usefixtures("incoming")
async def test_hybrid_station_publishes_only_its_manual_hours(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    # OBSERVED is 12 UTC: manual by day, automatic overnight.
    await register_exec(
        "UPDATE observations.stations SET schedule = 'hybrid',"
        " manual_hours_utc = ARRAY[12, 13]::smallint[]"
    )
    day = await save(client, accepted=True)
    assert (await client.post(publish_url(day))).status_code == 202
    await register_exec("UPDATE observations.stations SET manual_hours_utc = '{}'")
    night = await save(
        client,
        accepted=True,
        observed_at=(OBSERVED + timedelta(hours=1)).isoformat(),
        body={**FULL_ROW, "time_utc": "13"},
    )
    assert (await client.post(publish_url(night))).status_code == 409


@pytest.mark.usefixtures("incoming")
async def test_unregistered_station_is_refused(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    await register_exec("DELETE FROM observations.stations")
    observation = await save(client, accepted=True)
    refused = await client.post(publish_url(observation))
    assert refused.status_code == 409
    assert "registry" in refused.json()["detail"]


async def test_a_station_hour_publishes_once_even_for_a_second_observation(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    first = await save(client, accepted=True)
    second = await save(
        client,
        accepted=True,
        observed_at=(OBSERVED + timedelta(minutes=20)).isoformat(),
    )
    assert (await client.post(publish_url(first))).status_code == 202
    other = await client.post(publish_url(second))
    assert other.status_code == 409
    assert "already claimed" in other.json()["detail"]
    # resend cannot bypass the gate or queue the same file twice
    assert (
        await client.post(publish_url(first), json={"resend": True})
    ).status_code == 409
    await publisher.process_due_publications(
        session=db_async, config=sends.wis2box_settings
    )
    assert len(found(incoming, "wmo_data_*.csv")) == 1
    outcomes = [
        row["outcome"]
        for row in await register_rows(
            "SELECT outcome FROM observations.publish_gate_decisions ORDER BY decided_at"
        )
    ]
    assert outcomes == ["claimed", "refused", "reused"]


async def test_concurrent_publishes_of_one_station_hour_queue_exactly_one(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    observations = [
        await save(
            client,
            accepted=True,
            observed_at=(OBSERVED + timedelta(minutes=minute)).isoformat(),
        )
        for minute in range(4)
    ]
    results = await asyncio.gather(
        *(client.post(publish_url(obs)) for obs in observations)
    )
    assert sorted(r.status_code for r in results) == [202, 409, 409, 409]
    claims = await register_rows("SELECT observation_id FROM observations.publish_gate")
    assert len(claims) == 1
    queued = (
        await db_async.scalars(
            select(ERegisterSend).where(ERegisterSend.target == "wis2")
        )
    ).all()
    assert len(queued) == 1
    await publisher.process_due_publications(
        session=db_async, config=sends.wis2box_settings
    )
    assert len(found(incoming, "wmo_data_*.csv")) == 1


@pytest.mark.usefixtures("incoming")
async def test_concurrent_publishes_of_the_same_observation_queue_one(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
) -> None:
    client, _ = send_client
    observation = await save(client, accepted=True)
    results = await asyncio.gather(
        *(client.post(publish_url(observation)) for _ in range(3))
    )
    assert sorted(r.status_code for r in results) == [202, 409, 409]
    queued = (
        await db_async.scalars(
            select(ERegisterSend).where(ERegisterSend.target == "wis2")
        )
    ).all()
    assert len(queued) == 1


@pytest.mark.usefixtures("send_client")
async def test_upsert_is_idempotent_and_flags_non_hourly_rows() -> None:
    async with asynccontextmanager(app.dependency_overrides[get_session])() as value:
        for reading in (21.0, 22.5):
            await store.upsert_observation(
                value,
                station_id="78958",
                element="air_temperature",
                valid_time_utc=OBSERVED,
                source="sutron",
                value=reading,
                unit="degC",
            )
        await store.upsert_observation(
            value,
            station_id="78958",
            element="air_temperature",
            valid_time_utc=OBSERVED + timedelta(minutes=7),
            source="sutron",
            value=23.0,
        )
        await store.upsert_observation(
            value,
            station_id="78958",
            element="air_temperature",
            valid_time_utc=OBSERVED,
            source="eregister",
            value=22.0,
        )
        with pytest.raises(ValueError, match="timezone-aware"):
            await store.upsert_observation(
                value,
                station_id="78958",
                element="x",
                valid_time_utc=OBSERVED.replace(tzinfo=None),
                source="s",
                value=1,
            )
    rows = await register_rows(
        "SELECT source, value, is_hourly FROM observations.observations"
        " ORDER BY source, valid_time_utc"
    )
    assert rows == [
        {"source": "eregister", "value": 22.0, "is_hourly": True},
        {"source": "sutron", "value": 22.5, "is_hourly": True},
        {"source": "sutron", "value": 23.0, "is_hourly": False},
    ]


@pytest.mark.usefixtures("recipients")
async def test_a_failed_original_cannot_overwrite_its_correction_on_retry(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (await client.post(qc_url(original, "accept"))).status_code == 200
    delivered: list[str] = []

    def unreachable(_key: str, _content: str) -> None:
        raise OSError("wis2box unreachable")

    config = Wis2boxConfig(WIS2BOX_INCOMING_DIR=str(incoming), WIS2BOX_MAX_ATTEMPTS=5)
    await publisher.process_due_publications(
        session=db_async, sink=unreachable, config=config
    )
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    fixed = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    replacement = fixed.json()["id"]
    assert (await client.post(qc_url(replacement, "accept"))).status_code == 200

    def recording(_key: str, content: str) -> None:
        delivered.append(content)

    # Both retries are now due; only the correction may still be delivered.
    for log in await db_async.scalars(select(ERegisterSend)):
        log.next_retry_at = None
    await db_async.commit()
    await publisher.process_due_publications(
        session=db_async, sink=recording, config=config
    )
    assert len(delivered) == 1
    assert "290" in delivered[0] or "302.15" in delivered[0]
    old = (await client.get(qc_url(original, "sends"))).json()["sends"]
    wis2 = [s for s in old if s["target"] == "wis2"]
    assert [s["status"] for s in wis2] == ["failed"]
    assert "correction" in (wis2[0]["last_error"] or "")


async def test_reopening_a_rejected_hour_that_was_keyed_again_is_a_conflict(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    first = await save(client)
    await as_staff(db_async)
    rejected = await client.post(
        qc_url(first, "reject"), json={"reason": "Wrong station"}
    )
    assert rejected.status_code == 200
    second = await client.post(OBS_URL, json=record())
    assert second.status_code == 201
    # The hour is occupied again: reopening the first would break the one-live-row rule.
    reopen = await client.post(
        qc_url(first, "reopen"), json={"reason": "Observer corrected it"}
    )
    assert reopen.status_code == 409, reopen.text
    assert "holds this hour" in reopen.json()["detail"]
    state = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    assert state[first] == "rejected"


async def test_editing_a_reviewed_draft_clears_the_review(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, observer = send_client
    first = await client.post(OBS_URL, json=record())
    observation = first.json()["id"]
    await as_staff(db_async, "eregister.send")
    reviewed = await client.post(
        qc_url(observation, "review"), json={"outcome": "reviewed"}
    )
    assert reviewed.json()["review_outcome"] == "reviewed"
    # The observer changes the reading after the review.
    app.dependency_overrides[get_browser_or_token_user] = lambda: observer
    edited = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    again = await client.post(OBS_URL, json=record(body=edited))
    assert again.status_code == 200, again.text
    body = again.json()
    assert body["review_outcome"] is None
    assert body["reviewed_by"] is None
    assert body["reviewed_at"] is None
    unreviewed = "/api/v1/eregister/observations?reviewed=false"
    assert [o["id"] for o in (await client.get(unreviewed)).json()["observations"]] == [
        observation
    ]


def test_migration_keeps_the_publish_gate_holder_when_resolving_duplicate_rows(
    fresh_weather_engine: Engine,
) -> None:
    config = Config(str(ROOT / "src/eregister/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    older, newer = uuid4(), uuid4()
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "eregister_0003")
        for row, created in ((older, "2026-03-30 12:05"), (newer, "2026-03-30 12:30")):
            connection.execute(
                text(
                    "INSERT INTO register_observations (id, station_id, kind,"
                    " observed_at, body, state, actor_id, created_at) VALUES (:i,"
                    " '78958', 'SYNOP', :at, '{}', 'accepted', 'x', :c)"
                ),
                {"i": row, "at": OBSERVED, "c": created + "+00"},
            )
        # The older row already published the hour.
        connection.execute(
            text(
                "INSERT INTO observations.publish_gate (station_id, valid_hour,"
                " source, observation_id) VALUES ('78958', :at, 'manual', :i)"
            ),
            {"at": OBSERVED, "i": older},
        )
        command.upgrade(config, "head")
        states = dict(
            connection.execute(
                text("SELECT id, state FROM register_observations")
            ).all()
        )
    assert states == {older: "accepted", newer: "superseded"}


async def test_a_refused_hand_off_after_acceptance_is_explained_in_the_history(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    # No WIS2 sink and no recipients are configured here.
    observation = await save(client)
    assert (await client.post(qc_url(observation, "accept"))).status_code == 200
    sends_ = (await client.get(qc_url(observation, "sends"))).json()["sends"]
    by_target = {s["target"]: s for s in sends_}
    assert {t: s["status"] for t, s in by_target.items()} == {
        "wis2": "failed",
        "email": "failed",
    }
    assert "not configured" in by_target["wis2"]["last_error"]
    assert by_target["email"]["last_error"]


@pytest.mark.usefixtures("recipients")
async def test_an_original_paused_after_claiming_the_hour_cannot_overtake_its_correction(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = send_client
    original = await save(client)
    claimed, proceed = asyncio.Event(), asyncio.Event()
    real_claim = gate.claim_manual_hour
    calls = 0

    async def paused_claim(*args: Any, **kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        result = await real_claim(*args, **kwargs)
        if calls == 1:
            claimed.set()
            await proceed.wait()
        return result

    monkeypatch.setattr(gate, "claim_manual_hour", paused_claim)
    accepting = asyncio.create_task(client.post(qc_url(original, "accept")))
    await asyncio.wait_for(claimed.wait(), 10)
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    # The correction waits for the original's queueing (same station-hour lock).
    fixing = asyncio.create_task(
        client.post(
            qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
        )
    )
    await asyncio.sleep(0.5)
    assert not fixing.done()
    proceed.set()
    assert (await asyncio.wait_for(accepting, 20)).status_code == 200
    fixed = await asyncio.wait_for(fixing, 20)
    replacement = fixed.json()["id"]
    accepted = await client.post(qc_url(replacement, "accept"))
    assert accepted.status_code == 200

    config = Wis2boxConfig(WIS2BOX_INCOMING_DIR=str(incoming), WIS2BOX_MAX_ATTEMPTS=5)
    delivered: list[str] = []

    def recording(_key: str, content: str) -> None:
        delivered.append(content)

    await publisher.process_due_publications(
        session=db_async, sink=recording, config=config
    )
    # Only the correction goes out; the original never lands over it.
    assert len(delivered) == 1
    assert ",301.15," not in delivered[0]


async def test_list_can_find_the_record_for_one_hour_and_bounds_the_offset(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    observation = await save(client)
    exact = await client.get(OBS_URL, params={"observed_at": OBSERVED.isoformat()})
    assert [o["id"] for o in exact.json()["observations"]] == [observation]
    other = await client.get(
        OBS_URL, params={"observed_at": (OBSERVED + timedelta(hours=1)).isoformat()}
    )
    assert other.json()["observations"] == []
    too_far = await client.get(OBS_URL, params={"offset": 9223372036854775808})
    assert too_far.status_code == 422


async def test_an_overlong_workbook_value_is_a_422_with_the_field_named(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    response = await client.post(
        OBS_URL,
        json=record(body={**FULL_ROW, "day": "123", "source": "eregister-workbook"}),
    )
    assert response.status_code == 422, response.text
    issues = response.json()["detail"]["issues"]
    assert [(i["field"], i["code"]) for i in issues] == [("day", "invalid_value")]


async def test_a_refused_hand_off_survives_the_rollback_that_expires_the_user(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, user = send_client
    observation = await save(client)
    await set_state(observation, "accepted")
    # The user object belongs to the session that is rolled back after a refusal.
    db_async.add(user)
    async with asynccontextmanager(app.dependency_overrides[get_session])() as register:
        await sends.dispatch_after_acceptance(
            session=db_async,
            register=register,
            observation_id=UUID(observation),
            user=user,
        )
    logs = (await db_async.scalars(select(ERegisterSend))).all()
    assert {(log.target, log.status) for log in logs} == {
        ("wis2", "failed"),
        ("email", "failed"),
    }
    assert {log.created_by for log in logs} == {user.id}


@pytest.mark.usefixtures("recipients")
async def test_a_pending_correction_holds_the_replaced_retry(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (await client.post(qc_url(original, "accept"))).status_code == 200

    def unreachable(_key: str, _content: str) -> None:
        raise OSError("wis2box unreachable")

    config = Wis2boxConfig(WIS2BOX_INCOMING_DIR=str(incoming), WIS2BOX_MAX_ATTEMPTS=5)
    await publisher.process_due_publications(
        session=db_async, sink=unreachable, config=config
    )
    queued = (
        await db_async.scalars(
            select(ERegisterSend).where(ERegisterSend.target == "wis2")
        )
    ).one()
    assert (queued.status, queued.attempts) == ("queued", 1)
    # A correction is saved but its observer never accepts it.
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    fixed = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    assert fixed.status_code == 201, fixed.text
    delivered: list[str] = []

    def recording(_key: str, content: str) -> None:
        delivered.append(content)

    await publisher.process_due_publications(
        session=db_async, sink=recording, config=config
    )
    assert delivered == []
    await db_async.refresh(queued)
    # Held, not dropped: the correction may still be rejected.
    assert queued.status == "queued"
    assert "correction" in (queued.last_error or "")

    # Rejecting the correction releases the original, which goes out on the next run.
    await as_staff(db_async)
    rejected = await client.post(
        qc_url(fixed.json()["id"], "reject"), json={"reason": "Not needed"}
    )
    assert rejected.status_code == 200, rejected.text
    # The replaced reading is live again, so the hour stays correctable.
    states = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    assert states[original] == "accepted"
    await db_async.refresh(queued)
    assert queued.next_retry_at is None
    await publisher.process_due_publications(
        session=db_async, sink=recording, config=config
    )
    assert len(delivered) == 1
    assert ",301.15," in delivered[0]
    await db_async.refresh(queued)
    assert queued.status == "sent"


@pytest.mark.usefixtures("incoming", "recipients")
async def test_rejecting_a_correction_restores_the_original_to_accepted(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (await client.post(qc_url(original, "accept"))).status_code == 200
    await publisher.process_due_publications(
        session=db_async, config=sends.wis2box_settings
    )
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    fixed = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    assert fixed.status_code == 201, fixed.text
    correction = fixed.json()["id"]

    await as_staff(db_async)
    rejected = await client.post(
        qc_url(correction, "reject"), json={"reason": "Not needed"}
    )
    assert rejected.status_code == 200, rejected.text
    listed = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    # The rejected correction stays listed; the original is the live row again.
    assert listed == {original: "accepted", correction: "rejected"}
    # The correction reason ("typo") no longer shows on the restored original.
    notes = await register_rows(
        "SELECT qc_notes, superseded_from FROM register_observations WHERE id = :i",
        i=original,
    )
    assert notes == [{"qc_notes": None, "superseded_from": None}]
    holders = await register_rows(
        "SELECT observation_id FROM observations.publish_gate"
    )
    assert [str(r["observation_id"]) for r in holders] == [original]
    # The hour can be corrected again.
    again = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    assert again.status_code == 201, again.text
    # The audit trail records the restore on the original.
    restores = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_id == original, AuditEntry.action == "restore"
            )
        )
    ).all()
    assert len(restores) == 1


async def test_rejecting_a_correction_of_a_draft_leaves_the_original_a_draft(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    first = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    assert first.status_code == 201, first.text
    # A correction of the correction: rejecting it brings the first one back as a
    # draft, not as accepted.
    second = await client.post(
        qc_url(first.json()["id"], "correct"), json={"body": fixed_body}
    )
    assert second.status_code == 201, second.text
    await as_staff(db_async)
    assert (
        await client.post(
            qc_url(second.json()["id"], "reject"), json={"reason": "Not needed"}
        )
    ).status_code == 200
    states = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    assert states == {
        original: "superseded",
        first.json()["id"]: "draft",
        second.json()["id"]: "rejected",
    }
    # Rejecting the first correction in turn restores the original draft.
    assert (
        await client.post(
            qc_url(first.json()["id"], "reject"), json={"reason": "Not needed"}
        )
    ).status_code == 200
    states = {
        o["id"]: o["state"] for o in (await client.get(OBS_URL)).json()["observations"]
    }
    assert states[original] == "draft"


@pytest.mark.usefixtures("incoming", "recipients")
async def test_rejecting_a_correction_that_took_the_gate_gives_it_back(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (await client.post(qc_url(original, "accept"))).status_code == 200
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    fixed = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": "typo"}
    )
    correction = fixed.json()["id"]
    # Another staff member accepts it: the correction takes the gate.
    await as_staff(db_async)
    assert (await client.post(qc_url(correction, "accept"))).status_code == 200
    holders = await register_rows(
        "SELECT observation_id FROM observations.publish_gate"
    )
    assert [str(r["observation_id"]) for r in holders] == [correction]
    # Its WIS2 send fails for good, so it can be reopened and then rejected.
    for log in await db_async.scalars(
        select(ERegisterSend).where(
            ERegisterSend.observation_id == UUID(correction),
            ERegisterSend.target == "wis2",
        )
    ):
        log.status = "failed"
        log.next_retry_at = None
    await db_async.commit()
    assert (
        await client.post(qc_url(correction, "reopen"), json={"reason": "Check"})
    ).status_code == 200
    assert (
        await client.post(qc_url(correction, "reject"), json={"reason": "Not needed"})
    ).status_code == 200
    holders = await register_rows(
        "SELECT observation_id FROM observations.publish_gate"
    )
    assert [str(r["observation_id"]) for r in holders] == [original]
    decisions = await register_rows(
        "SELECT observation_id, reason FROM observations.publish_gate_decisions"
        " WHERE reason LIKE 'Hour returns%'"
    )
    assert [str(r["observation_id"]) for r in decisions] == [original]
    # The original can be published again.
    await as_staff(db_async, "eregister.send")
    published = await client.post(f"/api/v1/eregister/observations/{original}/publish")
    assert published.status_code == 202, published.text


# --- follow-ups: stored body is the record, group order, restore edge cases ---


def test_group_909_comes_before_910_and_is_sent_once() -> None:
    tac = encode.synop_tac(
        workbook(wind_gust="25", s3_group_909="90912", s3_special_phenomena="90912")
    )
    section3 = tac.split(" 333 ")[1]
    assert section3.endswith(" 90912 91025=")
    assert tac.count("90912") == 1


def test_special_phenomena_groups_are_sent_in_ascending_order() -> None:
    tac = encode.synop_tac(
        workbook(
            wind_gust="25",
            s3_group_909="90912",
            s3_special_phenomena="91125 91025 90912",
        )
    )
    assert tac.endswith(" 90912 91025 91125=")


def test_a_three_digit_gust_keeps_its_00fff_group_and_is_not_repeated() -> None:
    tac = encode.synop_tac(
        workbook(
            wind_gust="110", s3_group_909="90912", s3_special_phenomena="91099 00110"
        )
    )
    assert tac.endswith(" 90912 91099 00110=")
    assert tac.count("91099") == 1
    assert tac.count("00110") == 1


@pytest.mark.usefixtures("incoming")
async def test_an_accepted_dew_point_is_sent_as_stored(
    send_client: tuple[httpx.AsyncClient, User],
    db_async: AsyncSession,
    incoming: Path,
) -> None:
    """Reading a stored body never recomputes it: what QC accepted is what is sent."""
    client, _ = send_client
    observation = await save(client, accepted=True)
    # The wet bulb would give another dew point than the keyed 21.3.
    keyed = {**FULL_ROW, "wet_bulb": "250", "source": "eregister-workbook"}
    assert derive.derived_fields(keyed)["dew_point"] != "213"
    await set_body(observation, keyed)
    assert " 20213 " in encode.synop_tac(encode.workbook_from_body(keyed))
    listed = (await client.get(OBS_URL)).json()["observations"]
    assert " 20213 " in listed[0]["coded"]
    assert (await client.post(publish_url(observation))).status_code == 202
    await publisher.process_due_publications(
        session=db_async, config=sends.wis2box_settings
    )
    [csv_file] = found(incoming, "wmo_data_*.csv")
    row = next(csv.DictReader(io.StringIO(csv_file.read_text())))
    assert row["dewpoint_temperature"] == "294.45"


async def _correction_of(
    client: httpx.AsyncClient, original: str, reason: str = "typo"
) -> str:
    fixed_body = {**FULL_ROW, "air_temp": "0290", "source": "eregister-workbook"}
    fixed = await client.post(
        qc_url(original, "correct"), json={"body": fixed_body, "reason": reason}
    )
    assert fixed.status_code == 201, fixed.text
    return str(fixed.json()["id"])


async def _state_and_notes(observation: str) -> dict[str, Any]:
    [row] = await register_rows(
        "SELECT state, qc_notes, superseded_from FROM register_observations"
        " WHERE id = :i",
        i=observation,
    )
    return row


@pytest.mark.usefixtures("incoming", "recipients")
async def test_a_restored_original_gets_its_exact_notes_back(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (
        await client.post(
            qc_url(original, "accept"), json={"reason": "Checked against the chart"}
        )
    ).status_code == 200
    correction = await _correction_of(client, original)
    await as_staff(db_async)
    rejected = await client.post(
        qc_url(correction, "reject"), json={"reason": "Not needed"}
    )
    assert rejected.status_code == 200, rejected.text
    assert await _state_and_notes(original) == {
        "state": "accepted",
        "qc_notes": "Checked against the chart",
        "superseded_from": None,
    }
    # The restore entry records the real change: the correction reason out, the
    # restored notes in.
    restore = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_id == original, AuditEntry.action == "restore"
            )
        )
    ).one()
    changes = {c["field"]: (c["old"], c["new"]) for c in restore.changes}
    assert changes["qc_notes"] == ("typo", "Checked against the chart")
    assert changes["state"] == ("superseded", "accepted")
    # The original holds the hour again, so the rejected correction stays rejected.
    reopened = await client.post(
        qc_url(correction, "reopen"), json={"reason": "Second thoughts"}
    )
    assert reopened.status_code == 409, reopened.text
    assert (await _state_and_notes(correction))["state"] == "rejected"


@pytest.mark.usefixtures("incoming", "recipients")
async def test_a_row_superseded_before_0005_with_a_held_file_is_restored(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    assert (await client.post(qc_url(original, "accept"))).status_code == 200
    correction = await _correction_of(client, original)
    # What a row superseded before migration 0005 looks like: it remembers nothing.
    await register_exec(
        "UPDATE register_observations SET superseded_from = NULL,"
        " superseded_qc_notes = NULL WHERE id = :i",
        i=original,
    )
    held = (
        await db_async.scalars(
            select(ERegisterSend).where(ERegisterSend.target == "wis2")
        )
    ).one()
    await db_async.refresh(held)
    assert (held.detail or {}).get("held_for_correction")
    await as_staff(db_async)
    assert (
        await client.post(qc_url(correction, "reject"), json={"reason": "Not needed"})
    ).status_code == 200
    # It held a WIS2 file, so it was accepted; the file is released with the restore.
    assert (await _state_and_notes(original))["state"] == "accepted"
    await db_async.refresh(held)
    assert not (held.detail or {}).get("held_for_correction")
    holders = await register_rows(
        "SELECT observation_id FROM observations.publish_gate"
    )
    assert [str(r["observation_id"]) for r in holders] == [original]


@pytest.mark.usefixtures("incoming", "recipients")
async def test_a_row_superseded_before_0005_without_a_file_is_not_guessed(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    correction = await _correction_of(client, original)
    await register_exec(
        "UPDATE register_observations SET superseded_from = NULL WHERE id = :i",
        i=original,
    )
    await as_staff(db_async)
    assert (
        await client.post(qc_url(correction, "reject"), json={"reason": "Not needed"})
    ).status_code == 200
    # No way to know its earlier state: it stays superseded, and no restore is audited.
    assert (await _state_and_notes(original))["state"] == "superseded"
    restores = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_id == original, AuditEntry.action == "restore"
            )
        )
    ).all()
    assert restores == []


async def test_a_gate_held_by_a_correction_is_released_for_a_draft_original(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    original = await save(client)
    correction = await _correction_of(client, original)
    # The correction had the hour (it was accepted, then reopened).
    await register_exec(
        "INSERT INTO observations.publish_gate"
        " (station_id, valid_hour, source, observation_id)"
        " VALUES ('78958', :hour, 'manual', :obs)",
        hour=OBSERVED,
        obs=correction,
    )
    await as_staff(db_async)
    assert (
        await client.post(qc_url(correction, "reject"), json={"reason": "Not needed"})
    ).status_code == 200
    assert (await _state_and_notes(original))["state"] == "draft"
    # A draft was never published, so it must not hold the hour.
    assert (
        await register_rows("SELECT observation_id FROM observations.publish_gate")
        == []
    )


def test_the_0005_downgrade_drops_its_columns(fresh_weather_engine: Engine) -> None:
    config = Config(str(ROOT / "src/eregister/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    columns = text(
        "SELECT column_name FROM information_schema.columns"
        " WHERE table_name = 'register_observations'"
        " AND column_name IN ('superseded_from', 'superseded_qc_notes')"
    )
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        assert len(connection.execute(columns).all()) == 2
        command.downgrade(config, "eregister_0004")
        assert connection.execute(columns).all() == []
        command.upgrade(config, "head")
        assert len(connection.execute(columns).all()) == 2


def test_the_register_migrations_form_one_chain_with_a_single_head() -> None:
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(
        Config(str(ROOT / "src/eregister/alembic.ini"))
    )
    assert script.get_heads() == ["eregister_0006"]
    revisions = [item.revision for item in script.walk_revisions()]
    assert revisions == [f"eregister_000{n}" for n in range(6, 0, -1)]
