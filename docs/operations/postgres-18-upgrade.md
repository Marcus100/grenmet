# PostgreSQL 18 upgrade plan

**Status:** Approved by the owner 2026-11-13. Staging first, then production with the owner present  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-13

How the core database moves from PostgreSQL 17 to 18 without losing data. A database
major version is a one-way change for the data files, so each environment moves in an
announced window: staging first as the rehearsal, then production with the owner
present. The operator steps and stop rules are in the
[upgrade and restore-drill runbook](postgres-18-upgrade-runbook.md); this page is the
plan, the tooling and the rollback.

## Decision

Approved by the owner on 2026-11-13: move to PostgreSQL 18 by dump and restore into a
new volume (method below), run by the **PostgreSQL major upgrade** workflow.

Local development, the agent test database and CI moved to 18 in the same pull request
as the upgrade tooling, which merges into `dev` only when the staging window is booked.
Running a newer major locally than in CI and production would let a migration that only
works on 18 pass locally and fail in production.

## What was checked

On 2026-10-30, locally, in throwaway containers:

| Check | Result |
| --- | --- |
| Dependabot's change alone (`image:` line only) | **The container does not start.** PostgreSQL 18 images keep data in `/var/lib/postgresql/18/docker` and refuse to start while anything is mounted at `/var/lib/postgresql/data`, even an empty volume. |
| Fresh database on `postgis/postgis:18-3.6` with the mount moved to `/var/lib/postgresql` | Starts; `infra/postgres/init-*.sh` create every domain database and role. |
| `alembic upgrade head` on 18 (main and the eregister, janitorial, transport, wxproducts, wxwatch configs) | All six reach their heads. |
| API tests on 18 | `tests/bookings` (uses `btree_gist` exclusion constraints): 249 passed with one worker. |
| PostgreSQL 17 → 18 by dump and restore | Table and row counts match in all six databases; `alembic current` is at head. The only restore errors were the dev PostGIS image's own `tiger` and `topology` schemas, which production does not have. |
| An existing PostgreSQL 17 volume mounted into the 18 image | Refuses to start with a clear message; it does not silently create an empty database. |

On 2026-11-13, with the upgrade script, locally against a throwaway `grenmet-staging`
Compose project built from `docker-compose.deploy.yml` and `staging.env`:

| Check | Result |
| --- | --- |
| Dry run | Read-only: printed the source (17.11, old volume), the target (`postgres:18` 18.7, new volume at `/var/lib/postgresql`), databases, services to stop, free disk and the plan. |
| Upgrade | 17 → 18 with `btree_gist` exclusion constraints, two schemas, a database and role created by hand, and the runtime role: every row count, Alembic revision and extension matched; about 50 seconds from the dump to the checks on small data. |
| Second run after success | Recognised the finished upgrade and changed nothing. |
| Rollback | Switching the image and volume back started 17 on the untouched old volume with all rows. |
| Re-run against a used new volume | Refused before any change. |
| A client connection that stays open | Stopped before the dump; the stopped services were started again. |

Not checked: `pg_upgrade`, the Payload CMS against 18 (its database was empty), real
data volumes and timings. Staging measures those.

## Current state

- Staging and production run plain `postgres:17` until each runs the upgrade. No
  application database creates the PostGIS extension (ADR-0046); the only extension
  migrations create is `btree_gist`. **There is no PostGIS extension to upgrade.**
- Development and the agent test database use `postgis/postgis:18-3.7`; CI uses the GHCR
  mirror of `postgres:18` and `postgis/postgis:18-3.7`, pinned by digest.
- **TimescaleDB is not used by the core database.** It exists only in the separate
  SURFACE stack (`infra/weather/docker-compose.surface.yml`), which keeps PostgreSQL 17
  and needs its own plan. It is out of scope here.
- Backups: `backup-database.yml` dumps each production database nightly with `pg_dump`
  inside the database container. It does **not** dump roles; the upgrade script dumps
  them itself. Staging has no scheduled backup; the script's final dumps stay on the host.

## Method: dump and restore into a new volume

