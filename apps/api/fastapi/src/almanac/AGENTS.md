# almanac domain — agent context

**Owner:** Barrels platform, for the public Grenada sites and the GMS product forms.
Reference data, not a GMS forecast. The tides are the owner's **predicted,
provisional, not for navigation** table; every tides response says so.

- **Domain choice:** its own small domain, not `environmental` (external model
  feeds with a fetch cycle) or `wxproducts` (separate database, GMS products). The
  almanac is computed locally, stored once a year, and read by two audiences.
- **Astronomy (`astro.py`, pure):** Astral 3.2 (`astral` in `fast-back`). Sun and
  civil twilight at each location; moonrise and moonset (Astral raises `ValueError`
  on days with none, mapped to null); moon phase name per day; principal phases
  (new, first quarter, full, last quarter) by scanning daily phase values. A phase
  date is accurate to +/-1 day, not an instant.
- **Locations (`locations.py`):** `mbia` from the WMO 78958 station position in
  `eregister/config.py`; `lauriston` from the airfield reference in
  `models_guidance/config.py` (no surveyed aerodrome table exists; confirm it).
- **Tables (main database, `almanac` schema, migration `almanac20261109`):**
  `astro_day` (unique location and local date), `moon_phase_event` (unique phase
  and local date), `tide_prediction` (unique station and UTC time, so re-imports
  update rather than duplicate). Datetimes are naive UTC; `height_m_mllw` is
  `Numeric(8,4)`.
- **Writes are scripts, never requests:** `scripts/build_almanac_year.py --year N`
  (upserts the day rows, replaces the year's phases) and
  `scripts/import_tide_table.py <csv> --source-version vX` (upserts tides).
  The owner's CSV is read from its path and never copied into the repo.
- **Parsing (`tides.py`, pure):** required columns checked up front; each bad row
  raises `TideTableError` naming its line. Times must end in ` UTC`. Heights are
  taken from the `..._relative_uhslc_mllw_provisional_crosswalk` column.
- **Routes (`router.py`, zone `public`, ADR-0025):** `GET /almanac/public/astronomy`
  and `GET /almanac/public/tides`, 60/min, `Cache-Control` for a day. `from`/`to`
  are bounded by `MAX_RANGE_DAYS` (366) in `service.check_range` (422).
  No permission key: the data is public.
- **Reads filter and order in SQL.** The service shapes results; nothing is fetched
  from the network in a request.
- **Tests:** `tests/almanac/`. `test_astro.py` checks phase dates against published
  new and full moon instants (+/-1 day) and sanity ranges for sun and moon. A
  USNO comparison test is present but skipped until
  `tests/almanac/fixtures/usno_oneday_grenada.json` is committed (the sandbox
  could not reach aa.usno.navy.mil). `test_tides.py` uses a synthetic CSV.
  `test_almanac_api.py` covers idempotent writes and the endpoints (real DB).
- Related: `docs/operations/almanac-and-tides.md`, issue #1200 (next year's table),
  `docs/api/contracts.md`.
