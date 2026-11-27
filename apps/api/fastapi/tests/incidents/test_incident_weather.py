"""The weather report at the time of an incident (#1876)."""

import uuid
from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.incidents import weather
from src.organisations.models import MembershipRole
from src.wxproducts import database as wx_database
from src.wxproducts.observations import (
    ObservationKind,
    ObservationProvenance,
    ObservationRecord,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/incidents/org"

pytestmark = pytest.mark.asyncio


async def _incident(
    client: httpx.AsyncClient, db: AsyncSession
) -> tuple[str, dict[str, str]]:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=("incidents",),
    )
    headers = headers_for(owner, org.id)
    made = await client.post(
        f"{API}/incidents",
        headers=headers,
        json={
            "title": "Aircraft slid off stand",
            "occurred_at": "2026-11-26T14:10:00Z",
        },
    )
    assert made.status_code == 201, made.text
    incident_id: str = made.json()["id"]
    return incident_id, headers


async def test_report_is_looked_up_for_the_incident_time(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    incident_id, headers = await _incident(async_client, db_async)
    asked: list[tuple[str, datetime]] = []

    async def fake(station: str, at: datetime) -> weather.Report | None:
        asked.append((station, at))
        return weather.Report(
            station=station,
            observed_at=datetime(2026, 11, 26, 14, 0),
            text="METAR TGPY 261400Z 09012KT 9999 SHRA SCT018 29/24 Q1013",
        )

    monkeypatch.setattr(weather, "nearest_report", fake)
    set_ = await async_client.put(
        f"{API}/incidents/{incident_id}/weather",
        headers=headers,
        json={"station": "tgpy"},
    )
    assert set_.status_code == 200, set_.text
    assert asked == [("TGPY", datetime(2026, 11, 26, 14, 10))]
    assert set_.json()["weather"] == {
        "station": "TGPY",
        "observed_at": "2026-11-26T14:00:00Z",
        "report": "METAR TGPY 261400Z 09012KT 9999 SHRA SCT018 29/24 Q1013",
        "source": "observation",
    }
    listed = await async_client.get(f"{API}/incidents", headers=headers)
    assert listed.json()["data"][0]["weather"]["source"] == "observation"


async def test_no_observation_is_404_and_a_typed_report_is_manual(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    incident_id, headers = await _incident(async_client, db_async)

    async def nothing(_station: str, _at: datetime) -> weather.Report | None:
        return None

    monkeypatch.setattr(weather, "nearest_report", nothing)
    path = f"{API}/incidents/{incident_id}/weather"
    missing = await async_client.put(path, headers=headers, json={"station": "TGPY"})
    assert missing.status_code == 404
    bad = await async_client.put(path, headers=headers, json={"station": "TG1Y"})
    assert bad.status_code == 422
    typed = await async_client.put(
        path,
        headers=headers,
        json={"station": "TGPY", "report": " TGPY 261400Z 09012KT CAVOK 30/24 Q1013 "},
    )
    assert typed.status_code == 200, typed.text
    assert typed.json()["weather"]["source"] == "manual"
    assert typed.json()["weather"]["report"] == "TGPY 261400Z 09012KT CAVOK 30/24 Q1013"
    assert typed.json()["weather"]["observed_at"] == "2026-11-26T14:10:00Z"

    await async_client.post(f"{API}/incidents/{incident_id}/open", headers=headers)
    await async_client.post(f"{API}/incidents/{incident_id}/close", headers=headers)
    locked = await async_client.put(
        path, headers=headers, json={"station": "TGPY", "report": "late"}
    )
    assert locked.status_code == 409


async def test_nearest_report_without_an_observation_store(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(wx_database, "create_session", lambda: None)
    assert await weather.nearest_report("TGPY", datetime(2026, 11, 26, 14, 10)) is None


class _FakeSession:
    async def __aenter__(self) -> _FakeSession:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


def _row(
    kind: ObservationKind, observed: datetime | None, text: str | None
) -> ObservationRecord:
    return ObservationRecord(
        id=f"x:{kind}:{text}",
        kind=kind,
        station="TGPY",
        observed_at=observed,
        payload={},
        provenance=ObservationProvenance(
            source_system="test", time_basis="source_observation", raw_tac=text
        ),
    )


async def test_nearest_report_picks_the_closest_across_metar_and_speci(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    at = datetime(2026, 11, 26, 14, 10)
    windows: list[tuple[object, object]] = []

    async def fake_list(_session: object, **kwargs: object) -> list[ObservationRecord]:
        windows.append((kwargs["start"], kwargs["end"]))
        if kwargs["kind"] == "METAR":
            return [
                _row("METAR", datetime(2026, 11, 26, 14, 0, tzinfo=UTC), "METAR 1400"),
                _row("METAR", datetime(2026, 11, 26, 13, 0, tzinfo=UTC), "METAR 1300"),
                _row("METAR", datetime(2026, 11, 26, 14, 9, tzinfo=UTC), None),
            ]
        return [
            _row("SPECI", datetime(2026, 11, 26, 14, 12, tzinfo=UTC), " SPECI 1412 ")
        ]

    monkeypatch.setattr(wx_database, "create_session", _FakeSession)
    monkeypatch.setattr(weather, "list_observations", fake_list)
    report = await weather.nearest_report("TGPY", at)
    assert report == weather.Report(
        station="TGPY", observed_at=datetime(2026, 11, 26, 14, 12), text="SPECI 1412"
    )
    assert windows[0] == (
        datetime(2026, 11, 26, 12, 40, tzinfo=UTC),
        datetime(2026, 11, 26, 14, 40, tzinfo=UTC),
    )


async def test_nearest_report_survives_a_weather_database_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken(_session: object, **_kwargs: object) -> list[ObservationRecord]:
        raise OSError("connection refused")

    monkeypatch.setattr(wx_database, "create_session", _FakeSession)
    monkeypatch.setattr(weather, "list_observations", broken)
    assert await weather.nearest_report("TGPY", datetime(2026, 11, 26, 14, 10)) is None
