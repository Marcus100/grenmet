# flights domain — agent context

**Owner:** Barrels platform (MBIA public site). Experimental, flag-gated.

- `FLIGHTS_OPENSKY_ENABLED` (default **false**) gates everything: the worker poll and the endpoint (`available: false` when off). OpenSky is research-only; commercial use needs a written licence (owner decision pending) and TGPY coverage is unproven.
- `providers.py`: `FlightProvider` protocol + `OpenSkyProvider` (`/flights/arrival|departure`, httpx, optional OAuth2 client credentials). Data is batch-processed: previous day or earlier, never live. Rows are "recent movements" (callsign, last/first seen time, other airport ICAO), not a schedule.
- `cache.py`: Redis only (`grenmet:flights:<ICAO>:<board>`, TTL `FLIGHTS_CACHE_TTL_SECONDS`). No `REDIS_URL` means unavailable. No table, no migration.
- Worker cron `poll_flights` (minutes 5 and 35, `src/worker/main.py`) skips when the flag is off; a failed provider call keeps the previous cache.
- `GET /api/v1/flights/board?airport=TGPY&board=arrivals|departures` (public, 60/min). `is_sample` is always false; the web app owns the labelled sample fallback.
- Tests: `tests/flights/` (recorded fixture, no network).