| | Dump and restore | `pg_upgrade --link` |
| --- | --- | --- |
| Tooling | The tools the backup already uses | A special image with both versions (for example `tianon/postgres-upgrade:17-to-18`) |
| Old data | Untouched in the old volume, so rollback is a configuration switch | Linked files; after the new server starts, the old cluster is no longer safe to start |
| Downtime | Proportional to size. Our dumps are small; staging measures it | Seconds to minutes, regardless of size |
| Catches | Rebuilds every index, so the operating system collation change between the images (Debian bookworm → trixie) cannot corrupt text indexes | Needs a `REINDEX` of text indexes for the collation change, and `initdb --no-data-checksums` (18 turns checksums on by default; 17 clusters here have them off) |

Use `pg_upgrade` only if the databases grow too large for the downtime.

## How the switch stays safe

Three settings move together, and `scripts/production/render-env.py` refuses any
deploy where they disagree, before anything on the server changes:

| Setting | PostgreSQL 17 | PostgreSQL 18 |
| --- | --- | --- |
| `CORE_POSTGRES_IMAGE` (GitHub variable) | `postgres:17@sha256:…` | `postgres:18@sha256:b9f6b8ff03b62f3cfd9d9ba3fe56226a9991c79d3fb46fd46536263bf02be553` (18.7) |
| Data volume | `PGDATA_VOLUME` in `staging.env` or `production.env` (`grenmet-staging_pgdata-staging`, `grenmet_pgdata`) | `CORE_PGDATA_VOLUME` (GitHub variable): `grenmet-staging_pgdata18`, `grenmet_pgdata18` |
| Data mount (derived, never set by hand) | `/var/lib/postgresql/data` | `/var/lib/postgresql` |

- A volume made for 18 ends in `pgdata18`; any other name holds 17. An 18 image on a 17
  volume, or a 17 image on an 18 volume, is refused with "change CORE_POSTGRES_IMAGE
  and CORE_PGDATA_VOLUME together". This matters because a 17 image with a 17 volume
  mounted at the 18 path would start an empty database inside the old volume.
- `CORE_PGDATA_VOLUME` is a separate name on purpose: Compose prefers a variable from the
  shell over its env files, even an empty one, so `PGDATA_VOLUME` is never exported.
- Between setting both variables and running the upgrade, the new volume does not exist
  yet. A deploy in that window fails at the database step with `external volume
  "…_pgdata18" not found`, before it touches the running database (checked locally with Docker Compose). That is expected; the old release keeps serving.

## Run it (staging first, then production)

The workflow runs `scripts/production/postgres-major-upgrade.sh` on the environment's
self-hosted core runner, in the same concurrency group as Deploy, the backup and the
restore drill. It first runs Deploy's own ref check (`validate-ref.sh`): staging only
from the `staging` branch, production only from a `v*` tag on `main` with a published
release. A wrong ref fails that job, visibly, and nothing runs on the droplet.

**Prepare (no downtime)**

1. Merge the pull request into `dev` once the staging window is booked, and promote it to
   `staging` as usual. The staging deploy keeps running 17: nothing changes until the
   variables move.
2. In the GitHub environment (`staging` first), set:
   - `CORE_POSTGRES_IMAGE` = `postgres:18@sha256:b9f6b8ff03b62f3cfd9d9ba3fe56226a9991c79d3fb46fd46536263bf02be553`
   - `CORE_PGDATA_VOLUME` = `grenmet-staging_pgdata18` (production: `grenmet_pgdata18`)

   Do not create the volume; the upgrade does. Note the old `CORE_POSTGRES_IMAGE` value
   for the rollback.
3. Production only: run **Database Backup** and wait for it to pass (the script refuses a
   backup older than 6 hours), and the [restore drill](restore-drill.md) with
   `postgres_image` set to the 18 image if practical. Record the backup in the release
   notes ([release runbook](release-runbook.md), "Irreversible data migrations").
