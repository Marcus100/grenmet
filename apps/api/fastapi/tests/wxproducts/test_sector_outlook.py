from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.wxproducts import advisories

NOW = datetime(2026, 10, 28, 15, 0, tzinfo=UTC)  # 11:00 in Grenada


def _alert(
    identifier, *, sectors=None, colour="3; orange; Severe", onset=None, expires=None
):
    parameters = [
        SimpleNamespace(value_name="awareness_level", value=colour),
        SimpleNamespace(value_name="GMS:product", value="Warning"),
    ]
    if sectors is not None:
        parameters.append(SimpleNamespace(value_name="GMS:sectors", value=sectors))
    info = SimpleNamespace(
        language="en",
        event="Heavy rain",
        certainty="Likely",
        severity="Severe",
        description="Flash flooding possible.",
        instruction="Avoid flooded roads.",
        onset=onset,
        effective=None,
        expires=expires,
        parameters=parameters,
    )
    return SimpleNamespace(info=[info], sent=NOW, identifier=identifier)


def _bulletin(
    kind="marine",
    *,
    sectors="",
    valid_from="2026-10-28T06:00",
    valid_to="2026-10-29T18:00",
):
    return SimpleNamespace(
        id=uuid4(),
        kind=kind,
        revision=1,
        values={
            "level": "Green",
            "likelihood": "Low",
            "impact": "Minor",
            "impacts": "Choppy seas.",
            "response": "Use caution.",
            "validFrom": valid_from,
            "validTo": valid_to,
            "sectors": sectors,
        },
    )


def _sources(monkeypatch, alerts, bulletins):
    async def active(**_):
        return SimpleNamespace(data=alerts)

    async def published(*_):
        return bulletins

    monkeypatch.setattr(advisories.cap_service, "public_latest_active", active)
    monkeypatch.setattr(advisories.service, "list_published_products", published)


SESSION = SimpleNamespace(in_transaction=lambda: False)
SESSION_DB = cast("AsyncSession", SESSION)


async def _outlook(days=7):
    return await advisories.sector_outlook(SESSION_DB, SESSION_DB, now=NOW, days=days)


async def test_tags_and_untagged_items(monkeypatch):
    _sources(
        monkeypatch,
        [_alert("GMS-1", sectors="health, marine"), _alert("GMS-2")],
        [_bulletin(sectors="aviation")],
    )
    outlook = await _outlook()
    assert outlook.complete is True
    by_id = {item.identifier or item.source: item for item in outlook.items}
    tagged = by_id["GMS-1"]
    assert tagged.sectors == ["marine", "health"]
    assert tagged.affects_everyone is False
    assert tagged.colour == "orange" and tagged.source == "CAP"
    untagged = by_id["GMS-2"]
    assert untagged.sectors == [] and untagged.affects_everyone is True
    bulletin = by_id["Bulletin"]
    assert bulletin.sectors == ["aviation"] and bulletin.product_id is not None
    assert bulletin.colour == "green"
    # Strongest colour first.
    assert [item.colour for item in outlook.items] == ["orange", "orange", "green"]


async def test_window_covers_today_through_the_requested_days(monkeypatch):
    soon = (NOW + timedelta(days=3)).isoformat()
    later = (NOW + timedelta(days=9)).isoformat()
    ended = (NOW - timedelta(days=2)).isoformat()
    _sources(
        monkeypatch,
        [
            SimpleNamespace(**_alert("NOW").__dict__),
            _alert("SOON", onset=datetime.fromisoformat(soon)),
            _alert("LATER", onset=datetime.fromisoformat(later)),
            _alert("ENDED", expires=datetime.fromisoformat(ended)),
        ],
        [
            _bulletin(valid_from="2026-11-20T06:00", valid_to="2026-11-21T06:00"),
            _bulletin("heat", valid_from="2026-10-27T06:00", valid_to=""),
        ],
    )
    outlook = await _outlook(days=7)
    ids = {item.identifier for item in outlook.items if item.identifier}
    assert ids == {"NOW", "SOON"}
    # A bulletin with no end still applies; one starting next month does not.
    assert [item.title for item in outlook.items if item.source == "Bulletin"] == [
        "Heat"
    ]
    assert outlook.window_end - outlook.window_start == timedelta(days=7)
    # The window starts at the beginning of today in Grenada.
    assert outlook.window_start.astimezone(UTC).hour == 4  # 00:00 AST
    assert len((await _outlook(days=14)).items) == 4


async def test_a_source_that_cannot_be_read_marks_the_result_incomplete(monkeypatch):
    _sources(monkeypatch, [_alert("GMS-1")], [])
    partial = await advisories.sector_outlook(SESSION_DB, None, now=NOW, days=7)
    assert partial.complete is False
    assert [item.identifier for item in partial.items] == ["GMS-1"]
    nothing = await advisories.sector_outlook(None, None, now=NOW, days=7)
    assert nothing.complete is False and nothing.items == []


async def test_public_endpoint_is_open_and_validates_days(async_client, monkeypatch):
    async def fake(_cap, _weather, *, now, days):
        return advisories.SectorOutlook(
            as_of=now,
            window_start=now,
            window_end=now + timedelta(days=days),
            complete=True,
            items=[],
        )

    monkeypatch.setattr(advisories, "sector_outlook", fake)
    ok = await async_client.get("/api/v1/wxproducts/public/sector-outlook?days=3")
    assert ok.status_code == 200
    assert ok.headers["cache-control"] == "no-store"
    assert ok.json()["complete"] is True and ok.json()["items"] == []
    assert (
        await async_client.get("/api/v1/wxproducts/public/sector-outlook")
    ).status_code == 200
    for bad in ("0", "15", "x"):
        response = await async_client.get(
            f"/api/v1/wxproducts/public/sector-outlook?days={bad}"
        )
        assert response.status_code == 422
