# Restore drill

**Status:** Passed against the production backup. Run 41789991594 (2026-11-04) succeeded: the restore step took about 1.5 minutes and the whole run 1 minute 57 seconds. Run 42679143332 (2026-11-09) passed end to end and closed [#926](https://github.com/Marcus100/grenmet/issues/926). Runs monthly (see Schedule below); the application check (`api_check`) has not been run.  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-12

Proves that the latest off-host backups rebuild every core database and match the
code. Decision and rationale: [ADR-0021](../adr/0021-timed-recovery-drill.md). The
workflow is `.github/workflows/restore-drill.yml`; the logic is
`scripts/production/restore-drill.py`.

## What it checks

1. Downloads the newest dump of each database from Spaces with a read-only credential.
   It reads the scheduled backup's `production/YYYY/MM/DD/<database>_<timestamp>.dump`
   objects, or `production/core/latest-success.json` if that marker exists. Every
   required database (`app_prod`, `wxwatch`, `wxproducts`, `janitorial`, `transport`,
   `eregister`) needs a dump under 24 hours old; extra ones such as the CMS
   are restored too.
2. Restores each into a throwaway PostgreSQL container whose data lives in tmpfs, so
   nothing is written to disk. The drill mounts a tmpfs at every path the image declares
   as a volume (`/var/lib/postgresql/data` for 17, `/var/lib/postgresql` for 18) and
   fails if any mount of the container is backed by disk, because Docker would
   otherwise create an anonymous on-disk volume there. It never connects to a live
   database.
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

## Optional API check

ADR-0021 step 4, built but **off by default and not yet run on real data**. Without it a
pass proves restoration, migration match and row floors only, not recovery of the
running application, and the recovery time stays unverified. **Do the first human-timed
run without it**, so the proven path is measured on its own, then try it as a second run.

Enable it with the `api_check` input (production backup set only), or locally with
`--api-check --api-image <image>`. After the restore and the migration and row checks
pass, the drill:

1. Pulls the release's API image (`ghcr.io/<repo>:production-sha-<commit>`, the tag
   `build-api-image.yml` publishes), refuses one whose revision or environment label
   does not match, and starts it on an `--internal` Docker network shared only with the
   throwaway PostgreSQL. The network has no route out, so nothing can reach production
   services or the internet. No volume is mounted and no port is published.
2. Points it at the restored databases with the variable names the deploy stack uses
   (`POSTGRES_*` for `app_prod`, and `EVENTS_`, `WXPRODUCTS_`, `WXWATCH_`, `EREGISTER_`,
   `JANITORIAL_` and `TRANSPORT_DATABASE_URL`). `SECRET_KEY` and the other secrets are
   random values made for the run. Redis is left unset (the API then uses in-memory rate
   limiting), and email, Stripe, Turnstile, storage and SSO settings are not passed.
3. Waits up to 5 minutes (`--api-timeout`) for `/api/v1/utils/health-check/` to return
   true.
4. Reads one active superuser id from the restored main database, mints a 15-minute
   access token inside the container with the app's own `create_access_token` and the
   drill key, and requires HTTP 200 from four read-only GET endpoints in
   `openapi.json`: `/api/v1/auth/users/me` (main database) and one-row lists from events,
   eRegister and wxwatch (each a separate database). No superuser is a **failure**,
   because authenticated recovery could not be proven.
5. Records `api_start`, `health` and `authenticated_reads` timings, which count toward
   the 2-hour total, and a pass or fail line per check in the summary and result file.
6. Always removes the API container and the network, including after a failure. Only
   paths, status codes and timings are logged; the token and secrets are passed by
   environment variable and never printed.

What it needs: the production API image for the release must exist in GHCR (the job gets
`packages: read` for the pull), the runner needs Docker and about 1 GB of extra disk
for the image, and the databases must be restored as `app_prod`, `events`, `eregister`
and `wxwatch` (a database that is not restored is simply not configured). It connects
as the throwaway `postgres` user, so the production runtime role and its grants are not
exercised.

Still not built: nothing opens an issue when the drill fails repeatedly.

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

Table names use `schema.table`. Floors are enforced from the next run.

## Schedule

The drill runs on the 1st of each month at 05:30 UTC against the production backup
set and the latest release, with no API check. A failed scheduled run opens (or adds
a comment to) the issue "friction: monthly restore drill failed". Dispatch it by hand
to choose a ref, the staging set or the API check.

The drill shares the `prod-droplet` queue with deploys and backups, and GitHub keeps
only one waiting run per queue, so a drill that is still waiting can be dropped by a
newer deploy or backup. A dropped run is cancelled, not failed, so it opens no issue:
if no drill ran in a month, dispatch it by hand.
