# Almanac and predicted tides: operations

**Status:** Active reference  
**Owner:** Barrels platform  
**Last updated:** 2026-11-09

Domain notes: `apps/api/fastapi/src/almanac/AGENTS.md`.
Public routes: `docs/api/contracts.md` (almanac section).

## What is stored

| Data | Table | Written by |
| --- | --- | --- |
| Sun, civil twilight, moonrise and moonset, moon phase name, per day and location (`mbia`, `lauriston`) | `almanac.astro_day` | `scripts/build_almanac_year.py` |
| Principal phases (new, first quarter, full, last quarter) | `almanac.moon_phase_event` | `scripts/build_almanac_year.py` |
| Predicted high and low tides, station `pric` (Prickly Bay), v1.4 (Oct to Dec 2026) | `almanac.tide_prediction` | `scripts/import_tide_table.py` |

Astronomy is computed locally by Astral. Nothing is fetched from the network.
Tides come only from the owner's table. Neither the CSV nor its values go into git.

## Import next year's tide table (before 1 December)

Reminder: issue #1200. The owner runs the Prickly Bay tide tool for the next period
and exports a CSV in the same columns as the current file.

1. Confirm the file has the expected header (`event_type`, `time_utc`,
   `height_m_relative_uhslc_mllw_provisional_crosswalk`, `status`, `timing_quality`).
2. Run the importer against the target database. It is safe to re-run.

   ```bash
   cd apps/api/fastapi
   uv run --frozen --package fast-back python -m scripts.import_tide_table \
       /path/to/pric-tides-2027-01-01-to-2027-03-31.csv --source-version v2.0
   ```

   The command first prints the target host and database. A host that is not
   local (staging, production) is refused unless you repeat it with
   `--confirm-host <host>`. It then prints the number of events. A bad row stops
   the import and names its line; nothing is written when parsing fails.
3. Check the public route for a date in the new period:
   `GET /api/v1/almanac/public/tides?station=pric&from=...&to=...`. Every response
   must carry the "predicted, not for navigation" note.
4. Close issue #1200 once the new period is live.

## Build a new year of sun and moon data (before 1 January)

```bash
cd apps/api/fastapi
uv run --frozen --package fast-back python -m scripts.build_almanac_year --year 2027
```

It prints the target host and database first and, like the importer, needs
`--confirm-host <host>` for a non-local database. It upserts the day rows for
both locations and replaces the year's principal phases. Re-running is safe. Run it before the public site or product forms need
the year. The public routes return only the days that exist, so a missing year
shows as empty `days`, not as wrong data.

## Things to know

- Predictions are provisional and not for navigation. Keep that wording on every
  surface that shows tides.
- Principal phase dates are accurate to plus or minus one day.
- The Lauriston coordinate is an airfield reference from the guidance code, not a
  surveyed position. Confirm it before publishing Carriacou times as official.
- The US Naval Observatory comparison fixture
  (`apps/api/fastapi/tests/almanac/fixtures/usno_oneday_grenada.json`) is not
  committed yet. The test that uses it is skipped until someone with unrestricted
  access fetches the reference values once and commits them.
- The CSV is the owner's data. Keep it outside the repository.
