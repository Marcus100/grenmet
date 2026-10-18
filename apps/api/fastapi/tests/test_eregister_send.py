"""eRegister send actions: TAC and CSV encoders, email and WIS2 queueing, job."""

import csv
import io
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.audit.models import AuditEntry
from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister import encode, publisher, rules, sends
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
    "s3_baro_change_24h": "1015",
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
        "81100 333 10310 20240 51015 70123 81810 91025="
    )


def test_tac_nil_report_is_identification_only() -> None:
    assert encode.synop_tac(SynopWorkbook.model_validate(NIL_ROW)) == (
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
    observation = await save(client, {**FULL_ROW, "dew_point": "290"})
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


# --- QC: accept, reject, reopen -------------------------------------------------


async def as_qc_user(db_async: AsyncSession) -> User:
    """Switch the request user to someone holding only eregister.qc."""
    person = await make_user(db_async)
    role, _perms = await make_role_with_permission(db_async, "eregister.qc")
    await assign_role(db_async, user=person, role=role)
    app.dependency_overrides[get_browser_or_token_user] = lambda: person
    return person


def qc_url(observation: str, action: str) -> str:
    return f"/api/v1/eregister/observations/{observation}/{action}"


async def test_qc_accept_by_another_person_is_audited(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _observer = send_client
    observation = await save(client)
    reviewer = await as_qc_user(db_async)
    response = await client.post(
        qc_url(observation, "accept"), json={"reason": "checked against charts"}
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["state"] == "accepted"
    assert saved["qc_by"] == str(reviewer.id)
    assert saved["qc_at"] is not None
    assert saved["qc_notes"] == "checked against charts"
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.entity_id == observation)
        )
    ).all()
    assert [(e.action, e.actor_user_id) for e in entries] == [("accept", reviewer.id)]
    assert {c["field"]: c["new"] for c in entries[0].changes}["state"] == "accepted"


async def test_observer_cannot_accept_their_own_observation_even_as_superuser(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _observer = send_client
    observation = await save(client)
    response = await client.post(qc_url(observation, "accept"))
    assert response.status_code == 403
    assert "different person" in response.json()["detail"]
    listed = (await client.get("/api/v1/eregister/observations")).json()
    assert listed["observations"][0]["state"] == "draft"


async def test_qc_needs_the_qc_permission(
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
        assert response.status_code == 403


async def test_qc_rejects_a_workbook_that_fails_validation(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client, {**FULL_ROW, "dew_point": "290"})
    await as_qc_user(db_async)
    response = await client.post(qc_url(observation, "accept"))
    assert response.status_code == 422
    assert "dew_point" in response.json()["detail"]


async def test_reject_and_reopen_need_a_reason(
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    observation = await save(client)
    await as_qc_user(db_async)
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
    send_client: tuple[httpx.AsyncClient, User], db_async: AsyncSession
) -> None:
    client, _ = send_client
    metar = await save(client, kind="METAR")
    await as_qc_user(db_async)
    assert (await client.post(qc_url(str(uuid4()), "accept"))).status_code == 404
    assert (await client.post(qc_url(metar, "accept"))).status_code == 409


async def test_qc_queue_filters_by_state(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    client, _ = send_client
    pending = await save(client)
    done = await save(client, accepted=True)
    listed = (await client.get("/api/v1/eregister/observations?state=draft")).json()
    assert [o["id"] for o in listed["observations"]] == [pending]
    listed = (await client.get("/api/v1/eregister/observations?state=accepted")).json()
    assert [o["id"] for o in listed["observations"]] == [done]
    bogus = await client.get("/api/v1/eregister/observations?state=bogus")
    assert bogus.status_code == 422


@pytest.mark.usefixtures("incoming")
async def test_wis2_requires_accepted_but_email_does_not(
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
    await as_qc_user(db_async)
    response = await client.post(
        qc_url(observation, "reopen"), json={"reason": "Found an error"}
    )
    assert response.status_code == 409
    assert "WIS2" in response.json()["detail"]
