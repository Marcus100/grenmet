"""Flight board: OpenSky parsing (recorded fixture), poll gating, endpoint."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest

from src.flights import cache, service
from src.flights.config import FlightsConfig, flights_settings
from src.flights.providers import (
    FlightProviderError,
    OpenSkyProvider,
    parse_opensky_flights,
)
from src.flights.schemas import FlightRow

FIXTURE = Path(__file__).parent / "fixtures" / "opensky_arrival_tgpy.json"
NOW = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)


def _payload() -> Any:
    return json.loads(FIXTURE.read_text())


def test_parse_arrivals_maps_fields_and_skips_unusable_records() -> None:
    rows = parse_opensky_flights(_payload(), board="arrivals")
    assert [r.icao24 for r in rows] == ["4ca123", "a1b2c3"]  # newest first
    assert rows[1].callsign == "AAL1509"
    assert rows[1].other_airport_icao == "KMIA"
    assert rows[1].time == datetime.fromtimestamp(1760712000, tz=UTC)
    assert rows[0].callsign is None
    assert rows[0].other_airport_icao is None


def test_parse_rejects_non_list_payload() -> None:
    with pytest.raises(FlightProviderError):
        parse_opensky_flights({"error": "x"}, board="departures")


async def test_opensky_provider_calls_arrival_endpoint_anonymously() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=_payload())

    provider = OpenSkyProvider(
        config=FlightsConfig(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    rows = await provider.fetch(airport="TGPY", board="arrivals", begin=NOW, end=NOW)
    assert len(rows) == 2
    assert seen[0].url.path == "/api/flights/arrival"
    assert seen[0].url.params["airport"] == "TGPY"
    assert "authorization" not in seen[0].headers


async def test_opensky_provider_uses_oauth_when_configured_and_maps_404() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if "openid-connect" in request.url.path:
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 300})
        assert request.headers["authorization"] == "Bearer tok"
        return httpx.Response(404)

    provider = OpenSkyProvider(
        config=FlightsConfig(OPENSKY_CLIENT_ID="id", OPENSKY_CLIENT_SECRET="s"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    rows = await provider.fetch(airport="TGPY", board="departures", begin=NOW, end=NOW)
    assert rows == []
    assert calls[-1] == "/api/flights/departure"


async def test_opensky_provider_wraps_http_errors() -> None:
    provider = OpenSkyProvider(
        config=FlightsConfig(),
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _r: httpx.Response(429))
        ),
    )
    with pytest.raises(FlightProviderError):
        await provider.fetch(airport="TGPY", board="arrivals", begin=NOW, end=NOW)


class _FakeProvider:
    name = "fake"

    def __init__(self) -> None:
        self.calls = 0

    async def fetch(self, **_: Any) -> list[FlightRow]:
        self.calls += 1
        return parse_opensky_flights(_payload(), board="arrivals")


async def test_poll_skips_when_flag_off() -> None:
    provider = _FakeProvider()
    result = await service.poll_flights(
        provider=provider, config=FlightsConfig(FLIGHTS_OPENSKY_ENABLED=False)
    )
    assert result == {}
    assert provider.calls == 0


async def test_poll_caches_each_board_when_flag_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored: list[tuple[str, str]] = []

    async def fake_store(**kwargs: Any) -> bool:
        stored.append((kwargs["airport"], kwargs["board"]))
        return True

    monkeypatch.setattr(cache, "store_board", fake_store)
    provider = _FakeProvider()
    result = await service.poll_flights(
        provider=provider, config=FlightsConfig(FLIGHTS_OPENSKY_ENABLED=True), now=NOW
    )
    assert result == {"TGPY:arrivals": 2, "TGPY:departures": 2}
    assert stored == [("TGPY", "arrivals"), ("TGPY", "departures")]


async def test_worker_cron_is_noop_when_flag_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.worker import main as worker_main

    monkeypatch.setattr(flights_settings, "FLIGHTS_OPENSKY_ENABLED", False)
    assert await worker_main.poll_flights({}) == 0


_URL = "/api/v1/flights/board"


async def test_endpoint_unavailable_when_flag_off(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(flights_settings, "FLIGHTS_OPENSKY_ENABLED", False)
    response = await async_client.get(_URL, params={"board": "arrivals"})
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["is_sample"] is False
    assert body["rows"] == []


async def test_endpoint_returns_cached_rows_when_enabled(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(flights_settings, "FLIGHTS_OPENSKY_ENABLED", True)
    rows = parse_opensky_flights(_payload(), board="arrivals")

    async def fake_load(**_: Any) -> tuple[str, datetime, list[FlightRow]]:
        return "opensky", NOW, rows

    monkeypatch.setattr(cache, "load_board", fake_load)
    response = await async_client.get(
        _URL, params={"airport": "TGPY", "board": "arrivals"}
    )
    body = response.json()
    assert body["available"] is True
    assert body["source"] == "opensky"
    assert body["is_sample"] is False
    assert len(body["rows"]) == 2


async def test_endpoint_unavailable_when_cache_empty(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(flights_settings, "FLIGHTS_OPENSKY_ENABLED", True)

    async def fake_load(**_: Any) -> None:
        return None

    monkeypatch.setattr(cache, "load_board", fake_load)
    response = await async_client.get(_URL, params={"board": "departures"})
    assert response.json()["available"] is False


async def test_endpoint_rejects_unsupported_airport(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(_URL, params={"airport": "KJFK"})
    assert response.status_code == 422