4. Run **PostgreSQL major upgrade** with `environment` = `staging`, `mode` = `dry-run`,
   `confirm` = `staging`, from the `staging` branch (production: the release tag). It
   changes nothing. Read its output: source and target, the databases, the services it
   will stop, free disk, the backup check. Fix anything it refuses and run it again.

**Upgrade (downtime)**

5. Announce the window. Run the workflow again with `mode` = `upgrade`. Production asks
   for the environment's reviewers first.
6. The run summary shows each phase and its time. On success the services are back and the
   smoke checks passed. Downtime ends. If only the restart or the smoke checks failed (the
   run says the data passed every check), fix the cause and run `upgrade` again: it only
   restarts the services and repeats the smoke checks.

**After**

7. Run **Database Backup** at once (production); it now uses 18's `pg_dump`. Run the
   release smoke checks ([release runbook](release-runbook.md), "Verify prod").
8. Record the phase timings and anything unexpected. Staging's timings set the
   production window.
9. Keep the old 17 volume, unchanged, for at least 14 days, then remove it with the
   owner's go, together with the run directory the script names at the end
   (`rm -rf /var/backups/grenmet/pg-major-upgrade/<env>-<time>`). That directory holds the
   final dumps (mode 700, on the droplet only: the upgrade job has no write key for the
   backup bucket, and production's nightly backup already copies 18's data off the host).
   The roles dump with password hashes (`globals.sql`, `missing-roles.sql`) is deleted as
   soon as a run ends, whether it succeeded or failed. Tracked in
   [issue #1371](https://github.com/Marcus100/grenmet/issues/1371).
10. Repeat steps 2 to 9 for production, from the release tag that contains this change,
    with the owner present.

If the PostGIS extension is ever installed (not today), add `ALTER EXTENSION postgis
UPDATE;` in each database that has it after the restore.

## What the script does

`postgres-major-upgrade.sh --environment <env> --confirm <env> [--dry-run | --clear-marker [--accept-data-loss]]`
reads the source from the running `db` container and the target from `render-env.py`,
using the same secrets and environment file as `core.sh deploy`. It holds the core
maintenance lock, so no deploy or backup through `core.sh` runs at the same time.

Three markers in `/var/backups/grenmet/pg-major-upgrade/` (mode 755, so any user can see
them; run directories stay 700) carry the state between runs:

| Marker | Written | Removed | Effect |
| --- | --- | --- | --- |
| `<env>.in-progress` | Before the services stop (`phase=writers-stopped`), rewritten before the 17 server stops (`phase=switched`), and marked `reopened=1` once the services restart | When the restart and smoke checks pass; when a failure before the switch has restarted the services; or by `clear-marker` | `core.sh` refuses to deploy or back up; **Database Backup** and **Monitoring maintenance** refuse to run |
| `<env>.verified` | When the restored data matches the old server | At the next upgrade's switch | A rerun only restarts the services and runs the smoke checks |
| `<env>.completed` | When the restart and smoke checks pass | Never | A rerun does nothing |

While the data moves, the stopped services' restart policy is `no`, so a host reboot
cannot start them on an unchecked database. Their policies come back before they start
again, and `clear-marker` restores them too.

Other jobs on the droplet: **Inspect Databases** and **Monitoring maintenance** share the
droplet's concurrency group with the upgrade, and maintenance also takes the core lock.
**Monitoring daily receipts** only reads aggregates and is not blocked; if its connection
is open when the services stop, the upgrade stops before the dump and restarts them, so
run the upgrade away from 04:50 UTC.

| Phase | What happens | If it fails |
| --- | --- | --- |
| preflight (every mode) | Target paired by `render-env.py`; no unfinished upgrade recorded; one running `db` on the old major; new volume absent, or empty and unused; free disk for the new cluster and the dumps (three times the data plus 2 GB on one disk, or split by disk); production backup under 6 hours; target image present or pulled | Nothing changed |
| stop-writers | Writes `<env>.in-progress`; sets the restart policy of every service of the project except `db`, `redis` and the proxy to `no` and stops them; waits for client connections to close | Policies restored, services started again, marker removed; database unchanged |
| record, dump | Row count of every table, Alembic revisions, extensions, roles and memberships; `pg_dump --format=custom --compress=9` of every database, checked with `pg_restore --list`; `pg_dumpall --globals-only`; the counts again, which must not have moved | Services started again; database unchanged |
| switch | Rewrites `<env>.in-progress`, stops the 17 server, creates the new volume, starts 18 through the deployment compose file, waits for TCP connections | Services stay stopped, deploys refused; rollback below |
| roles | `init-databases.sh` as a deploy runs it; the runtime role and any other role only the old server had, from `globals.sql` with its password hash; databases a deploy does not create, with their old owner | Same |
| restore, analyze | `pg_restore --exit-on-error` into each empty database; `grant-api-runtime.sh`; `vacuumdb --all --analyze-in-stages` | Same |
| verify | Version, row counts, Alembic revisions, extensions and databases equal the recorded ones; writes `<env>.verified` | Same |
| reopen, smoke | Restores the restart policies, starts the stopped containers, waits until healthy, runs `smoke.mjs`; writes `<env>.completed`, removes the marker and the roles dump | Data is already checked: run `upgrade` again to retry, fix forward, or ask the owner |

A second run after success changes nothing. A run against a volume that already holds
data, with `db` on 18 whose data was never verified, or while an unfinished upgrade is
recorded, is refused. Output never shows secrets or restored rows; `pg_restore` logs stay
in the run directory (mode 700). Any dump left in a database container's `/tmp` by a
failed run is removed on exit.

## Rollback

- **Before the services reopen** (any failure after the switch; the workflow prints these
  steps with the exact values):
  1. Set `CORE_POSTGRES_IMAGE` back to the 17 value and delete `CORE_PGDATA_VOLUME` in the
     GitHub environment.
  2. Run **PostgreSQL major upgrade** with `mode` = `clear-marker`. It refuses while the
     variables still name the unverified volume, then restores the services' restart
     policies, removes the run's roles dump and removes `<env>.in-progress`. Without the workflow, on the droplet:
     `rm /var/backups/grenmet/pg-major-upgrade/<env>.in-progress` (the next deploy
     recreates the services with their policies).
  3. Run **Deploy** for that environment. It starts 17 on the old volume, which 18 never
     wrote, and starts the services.

  Keep the new volume until the cause is known, then remove it by hand before trying
  again.
- **After reopening:** writes made on 18 exist only on 18. A PostgreSQL 18 custom-format
  dump cannot be read by the 17 `pg_restore`, so moving back means a plain-SQL `pg_dump`
  from 18 restored into a fresh 17 volume, or accepting the loss of post-upgrade writes
  by switching back to the old volume. Do not decide this alone: stop and ask the owner.
  `clear-marker` refuses this rollback once the services have restarted on 18; only
  `clear-marker-accept-data-loss` (`--accept-data-loss`), on the owner's decision, does it.
  Once the services reopen, prefer fixing forward.
- Application rollback ([release runbook](release-runbook.md)) does not touch the
  database and is independent of this.

## Everything that pins the major

Moved together in the pull request that added the script and the workflow:

- `infra/docker/docker-compose.yml` (development image `postgis/postgis:18-3.7`, mount `pgdata:/var/lib/postgresql`)
- `scripts/agents/test-db.sh` (same image, `--tmpfs /var/lib/postgresql`) and `scripts/agents/test-db.test.mjs`
- `scripts/verification/compose.yml` (both images and their `tmpfs` paths)
- `.github/workflows/ci-api.yml` and `.github/workflows/ci-web.yml` (GHCR mirror of `postgres:18` and `postgis/postgis:18-3.7`, by digest)
- `infra/docker/docker-compose.deploy.yml` (mount from `CORE_POSTGRES_DATA_MOUNT`, image message) and the retired `docker-compose.prod.yml` and `docker-compose.staging.yml`
- `scripts/production/render-env.py` (17 and 18 images, mount and volume as one set) with `render-env.test.mjs` and `deploy-preflight.test.mjs`
- `scripts/production/restore-drill.py` and `.github/workflows/restore-drill.yml` (default `postgres:18`, which reads 17 and 18 dumps)
- `docs/infrastructure.md`
- `scripts/monitoring/maintenance.py` (the weekly restore check mounts a tmpfs at every
  path the database image declares, so it starts on 17 and 18)

Still per environment, at its upgrade: the GitHub variables `CORE_POSTGRES_IMAGE` and
`CORE_PGDATA_VOLUME`. After both environments run 18, a follow-up can set
`PGDATA_VOLUME` in the environment files to the 18 volumes, delete `CORE_PGDATA_VOLUME`,
move it out of `pending` in `scripts/ci/environment-settings.json`, and drop 17 from
`render-env.py`.

## Local development

An existing `grenmet-postgres` volume holds PostgreSQL 17 data and does not start on 18.
Either reset it (`pnpm reset`, which deletes local data) or dump first:
`docker exec grenmet-postgres pg_dumpall -U app > ~/pg17-dev.sql`, then `pnpm reset`,
then `psql -h localhost -U app -d postgres -f ~/pg17-dev.sql`. The 18 image refuses to
start on the old volume rather than initialising an empty database in it. The agent test database
(`scripts/agents/test-db.sh`) is a tmpfs container: `down`, then `up` recreates it on 18.

## Other PostgreSQL 18 changes that matter here

- New clusters have data checksums on by default (only matters for `pg_upgrade`).
- MD5 passwords are deprecated; the images use SCRAM already.
- `btree_gist` is 1.8 on 18 (1.7 on 17); the restore creates the new version.
- The database drivers in use (`asyncpg`, `psycopg`) worked in the tests above; staging
  checks the Payload CMS (`pg`) against 18.

## Appendix: manual fallback

Only if the workflow cannot run (for example the runner is down) and the owner agrees.
On the droplet, from `infra/docker`, with the environment's secrets exported as in
Deploy. Replace `<project>`, `<db>` and the volume names; never print secrets.

```bash
# 7. Stop every writer, keep db, redis and the proxy.
docker ps --filter label=com.docker.compose.project=<project> --format '{{.ID}} {{.Label "com.docker.compose.service"}}'
docker stop <ids of every service except db, redis, proxy, traefik-socket-proxy>

# 8. Row counts first (COUNT_SQL in postgres-major-upgrade.sh, per database), then dumps
#    and roles from the 17 server, inside the container.
docker exec <old-db> sh -c 'pg_dump -U "$POSTGRES_USER" --format=custom --compress=9 -d <db> -f /tmp/<db>.dump'
docker cp <old-db>:/tmp/<db>.dump ./<db>.dump
docker exec <old-db> sh -c 'pg_dumpall -U "$POSTGRES_USER" --globals-only' > globals.sql   # password hashes: chmod 600

# 9. Switch: stop db, create the volume, start 18 on it (both GitHub variables already set).
docker stop <old-db>
docker volume create <project>_pgdata18
python3 ../../scripts/production/render-env.py <env>.env runtime/.env.local
docker compose --env-file <env>.env --env-file runtime/.env.local -f docker-compose.deploy.yml -p <project> up -d --no-deps --wait db
docker compose ... exec -T db bash /docker-entrypoint-initdb.d/init-databases.sh
# Create the runtime role (and any other missing role) from its CREATE ROLE and ALTER ROLE lines in globals.sql.

# 10. Restore each database, then the runtime grants.
docker cp ./<db>.dump <new-db>:/tmp/<db>.dump
docker exec <new-db> sh -c 'pg_restore -U "$POSTGRES_USER" -d <db> --exit-on-error /tmp/<db>.dump'
docker compose ... exec -T db bash /opt/grenmet/grant-api-runtime.sh

# 11. Statistics.
docker exec <new-db> sh -c 'vacuumdb -U "$POSTGRES_USER" --all --analyze-in-stages'

# 12. Check: select version(); Alembic revisions, btree_gist and row counts equal step 8.
# 13. Start the stopped containers, check /api/v1/utils/ready/, run the smoke checks.
docker start <ids from step 7>
rm -f runtime/.env.local
```
