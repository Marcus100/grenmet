# PostgreSQL 18 upgrade plan

**Status:** Proposed, needs the owner. Not scheduled  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-30

How to move the core database from PostgreSQL 17 to 18 without losing data. It
started from Dependabot pull request #850 (`postgis/postgis` 17-3.5 → 18-3.6 in
`infra/docker/docker-compose.yml`). A database major version is a one-way change
for the data files, so production moves only on the owner's go, after staging.

## Decision needed

1. Whether to move to PostgreSQL 18 now or after launch. Nothing in the code needs 18.
2. If yes: dump and restore into a new volume (recommended below) during a short,
   announced write freeze.
3. Local development and CI move in the same change as staging, not before. Running
   a newer major locally than in CI and production lets a migration that only works
   on 18 pass locally and then fail in production.

## What was checked (2026-10-30, local, throwaway containers)

| Check | Result |
| --- | --- |
| Dependabot's change alone (`image:` line only) | **The container does not start.** PostgreSQL 18 images keep data in `/var/lib/postgresql/18/docker` and refuse to start while anything is mounted at `/var/lib/postgresql/data`, even an empty volume. CI also fails: `scripts/agents/test-db.test.mjs` requires `test-db.sh` and the dev compose to pin the same image. |
| Fresh database on `postgis/postgis:18-3.6` (PostgreSQL 18.6, PostGIS 3.6.4) with the mount moved to `/var/lib/postgresql` | Starts; `infra/postgres/init-*.sh` create every domain database and role. |
| `alembic upgrade head` on 18 (main and the eregister, janitorial, transport, wxproducts, wxwatch configs) | All six reach their heads (`sociallive20261030`, `eregister_0007`, `janitorial_0002`, `transport_0003`, `wxproducts_0005`, `wxwatch_0007`). |
| API tests on 18 | `tests/bookings` (uses `btree_gist` exclusion constraints): 249 passed with one worker. |
| PostgreSQL 17 → 18 by dump and restore | Migrated a 17.5 database, dumped every database with `pg_dump --format=custom --compress=9` (as the nightly backup does), restored with the 18 `pg_restore`. Table and row counts match in all six databases; `alembic current` is at head. The only restore errors were the dev PostGIS image's own `tiger` and `topology` schemas, which production does not have. |
| An existing PostgreSQL 17 volume mounted into the 18 image | Refuses to start with a clear message; it does not silently create an empty database. |

