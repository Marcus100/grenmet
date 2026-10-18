"""Flight data provider seam. OpenSky is the only adapter today."""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

import httpx

from .config import FlightsConfig, flights_settings
from .schemas import FlightRow

BoardName = Literal["arrivals", "departures"]


class FlightProviderError(Exception):
    """The provider could not return a usable answer (network, quota, 5xx)."""


class FlightProvider(Protocol):
    name: str

    async def fetch(
        self, *, airport: str, board: BoardName, begin: datetime, end: datetime
    ) -> list[FlightRow]: ...


def parse_opensky_flights(payload: Any, *, board: BoardName) -> list[FlightRow]:
    """Map OpenSky flight records to rows.

    OpenSky has no schedule, airline name or delay status: only the callsign,
    when the aircraft was last seen near the airport (arrivals) or first seen
    (departures), and the ICAO code of the other airport when its estimator
    found one.
    """
    if not isinstance(payload, list):
        raise FlightProviderError("unexpected OpenSky payload")
    rows: list[FlightRow] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        seen = item.get("lastSeen" if board == "arrivals" else "firstSeen")
        other = item.get(
            "estDepartureAirport" if board == "arrivals" else "estArrivalAirport"
        )
        if not isinstance(seen, int):
            continue
        callsign = item.get("callsign")
        icao24 = item.get("icao24")
        rows.append(
            FlightRow(
                callsign=(callsign.strip() or None)
                if isinstance(callsign, str)
                else None,
                icao24=icao24 if isinstance(icao24, str) else None,
                other_airport_icao=other if isinstance(other, str) and other else None,
                time=datetime.fromtimestamp(seen, tz=UTC),
                board=board,
            )
        )
    rows.sort(key=lambda r: r.time, reverse=True)
    return rows


class OpenSkyProvider:
    """OpenSky Network REST API (`/flights/arrival`, `/flights/departure`).

    These endpoints are batch-processed: flights appear only after the
    nightly run, so data is from the previous day or earlier, never live.
    """

    name = "opensky"

    def __init__(
        self,
        *,
        config: FlightsConfig = flights_settings,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config
        self._client = client
        self._token: str | None = None
        self._token_expires = 0.0

    async def _auth_headers(self, client: httpx.AsyncClient) -> dict[str, str]:
        cid = self._config.OPENSKY_CLIENT_ID
        secret = self._config.OPENSKY_CLIENT_SECRET
        if not cid or not secret:
            return {}
        if self._token is None or time.monotonic() >= self._token_expires:
            response = await client.post(
                self._config.OPENSKY_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": cid,
                    "client_secret": secret,
                },
            )
            response.raise_for_status()
            body = response.json()
            self._token = str(body["access_token"])
            lifetime = int(body.get("expires_in", 300))
            self._token_expires = time.monotonic() + lifetime - 30
        return {"Authorization": f"Bearer {self._token}"}

    async def fetch(
        self, *, airport: str, board: BoardName, begin: datetime, end: datetime
    ) -> list[FlightRow]:
        path = "arrival" if board == "arrivals" else "departure"
        owned = self._client is None
        client = self._client or httpx.AsyncClient(
            timeout=self._config.OPENSKY_TIMEOUT_SECONDS
        )
        try:
            headers = await self._auth_headers(client)
            response = await client.get(
                f"{self._config.OPENSKY_API_URL}/flights/{path}",
                params={
                    "airport": airport,
                    "begin": int(begin.timestamp()),
                    "end": int(end.timestamp()),
                },
                headers=headers,
            )
            if response.status_code == httpx.codes.NOT_FOUND:
                # OpenSky answers 404 when it holds no flights for the window.
                return []
            response.raise_for_status()
            return parse_opensky_flights(response.json(), board=board)
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise FlightProviderError(f"OpenSky {path} failed: {exc}") from exc
        finally:
            if owned:
                await client.aclose()
