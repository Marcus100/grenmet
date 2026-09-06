# Infrastructure Guide

This guide documents the operational infrastructure implemented in this repo today. For first-time server setup see [deployment.md](deployment.md). For local development failures see [troubleshooting.md](troubleshooting.md).

## Runtime Topology

Staging and production run as Docker Compose stacks on dedicated DigitalOcean droplets:

| Environment | Compose project | Compose file | Domains |
| --- | --- | --- | --- |
| Staging | `grenmet-staging` | `infra/docker/docker-compose.deploy.yml` + `staging.env` | `*.staging.barrels.gd` |
| Production | `grenmet` | `infra/docker/docker-compose.deploy.yml` + `production.env` | `*.barrels.gd` |

Each stack includes:

- `db`: PostgreSQL 17. The same server hosts separate databases for FastAPI, `wxwatch`, `wxproducts`, `janitorial`, and `transport`.
- `api`: FastAPI backend on internal port `8000`.
- `prestart`: one-shot FastAPI migration/bootstrap container.
- `redis` + `worker`: Redis and the arq background worker (CAP outbox).
- `web-migrate`: one-shot Drizzle migration runner for the `wxwatch` + `wxproducts` databases, built from the gaa-admin `migrate` image stage; runs before `web-admin`.
- `web-auth`, `web-admin`, `web-docs`, `web-gms`, `web-signal`, `web-mbia`, and `web-events`: seven configured web services. The former `wxwatch`/`wxproducts`/`hr`/`salesbus` apps remain path-prefixed routes inside `web-admin`.
- `api-hono`: Node API on internal port `4000`, routed through `hapi`.
- `proxy`: Traefik v3, terminating HTTPS and routing by host.
- `adminer`: present in staging only in the current compose files.

## Deployments

A push to `staging` runs `pipeline-staging.yml`: CI, applicable image builds, and
deployment with the `staging` tag. Publishing a release runs `pipeline-prod.yml`,
which builds all images and deploys the release tag for API, web, Hono, and
migration images. Merging to `main` does not build deployment images or deploy.

The shared `deploy.yml` layers the committed environment file with temporary
`.env.secrets`, validates Compose, starts Postgres, ensures databases exist, and
starts the stack with migrations and health checks. It removes the secrets file
in cleanup. Runtime containers still hold their configured environment values.

The **Deploy**, **Deploy to Production**, and **Deploy to Staging** manual entry
points redeploy existing images. Supply an explicit tag and use the matching
release workflow ref for rollback. See the [release runbook](operations/release-runbook.md).
For a fallback without CI, use the [manual procedure](deployment.md#manual-deploy-fallback--no-ci).

This inventory describes the configured target layout. Confirm the relevant
pipeline succeeded before treating a new service or domain as live.

## Health Checks

FastAPI exposes two implemented probes:

| Probe | URL | Expected response | Meaning |
| --- | --- | --- | --- |
| Liveness | `/api/v1/utils/health-check/` | JSON `true` | Process is running |
| Readiness | `/api/v1/utils/ready/` | `{"status":"ready"}` | App can reach Postgres |

Environment URLs:

| Environment | Liveness | Readiness |
| --- | --- | --- |
| Local | `http://localhost:8000/api/v1/utils/health-check/` | `http://localhost:8000/api/v1/utils/ready/` |
| Staging | `https://api.staging.barrels.gd/api/v1/utils/health-check/` | `https://api.staging.barrels.gd/api/v1/utils/ready/` |
| Production | `https://api.barrels.gd/api/v1/utils/health-check/` | `https://api.barrels.gd/api/v1/utils/ready/` |

Deployment requires FastAPI liveness and the health checks for all seven web containers (`/api/health`) plus Hono (`/health`). External web-root checks are logged but non-fatal. FastAPI readiness is a separate diagnostic check; the workflow does not currently gate deployment on it.

## Incident Triage

Start with the smallest failing boundary:

1. DNS and TLS: verify the host resolves to the expected droplet and Traefik can issue certificates.
2. Stack status: inspect the target project with `docker ps` and the configured container health states.
3. API liveness and readiness: check both probes above.
4. Logs: inspect `prestart`, `api`, `proxy`, `db`, then the specific web service.
5. Database: verify `db` is healthy and the target database exists.
6. Recent deploy: compare the failing service image tag with the last successful workflow run.

Useful commands on a server (confirm names with `docker ps -a`):

```bash
docker ps -a --filter label=com.docker.compose.project=grenmet
docker logs grenmet-api-1 --tail 100
docker logs grenmet-prestart-1 --tail 100
docker logs grenmet-proxy-1 --tail 100
docker logs grenmet-db-1 --tail 100
```

For staging, use project/prefix `grenmet-staging`. Compose operations require the
explicit Compose file, committed environment file, temporary secrets, and project
arguments shown in the [manual procedure](deployment.md#manual-deploy-fallback--no-ci).

## Backups and Restore

`.github/workflows/backup-database.yml` runs daily at 02:00 UTC on the self-hosted production runner and can also be dispatched manually. Its credentials come from the `production-backup` GitHub environment.

Implemented backup behavior:

- Dumps `app_prod`, `wxwatch`, `wxproducts`, `janitorial`, and `transport` with `pg_dump --format=custom --compress=9`.
- Restores each dump into a temporary database to verify integrity.
- Uploads each dump to DigitalOcean Spaces under `production/YYYY/MM/DD/`.
- Keeps local dump files for `BACKUP_RETENTION_DAYS=30`.

Until a shorter schedule is implemented, the practical RPO is at most 24 hours for data covered by this workflow. RTO must be proven by restore drills; the internal programme target is under 2 hours, but that should not be treated as verified until a timed restore has passed.

Restore drill outline:

```bash
# On a controlled server, never directly on production first.
docker exec -i grenmet-db-1 createdb -U "$POSTGRES_USER" restore_test
docker cp /path/to/app_prod_YYYYMMDD_HHMMSS.dump grenmet-db-1:/tmp/restore.dump
docker exec -i grenmet-db-1 pg_restore -U "$POSTGRES_USER" -d restore_test /tmp/restore.dump
docker exec -i grenmet-db-1 psql -U "$POSTGRES_USER" -d restore_test -c "\dt"
docker exec -i grenmet-db-1 dropdb -U "$POSTGRES_USER" restore_test
```

For a real production restore, stop dependent app containers first, restore to the exact target database, then run readiness checks and application smoke tests before reopening the service.

## Access Review

Review these access points at least quarterly and after staff changes:

- GitHub repository collaborators and branch protection.
- GitHub environment secrets and required reviewers.
- Self-hosted runner access on each droplet.
- SSH users on droplets.
- Traefik and Adminer basic-auth credentials.
- FastAPI superusers, roles, permissions, and role assignments.
- Resend, Sentry, PostHog, GHCR, and DigitalOcean access.

## Current Operational Gaps

These are not implemented as repo-level controls yet:

- Centralized log storage and retention.
- External uptime monitoring and alert rules.
- Request ID or correlation ID middleware.
- OpenTelemetry for the FastAPI app. The vendored CAP Composer has OTEL support, but the main FastAPI app currently uses Sentry plus request logs.
- Redis-backed distributed rate limiting.
- Background worker execution for CAP publish job events.
- Timed, end-to-end recovery drills proving application recovery and RTO. The backup workflow already restores each database dump into a temporary database and checks for tables.
