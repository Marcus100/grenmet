# PostgreSQL 18 upgrade and restore-drill runbook

**Status:** Not scheduled. Needs the owner's go. Production and staging run PostgreSQL 17  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-02

The operator steps and stop rules for moving the core database from PostgreSQL 17
to 18 (issue #926 for the drill, issue #1024 item 4 for this runbook). The
analysis, the files that pin the major version and the local checks are in the
upgrade plan, `docs/operations/postgres-18-upgrade.md`, which lands with PR #882
(do not merge that PR except in the same window as the staging and production move).
Until PR #882 merges, `origin/dev` still pins PostgreSQL 17 everywhere, including
the restore drill default image (`postgres:17` in `.github/workflows/restore-drill.yml`),
and `docs/infrastructure.md`, `docs/operations/storage-delivery.md` and
`infra/weather/README.md` correctly say 17. Update them in the same pull request as
the move, not before.

## Rules that apply to every step

1. **The restore drill must pass before PostgreSQL 18 reaches production.** A pass
   means the drill restored the latest production dumps into a PostgreSQL 18
   container, the Alembic revisions matched the release, row floors held and the
   total stayed under 2 hours.
2. **Any problem means stop and ask the owner.** A failed drill, a restore error, a
   row count that differs, a migration that does not reach its head, a timing far
   above the rehearsal, a service that will not become healthy. Do not retry, skip a
   check or work around it. Record the raw output and wait.
3. Staging is the rehearsal and is throwaway; production moves only with the owner
   present, after a staging run with recorded timings.
4. Development and CI move in the same change as staging, never earlier, so a
   migration that only works on 18 cannot pass locally and fail in production.
5. SURFACE (`infra/weather/docker-compose.surface.yml`, TimescaleDB on PostgreSQL 17)
   is a separate stack with its own plan and **stays on 17**.

## What PostGIS means here

Staging and production run plain `postgres:17`, with `CORE_POSTGRES_IMAGE` checked by
`scripts/production/render-env.py`. No application database creates the PostGIS
extension; the only extension migrations create is `btree_gist`. The PostGIS image
(`postgis/postgis`, 17-3.5 now, 18-3.6 in PR #882) is the local development and test
image. So the PostGIS part of the move is a development and CI change; nothing in
production needs `ALTER EXTENSION postgis UPDATE` unless PostGIS is installed first.

## Stage 1: prove restore on PostgreSQL 18 (no production change)

1. Confirm the latest **Backup database** run succeeded and is under 24 hours old.
2. Dispatch **Restore Drill** (`restore-drill.yml`) with `environment=production`,
   `ref` empty (latest release) and `postgres_image` set to the reviewed PostgreSQL 18
   image, pinned by digest (`postgres:18@sha256:...`). Leave `api_check` off for the
   first run. The drill restores into a tmpfs-backed throwaway container and never
   touches a live database. Run it off-peak: it shares the production runner.
3. Download the `restore-drill-result` artifact. Record the total and per-phase
   times, and that every database reached its migration head.
4. Run it a second time with `api_check` on once the first passes
   ([restore drill](restore-drill.md#optional-api-check)).
5. If either run fails, or the dumps cannot be read by the 18 `pg_restore`, stop and
   ask the owner. Whether `restore-drill.py` itself is clean on 18 is not yet
   checked; a failure caused by the drill script is also a stop.

## Stage 2: staging rehearsal

Follow "Steps" in `docs/operations/postgres-18-upgrade.md` (lands with PR #882) on
staging: new data volume, dump, switch `CORE_POSTGRES_IMAGE` and `PGDATA_VOLUME`,
restore, check, reopen. Record every step's time. Also check on staging only, because
it was not checked locally: the Payload CMS (`pg` driver) against 18, and real data
size and timing.

## Stage 3: production (owner present)

1. Preconditions: stage 1 passed on production dumps, stage 2 recorded and clean,
   the pull request that changes every pinned file is merged to `dev` and promoted,
   and the owner has booked and announced the write-freeze window.
2. Run **Backup database** immediately before, note the backup id in the release
   notes, and confirm the off-host copy.
3. Follow the same steps as staging. The old 17 volume stays unchanged as the
   rollback for at least 14 days.
4. After the services reopen, run [launch-day checks](launch-day-run-sheet.md#verification)
   (health, smoke) and **Backup database** again; the backup then runs 18's `pg_dump`.

## Rollback

- **Before the services reopen:** set `CORE_POSTGRES_IMAGE` and `PGDATA_VOLUME` back
  to the 17 values and deploy. The old volume was never written by 18.
- **After reopening:** writes made on 18 exist only there, and a custom-format dump
  from 18 cannot be read by the 17 `pg_restore`. Do not decide this alone: stop and ask
  the owner. The options are a plain-SQL dump from 18 restored into a fresh 17 volume,
  or accepting the loss of post-upgrade writes by returning to the old volume.
- Application rollback ([release runbook](release-runbook.md#rollback--redeploy))
  does not touch the database and is independent.

## Gaps

- The drill has not been run against real backups on any version
  ([launch checklist](launch-checklist.md#restore-drill)); the read-only Spaces key is
  an owner action.
- `pg_upgrade` and the CMS on 18 are unchecked.
- Nothing opens an issue when the drill fails: watch the run.
