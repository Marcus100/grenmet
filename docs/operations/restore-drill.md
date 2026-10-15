# Restore drill

**Status:** Built, not yet run against real backups  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-15

Proves that the latest off-host backups rebuild every core database and match the
code. Decision and rationale: [ADR-0021](../adr/0021-timed-recovery-drill.md). The
workflow is `.github/workflows/restore-drill.yml`; the logic is
`scripts/production/restore-drill.py`.

## What it checks

1. Downloads the newest dump of each database from Spaces with a read-only credential.
   It reads the scheduled backup's `production/YYYY/MM/DD/<database>_<timestamp>.dump`
   objects, or `production/core/latest-success.json` if that marker exists. Every
   required database (`app_prod`, `wxwatch`, `wxproducts`, `janitorial`, `transport`,
   `eregister`, `events`) needs a dump under 24 hours old; extra ones such as the CMS
   are restored too.
2. Restores each into a throwaway PostgreSQL container whose data lives in tmpfs, so
   nothing is written to disk. It never connects to a live database.
3. Compares each database's Alembic revision with the head in the code of the latest
   release, and checks that every database restored with data and meets the row floors.
4. Records time per phase and fails if the total exceeds 2 hours.
5. Always removes the container and the downloaded dumps. The log and the result file
   hold table names, row counts and timings only, never row contents.

## How it relates to the manual restore

`scripts/production/restore-core.sh` restores downloaded dumps by hand onto an isolated
restore host and leaves the databases for a person to inspect. The drill automates the
same restore with the same safe flags (fatal on error, no owners or privileges) in a
container it creates and removes, and adds the migration, row-floor and timing checks.
Use the manual script for a real recovery and the drill to prove the process works.

## Not covered yet

Starting the API against the restored databases and running authenticated reads
(ADR-0021 step 4). Until that exists, a pass does not prove recovery of the running
application, and the recovery time stays unverified. Nothing yet opens an issue when
the drill fails repeatedly.

## One-time setup

- Create a **read-only** Spaces key and add it to the `production-backup` GitHub
  environment as `DO_SPACES_READ_ACCESS_KEY_ID` and `DO_SPACES_READ_SECRET_ACCESS_KEY`.
  The drill refuses to run without them and never uses the backup job's write key.
- Dumps contain staff and client data and are restored on the self-hosted production
  runner. Run the drill off-peak, because it competes with production for disk and CPU.
  Make sure the runner has space for all the dumps plus the tmpfs size (default 4 GB,
  `--tmpfs-size`).

## Run it

Dispatch **Restore Drill** from the Actions tab (environment `production`). Leave `ref`
empty to check against the latest published release. Use the reviewed core PostgreSQL
image for `postgres_image` so versions match production.

Locally, against a directory laid out like the bucket:

```bash
scripts/agents/api-env.sh bash scripts/production/restore-drill-heads.sh > heads.json
python3 scripts/production/restore-drill.py production --heads heads.json --source-dir <dir>
```

## After the first run

Download the `restore-drill-result` artifact. Choose a floor for each key table (for
example 90 percent of the observed rows) and save them as
`docs/operations/restore-drill-floors.json`:

```json
{ "app_prod": { "hr.employment_record": 100 } }
```

Table names use `schema.table`. Floors are enforced from the next run. Enable a monthly
schedule only after one human-timed run passes.
