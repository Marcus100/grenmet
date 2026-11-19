# Loading a month of register sheets from CSV

**Status:** Active runbook
**Owner:** GMS (operational content); maintained by Barrels Grenada
**Last updated:** 2026-11-19

Use this to load a past month of the paper register for station 78958 into the
eRegister: first the hourly sheet (CL1 SYNOP), then the observers' daily values.
Both importers are in `apps/api/fastapi/scripts/`. Their rules live in
`apps/api/fastapi/src/eregister/cl1_import.py` and `daily_import.py`; the
design notes are in `apps/api/fastapi/src/eregister/AGENTS.md`.

## Before you start

- Save each sheet as CSV (UTF-8 is fine; a byte-order mark is accepted). Keep the
  files in the gitignored `temp-files/` folder or in `/private/`. Never commit a
  real sheet: the repository is public.
- Run the importers on the host machine that holds the local database, with
  `ENVIRONMENT=local`. They refuse to save anything otherwise, and they refuse a
  register database that is not on this machine. `--allow-non-local` is the
  owner's go only.
- Load the hourly sheet before the daily values. The daily importer only adds
  values to hourly drafts that the hourly importer made.

## Step 1: hourly sheet (dry run first)

```bash
cd apps/api/fastapi
uv run --frozen --package fast-back python scripts/import_cl1_synop.py \
  --csv /path/to/hourly-sheet.csv --report /path/to/hourly-report.csv
```

Without `--apply` nothing is saved. The output and the `--report` file list every
issue: a row with zeros for pressure and dry bulb is an hour that was not
observed; duplicate rows for one hour, and values the register would refuse,
block that hour. Read the report before going further. Fix the sheet or the
decision, then repeat the dry run until the report is acceptable.

When the dry run is clean, save the passing hours as drafts:

```bash
uv run --frozen --package fast-back python scripts/import_cl1_synop.py \
  --csv /path/to/hourly-sheet.csv --report /path/to/hourly-report.csv \
  --apply --actor <your-register-username>
```

Use `--historical` instead of `--apply` only when the hours are an archive
(they are saved as historical records, not drafts).

## Step 2: daily values (dry run first)

```bash
uv run --frozen --package fast-back python scripts/import_daily_values.py \
  --csv /path/to/daily-values.csv --report /path/to/daily-report.csv
```

The CSV has one row per main-hour observation in local time: `local_time`,
`rainfall_24h_mm`, `highest_temp_c`, `lowest_temp_c`, `strongest_gust_kt` and
`gust_time_local`. The 24-hour rainfall belongs only to the 08:00 local row.
Then, once the report is clean:

```bash
uv run --frozen --package fast-back python scripts/import_daily_values.py \
  --csv /path/to/daily-values.csv --report /path/to/daily-report.csv \
  --apply --actor <your-register-username>
```

`--actor` must be the same username used in step 1, because only the importer's
own drafts can be updated.

## Re-running and idempotency

- A re-run refreshes only a draft the importer made and nobody has reviewed.
- Every other entry for that hour (typed by an observer, reviewed, waiting for
  quality control, or accepted) is left alone and listed in the report.
- A rejected or superseded hour is not live, so a re-run saves a fresh draft over it.
  Check the report before re-running for such hours.

## Verification

1. The report shows no unexplained blocked hours.
2. In the register, the month shows one live entry per hour, and each importer draft
   is waiting for another register staff member to accept it. The importer cannot
   accept its own entries.
3. Keep the report files with the sheets, outside the repository.

## Related

- `apps/api/fastapi/src/eregister/AGENTS.md`: importer design, carry-over rules and the
  archive path (`scripts/mark_imported_historical.py`).
- `docs/operations/eregister-wmo-conformance.md`: the checks each entry must pass.