Not checked: `pg_upgrade` (needs both versions' binaries in one container), the
Payload CMS against 18 (its database was empty), real data volumes and timings.

## Current state

- Staging and production run plain `postgres:17` (`CORE_POSTGRES_IMAGE`, checked by
  `scripts/production/render-env.py`). No application database creates the PostGIS
  extension (ADR-0046); the only extension migrations create is `btree_gist`.
  **There is no PostGIS extension to upgrade in production.**
- The development image is `postgis/postgis`, which installs PostGIS into the default
  database and `template_postgis` on first boot. Nothing in the API uses it.
- **TimescaleDB is not used by the core database.** It exists only in the separate
  SURFACE stack (`infra/weather/docker-compose.surface.yml`,
  `timescale/timescaledb-ha:pg17.11-ts2.31.0`). That stack keeps PostgreSQL 17 and
  needs its own plan (TimescaleDB version first, then the PostgreSQL major); it is
  out of scope here.
- Backups: `backup-database.yml` dumps each database nightly with `pg_dump` inside the
  database container and test-restores it. It does **not** dump roles; `core.sh
  deploy` recreates databases and roles from secrets.

## Method: dump and restore into a new volume (recommended)

| | Dump and restore | `pg_upgrade --link` |
| --- | --- | --- |
| Tooling | The tools the backup already uses | A special image with both versions (for example `tianon/postgres-upgrade:17-to-18`) |
| Old data | Untouched in the old volume, so rollback is a configuration switch | Linked files; after the new server starts, the old cluster is no longer safe to start |
| Downtime | Proportional to size. Our dumps are small; measure on staging | Seconds to minutes, regardless of size |
| Catches | Rebuilds every index, so the operating system collation change between the images (Debian bookworm → trixie) cannot corrupt text indexes | Needs a `REINDEX` of text indexes for the collation change, and `initdb --no-data-checksums` (18 turns checksums on by default; 17 clusters here have them off) |

Dump and restore is simpler, already rehearsed by the backup workflow, and leaves
the old volume as the rollback. Use `pg_upgrade` only if the databases grow too large
for the downtime.

## Steps (staging first, then production)

Staging is throwaway, so it is the rehearsal: run every step there, record the
timings, then repeat on production with the owner present.

**Prepare (no downtime)**

1. Change everything that pins the major in one pull request (list below), with the
   new data mount at `/var/lib/postgresql`. Merge to `dev` only when the staging
   window is booked.
2. Pin the new image by digest in the `CORE_POSTGRES_IMAGE` environment variable
   (`postgres:18@sha256:…`) for the target environment.
3. Create the new external volume next to the old one:
   `docker volume create <env>_pgdata18`. Do not delete or reuse the old volume.
4. Confirm free disk for a second copy of the data plus the dumps.

**Back up**

5. Run **Backup database** for the environment and confirm success, plus the restore
   drill if practical (`docs/operations/restore-drill.md`). Record the backup id in
   the release notes (`release-runbook.md`, "Irreversible data migrations").
6. Copy the dumps off the server too (they already go to Spaces).

**Upgrade (downtime starts)**

7. Announce the window. Stop every writer, keeping only the database running:
   `docker compose stop` for the API, worker, web and CMS services.
8. Final dumps from the 17 server, inside the container:
   - every database: `pg_dump -U "$POSTGRES_USER" --format=custom --compress=9 -d <db> -f /tmp/<db>.dump`
     (the seven the backup covers, plus `gms_cms` when provisioned), then `docker cp`
     them out;
   - roles: `pg_dumpall -U "$POSTGRES_USER" --globals-only > globals.sql`.
9. Stop the database. Set `PGDATA_VOLUME` to the new volume and `CORE_POSTGRES_IMAGE`
   to the 18 digest, then deploy. The deploy starts PostgreSQL 18 on the empty volume
   and its "ensure databases" step creates the databases and roles from secrets.
   Compare the roles with `globals.sql`; apply any role that is missing from it.
10. Stop the writers again if the deploy started them, then restore each database:
    `pg_restore -U "$POSTGRES_USER" -d <db> --exit-on-error /tmp/<db>.dump`.
11. Refresh planner statistics: `vacuumdb -U "$POSTGRES_USER" --all --analyze-in-stages`.
12. Check: `select version()`; `alembic current` shows the head for each config;
    `pg_extension` shows `btree_gist` (1.8); per-database table and row counts match
    the 17 server (count before step 9).
13. Start the services, check `/api/v1/utils/ready/`, then run the release smoke
    checks (`release-runbook.md`, "Verify prod"). Downtime ends.

**After**

14. Run **Backup database** at once. The backup now runs PostgreSQL 18's `pg_dump`.
15. Keep the old 17 volume, unchanged, for at least 14 days, then remove it with the
    owner's go.

If the PostGIS extension is ever installed (not today), add after step 10:
`ALTER EXTENSION postgis UPDATE;` (or `SELECT postgis_extensions_upgrade();`) in
each database that has it.

## Rollback

- **Before the services reopen (steps 9–13):** set `PGDATA_VOLUME` and
  `CORE_POSTGRES_IMAGE` back to the 17 values and deploy. The old volume was never
  written by 18, so nothing is lost.
- **After reopening:** writes made on 18 exist only on 18. A PostgreSQL 18
  custom-format dump cannot be read by the 17 `pg_restore`, so moving back means a
  plain-SQL `pg_dump` from 18 restored into a fresh 17 volume, or accepting the loss
  of post-upgrade writes by switching back to the old volume. Decide within the
  window; once the services reopen, prefer fixing forward.
- Application rollback (`release-runbook.md`) does not touch the database and is
  independent of this.

## Everything that pins the major (change together)

- `infra/docker/docker-compose.yml` (development image and mount `pgdata:/var/lib/postgresql`)
- `scripts/agents/test-db.sh` (image and `--tmpfs /var/lib/postgresql`) and `scripts/agents/test-db.test.mjs`
- `scripts/verification/compose.yml` (both images and their `tmpfs` paths)
- `.github/workflows/ci-api.yml` (`postgres:17` service) and `.github/workflows/ci-web.yml` (storage integration service)
- `infra/docker/docker-compose.deploy.yml` (data mount and the image message), and the legacy `docker-compose.prod.yml` and `docker-compose.staging.yml`
- `scripts/production/render-env.py` (approved image pattern) with `render-env.test.mjs` and `deploy-preflight.test.mjs`
- `scripts/production/restore-drill.py` and `.github/workflows/restore-drill.yml` (default image)
- `docs/infrastructure.md` ("PostgreSQL 17")
- GitHub environment variables `CORE_POSTGRES_IMAGE` and `PGDATA_VOLUME` for staging and production

## Local development

After the development image moves, an existing `grenmet-postgres` volume will not
start (PostgreSQL 17 data). Either reset it (`pnpm reset`, which deletes local data)
or dump first: `docker exec grenmet-postgres pg_dumpall -U app > ~/pg17-dev.sql`,
then `pnpm reset`, then `psql -h localhost -U app -d postgres -f ~/pg17-dev.sql`.

## Other PostgreSQL 18 changes that matter here

- New clusters have data checksums on by default (only matters for `pg_upgrade`).
- MD5 passwords are deprecated; the images use SCRAM already.
- The database drivers in use (`asyncpg` 0.32.0, `psycopg` 3.3.6) worked in the
  tests above; check the Payload CMS (`pg`) on staging.
