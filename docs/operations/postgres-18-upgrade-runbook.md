# PostgreSQL 18 upgrade and restore-drill runbook

**Status:** Approved by the owner 2026-11-13. Staging first, then production with the owner present  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-13

The operator steps and stop rules for moving the core database from PostgreSQL 17
to 18 (issue #926 for the drill, issue #1024 item 4 for this runbook). The plan, the
safety rules for the switch, the **PostgreSQL major upgrade** workflow and the
rollback are in the [upgrade plan](postgres-18-upgrade.md). Development, CI and the
restore drill default already run 18; staging and production stay on 17 until each
runs the upgrade.

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
(`postgis/postgis:18-3.7`) is the local development and test image. So the PostGIS part of the move is a development and CI change; nothing in
production needs `ALTER EXTENSION postgis UPDATE` unless PostGIS is installed first.

## Stage 1: prove restore on PostgreSQL 18 (no production change)

1. Confirm the latest **Backup database** run succeeded and is under 24 hours old.
2. Dispatch **Restore Drill** (`restore-drill.yml`) with `environment=production`,
   `ref` empty (latest release) and `postgres_image` set to the reviewed PostgreSQL 18
   image, pinned by digest (the `CORE_POSTGRES_IMAGE` value in the
   [upgrade plan](postgres-18-upgrade.md#how-the-switch-stays-safe)). Leave `api_check` off for the
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

Follow "Run it" in the [upgrade plan](postgres-18-upgrade.md#run-it-staging-first-then-production)
on staging: set both GitHub variables, run the workflow as a dry run, then as an
upgrade. Record every phase's time from the run summary. Also check on staging only,
because it was not checked locally: the Payload CMS (`pg` driver) against 18, and real
data size and timing.

## Stage 3: production (owner present)

1. Preconditions: stage 1 passed on production dumps, stage 2 recorded and clean,
   the pull request that changes every pinned file is merged to `dev` and promoted,
   and the owner has booked and announced the write-freeze window.
2. Run **Backup database** immediately before, note the backup id in the release
   notes, and confirm the off-host copy.
3. Follow the same steps as staging, with the workflow dispatched from the release tag.
   The old 17 volume stays unchanged as the rollback for at least 14 days.
4. After the services reopen, run [launch-day checks](launch-day-run-sheet.md#verification)
   (health, smoke) and **Backup database** again; the backup then runs 18's `pg_dump`.

## Rollback

- **Before the services reopen:** set `CORE_POSTGRES_IMAGE` back to the 17 value, delete
  `CORE_PGDATA_VOLUME`, run the upgrade workflow with `mode` = `clear-marker` (deploys
  and backups are refused until then), and deploy. The old volume was never written by
  18. The workflow prints these steps with the exact values when it stops after the switch.
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
- `pg_upgrade` and the CMS on 18 are unchecked; the upgrade script was rehearsed locally
  only, on synthetic data.
- Nothing opens an issue when the drill fails: watch the run.
