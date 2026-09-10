# Verification before promotion

Run `pnpm verify:quick` for lint, types and unit tests. The pre-push hook remains
TypeScript plus unit tests. It does not claim backend or deployment acceptance.

From the **host workstation**, with Docker Compose, Node/pnpm, uv and PostgreSQL
client (`psql`) installed:

- `pnpm verify:backend`: temporary PostgreSQL/Redis and parallel Python coverage.
- `pnpm verify:storage`: temporary PostGIS plus real migration/seed/role tests.
- `pnpm verify:release`: quick checks, API-client drift, documentation links,
  guardrails, delivery tests, backend and storage integration.

The managed commands refuse to run inside a devcontainer. They create a unique
Compose project, random loopback-only ports and memory-backed database storage.
Their cleanup removes only that project. No existing Compose projects or volumes
are pruned. If interrupted forcibly (SIGKILL or host failure), inspect and remove
only the printed `grenmet-verify-*` project. Missing tools fail verification.

Backend and storage images match their respective CI service images. Redis is
available for backend tests. Nothing connects to staging or production; scheduled
backups remain production-only. These commands do not deploy or publish images.

## CI and manually managed test services

CI invokes the same scripts, passing explicit disposable service configuration:

- `bash scripts/verification/backend.sh` (PostgreSQL host/user/password required).
- `bash scripts/verification/storage.sh` (`STORAGE_TEST_POSTGRES_URL` required).

When intentionally using a dedicated test service from the devcontainer, these
scripts can connect to the host-published port. Never supply application-service
credentials. Backend database creation/teardown requires an administrative role
on the disposable instance; ordinary application roles should remain restricted.
Backend uses two workers by default; set `TEST_WORKERS` to measured capacity.
Coverage and JUnit reports are written under `apps/api/fastapi/`.

The shared database helper assigns a run identifier before importing application
settings and extends it with the worker identifier. Operations must match that
exact ownership tuple. Normal teardown drops only that database. Abrupt process
failure is additionally contained by the disposable instance lifecycle.

## Acceptance

Local verification, GitHub checks, container builds/scans and staging acceptance
are separate results. A required integration command must fail when its service
or tooling is missing, never report a skipped suite as acceptance. Unit-only CMS
runs may still skip explicitly optional integration tests.

Staging's existing pipeline gates deployment on all required CI and image jobs,
and passes the exact commit to deployment. Keep the existing workflow gate tests.
External branch rules and production promotion remain operator-controlled.

Before promoting these improvements, run the managed backend and storage commands
on the host, verify concurrent runs stay isolated, and review required GitHub PR
checks. No managed Docker execution has been verified from a container without
socket access.

References: [pytest-xdist isolation](https://pytest-xdist.readthedocs.io/en/stable/how-to.html),
[pytest-cov contexts](https://pytest-cov.readthedocs.io/en/latest/contexts.html),
[Turbo caching configuration](https://turborepo.dev/docs/reference/configuration),
[GitHub PostgreSQL services](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).
