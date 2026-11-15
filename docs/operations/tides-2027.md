# Predicted tides for 2027: owner run and load

**Status:** Ready for the owner run  
**Owner:** Barrels platform  
**Last updated:** 2026-11-15

Issue #1200. The stored Prickly Bay table (v1.4) covers 1 October to 31 December
2026 in Grenada time. The marine forecast and `/marine/tides` show no tides for a
date the table does not hold, so the 2027 table must be loaded before
1 January 2027 (target: before 1 December, so there is a month to fix problems).

Owner decision, 15 November 2026: the owner runs one command in the tide tool,
sends back the output file, and the agent loads and checks it.

## 1. Owner: produce the 2027 file

The owner runs the private tide tool to extend the reviewed 2026 (v1.4) Prickly
Bay prediction to 1 January to 31 December 2027, Grenada time (AST, UTC-4). The
exact command lives with the tool, outside this repository, and a copy is kept in
the main checkout's gitignored `private/tides/` folder.

The file must have the same columns as the 2026 file: `time_utc`
(`YYYY-MM-DD HH:MM UTC`), `event_type` (`HIGH` or `LOW`),
`height_m_relative_uhslc_mllw_provisional_crosswalk` (metres, provisional MLLW),
`status` and `timing_quality`. The 2026 table ends on 31 December AST, so the two
tables meet with no overlap and no hole. Expect about 1,400 events over 365 dates
(roughly 3.9 a day, as in 2026).

## 2. Owner: hand the file over

Copy `pric-tides-2027-01-01-to-2027-12-31.csv` to the main checkout's gitignored
private folder and tell the agent it is there:

```bash
mkdir -p ~/grenmet/private/tides
cp /path/to/pric-tides-2027-01-01-to-2027-12-31.csv ~/grenmet/private/tides/
```

Never commit it: the predicted values are the owner's data, the same rule as the
2026 file (`private/` is in `.gitignore`).

## 3. Agent: check, then load

All commands run from `apps/api/fastapi`. The file stays where it is; the importer
only reads it.

1. Dry run. It needs no database and writes nothing. It prints the event count,
   highs and lows, the first and last events in UTC and AST, events per month,
   and any gap over 13 hours, AST date with no event, or duplicate time. It exits
   non-zero when a check fails or the file does not cover the expected dates.

   ```bash
   uv run --frozen --package fast-back python -m scripts.import_tide_table \
     ~/grenmet/private/tides/pric-tides-2027-01-01-to-2027-12-31.csv \
     --source-version v1.5 --expect-from 2027-01-01 --expect-to 2027-12-31 --dry-run
   ```

   Expect: `AST dates: 2027-01-01 to 2027-12-31`, every month present with about
   115 to 125 events, `checks: passed`. Two highs or two lows in a row are allowed
   (the model keeps weak turning points); they should match the near-flat count.

2. Load into local, then staging, then production. Drop `--dry-run`. The same
   checks run first and a failing file is refused before anything is written. A
   non-local host needs `--confirm-host <host>`. Re-running is safe: rows are
   keyed by station and UTC time.
3. Check the join with 2026 on each environment:
   `GET /api/v1/almanac/public/tides?station=pric&from=2026-12-31&to=2027-01-01`
   must list events on both days with no long gap, and carry the "predicted, not
   for navigation" note.
4. Record the load on issue #1200 and close it.

## What to tell the owner if something looks wrong

- Fewer than 365 AST dates, or a gap: the run was cut short; rerun into a new
  output folder.
- A header error naming `timing_quality`: the file came from an older version of
  the tool (before v1.4); rerun with the current tool.
- The 2027 values are a prediction from a model trained on observations up to
  29 September 2026. They are provisional and not for navigation, like 2026. A
  refit with newer observations is a separate, multi-step job and is not needed
  to keep the tides showing.

## Before the next year runs out

Nothing alerts today when the table is about to end. The proposal on the pull
request for #1200 is a daily worker check that warns when the last stored
Prickly Bay event is less than 45 days ahead. Until it exists, file an issue each
autumn like #1200.
