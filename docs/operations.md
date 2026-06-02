# Operations Guide

This guide documents the operational behavior that is implemented in the repo today. For first-time server setup, see [deployment.md](deployment.md). For local development failures, see [troubleshooting.md](troubleshooting.md).

## Runtime Topology

Staging and production run as Docker Compose stacks on dedicated DigitalOcean droplets:

| Environment | Compose project | Compose file | Domains |
| --- | --- | --- | --- |
| Staging | `grenmet-staging` | `infra/docker/docker-compose.staging.yml` | `*.staging.barrels.gd` |
| Production | `grenmet` | `infra/docker/docker-compose.prod.yml` | `*.barrels.gd` |

Each stack includes:

- `db`: PostgreSQL 17. The same server hosts separate databases for FastAPI, `wxwatch`, and `wxproducts`.
- `api`: FastAPI backend on internal port `8000`.
- `prestart`: one-shot FastAPI migration/bootstrap container.
- `web-auth`, `web-admin`, `web-wxwatch`, `web-hurricaneplan`, `web-spicewx`, `web-wxproducts`, `web-hr`, `web-salesbus`.
- `proxy`: Traefik v3, terminating HTTPS and routing by host.
- `adminer`: present in staging only in the current compose files.

## Deployments

Staging deployment is automated from the `staging` branch. The deploy workflow waits for the API image workflow and web image workflow where applicable, writes a temporary `.env` file from GitHub environment secrets, validates the compose file, pulls images, runs `docker compose up -d`, performs health checks, and deletes the temporary `.env`.

Production deployment is triggered by a published GitHub Release or manual workflow dispatch in `.github/workflows/deploy-prod.yml`. In the current workflow:

- The API image uses the release tag when available, otherwise `latest`.
- Web app services use `WEB_TAG=latest` in the production compose environment.
- Production should be protected by the GitHub `production` environment reviewer rules.

Do not deploy by editing containers manually. If manual fallback is required, follow the fallback section in [deployment.md](deployment.md#manual-deploy-fallback--no-ci), then remove the temporary `.env` file.

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

The deploy workflows currently check liveness and make a best-effort request to the auth app root. Use readiness when diagnosing database or migration failures.

## Incident Triage

Start with the smallest failing boundary:

1. DNS and TLS: verify the host resolves to the expected droplet and Traefik can issue certificates.
2. Stack status: run `docker compose -p grenmet-staging ps` or `docker compose -p grenmet ps`.
3. API liveness and readiness: check both probes above.
4. Logs: inspect `prestart`, `api`, `proxy`, `db`, then the specific web service.
5. Database: verify `db` is healthy and the target database exists.
6. Recent deploy: compare the failing service image tag with the last successful workflow run.

Useful commands on a server:

```bash
docker compose -p grenmet ps
docker compose -p grenmet logs api --tail 100
docker compose -p grenmet logs prestart --tail 100
docker compose -p grenmet logs proxy --tail 100
docker compose -p grenmet logs db --tail 100
```

Use `grenmet-staging` for staging.

## Backups And Restore

`.github/workflows/backup-database.yml` runs daily at 02:00 UTC on the self-hosted production runner and can also be dispatched manually.

Implemented backup behavior:

- Dumps `app_prod`, `wxwatch`, and `wxproducts` with `pg_dump --format=custom --compress=9`.
- Restores each dump into a temporary database to verify integrity.
- Uploads each dump to DigitalOcean Spaces under `production/YYYY/MM/DD/`.
- Keeps local dump files for `BACKUP_RETENTION_DAYS=30`.

Until a shorter schedule is implemented, the practical RPO is at most 24 hours for data covered by this workflow. RTO must be proven by restore drills; the internal programme target is under 2 hours, but that should not be treated as verified until a timed restore has passed.

Restore drill outline:

```bash
# On a controlled server, never directly on production first.
docker compose -p grenmet exec -T db createdb -U "$POSTGRES_USER" restore_test
docker cp /path/to/app_prod_YYYYMMDD_HHMMSS.dump grenmet-db-1:/tmp/restore.dump
docker compose -p grenmet exec -T db pg_restore -U "$POSTGRES_USER" -d restore_test /tmp/restore.dump
docker compose -p grenmet exec -T db psql -U "$POSTGRES_USER" -d restore_test -c "\dt"
docker compose -p grenmet exec -T db dropdb -U "$POSTGRES_USER" restore_test
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
- Automated restore drills.

