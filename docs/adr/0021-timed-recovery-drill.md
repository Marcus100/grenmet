# ADR-0021: Timed recovery drill

## Status

Proposed — 2026-10-13. Needs owner approval before any workflow is added: it
reads production backups and uses the production runner.

## Context

`backup-database.yml` dumps six databases daily, restores each dump into a
temporary database to confirm it is readable, and uploads it to Spaces. The
staging monitoring pilot adds opt-in weekly restore drills. What is not proven,
as `docs/infrastructure.md` records, is *recovery*: that the latest dumps from
Spaces rebuild a working application inside the programme target of under 2
hours. Today the worst-case recovery time is an estimate, and a dump that
restores but does not match the code (migration drift, missing database) would
only be found during an incident.

## Decision

Add a monthly, manually dispatchable restore drill that proves recovery end to
end without touching production data:

1. Download the latest backup of every required database from Spaces using a
   read-only credential, and start the clock.
2. Restore into a throwaway Postgres container on the runner, never the
   production database or its volumes.
3. For each database, check that the Alembic revision equals the code's head
   (main and each separate-database domain), and that key tables are non-empty
   against a row-count floor recorded in the previous drill.
4. Start the API image for the current release against the restored databases
   and require the health check and a short list of authenticated read requests
   to pass.
5. Record elapsed time per phase and in total. Fail if any check fails or the
   total exceeds the 2-hour target, and publish the result as a job summary.
   Persistent failure opens a `friction` issue.
6. Always remove the container and downloaded dumps, including after failure.

The first run is manual and timed by a human, and the schedule is enabled only
after it passes. The RTO is described as verified only after a scheduled drill
has passed.

## Consequences

- Recovery time becomes a measured number with a history, and migration drift
  or a missing database is caught while it is cheap.
- Costs runner time, Spaces egress and a short-lived copy of production data on
  the runner, which must be encrypted at rest and deleted by the job. Dumps
  contain staff and client data, so the log must never print row contents.
- Needs: a read-only Spaces credential in the `production-backup` environment,
  scratch disk sized for all dumps, and a documented runbook link from
  `docs/infrastructure.md`.
- Does not replace a real production restore procedure or offsite retention
  policy; those stay as documented.
