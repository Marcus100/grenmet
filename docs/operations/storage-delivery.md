# Storage and delivery acceptance

Local commands use each workspace's `.env.local`. No developer secret file is written by initialization or deployment tooling. Online configuration uses committed non-secret `infra/docker/{staging,production}.env` plus GitHub environment secrets; the runner creates a private, temporary `infra/docker/runtime/.env.local` and removes it after deployment. Do not rename the committed environment descriptors to developer secret files.

## Authoritative store inventory

| Store / owner | Local / staging / production name | Configuration | Migration / baseline | Docker storage | Readiness / recovery |
| --- | --- | --- | --- | --- | --- |
| FastAPI auth, HR, CAP | `app` / `app_staging` / `app_prod` (confirm actual host) | `POSTGRES_*`, optional provisioning `APP_DB_*` | Alembic; staff/account baseline is explicit | core `pgdata`; preserve existing named volumes | API ready plus migration verification; custom pg_dump |
| Test runner | `app_test` only | test configuration | pytest setup | local core volume only | never provisioned or backed up as deployed data |
| wxwatch | `wxwatch` / `wxwatch_staging` / `wxwatch` | `WXWATCH_DATABASE_URL`, `WXWATCH_DB_*` | Drizzle | core `pgdata` | admin ready; pg_dump plus image objects |
| wxproducts | `wxproducts` / `wxproducts_staging` / `wxproducts` | `WXPRODUCTS_DATABASE_URL`, `WXPRODUCTS_DB_*` | Drizzle | core `pgdata` | admin ready; pg_dump |
| Transport | `transport` / `transport_staging` / `transport` | `TRANSPORT_DATABASE_URL`, `TRANSPORT_DB_*` | Drizzle; `transport-v1` catalogue | core `pgdata` | admin ready; pg_dump |
| Janitorial | `janitorial` / `janitorial_staging` / `janitorial` | `JANITORIAL_DATABASE_URL`, `JANITORIAL_DB_*` | Drizzle; `janitorial-v1` catalogue | core `pgdata` | admin ready; pg_dump |
| Payload CMS | `gms_cms` / `gms_cms_staging` / `gms_cms` | workspace `DATABASE_URL`; deploy `CMS_DATABASE_URL`, `CMS_DB_*`, stable `PAYLOAD_SECRET` | Payload committed migrations; explicit schema adoption | core `pgdata` | CMS ready + public content API; pg_dump |
| Core Redis / CAP queue | per environment | `REDIS_URL` | no schema migrations | preserve `REDIS_VOLUME`; AOF every second | PING; reconcile queue work with authoritative CAP outbox |
| SURFACE / GMS observations | existing `POSTGRES_DB`; inventory before rollout | SURFACE database config | Django migrations; explicit GMS reference catalogue | existing `surface/data/postgresql`; Timescale/PostGIS PG13 initially | Django checks + pg_dump with matching engine/extensions |
| SURFACE Redis / Celery | per weather host | SURFACE Redis config | none | verify queue durability on live host | PING; reconstruct tasks from authoritative state |
| SURFACE Memcached | per weather host | SURFACE cache config | none | disposable | cache reachability; no backup |
| wis2box Elasticsearch | separate weather project | wis2box configuration | supported upstream tooling | existing `es-data` | API/index checks; Elasticsearch snapshots, never copy live index files |
| wis2box MinIO | separate weather project | MinIO/wis2box configuration | supported upstream tooling | existing `minio-data` | object API; consistent object backup |
| wis2box authentication / configuration | separate weather project | `WIS2BOX_HOST_DATADIR` | metadata/config commands | `auth-data`, `mosquitto-config`, host data and SSH keys | publishing/auth checks; private off-host archives |
| wis2box monitoring | separate weather project | monitoring Compose configuration | upstream | `loki-data`, `prometheus-data`; external Grafana data volume | dashboards/metrics; snapshot required configuration |
| Sutron / edge collector | SQLite archive | collector CLI/config | collector schema | edge persistent archive and handoff files | collector tests; SQLite backup API and file archives |
| Uploaded files / weather images | environment-specific Spaces buckets | `STORAGE_*` | no database migration | immutable object keys plus local collector files | object retrieval + gallery; separate bucket backups |
| GEONETCast and GMS ingestion | mounted inputs / output stores | source-specific collector config | bounded collectors | preserve receiver inputs and generated outputs | source freshness and handoff checks; archive required files |
| Events / Salesbus | subsequent releases | dedicated URLs planned | separate Drizzle migrations planned | core PostgreSQL | independent release acceptance required |

Run `bash scripts/production/inventory.sh` on each host. It inspects configured stacks even when stopped and outputs only approved fields, database versions, extensions, migration history and catalogue markers. `--configured-only` does not require daemon access. Compare actual names and owners before rollout; this document does not prove live provisioning.

## Local initialization

From the host repository root run `pnpm storage:init`. It waits for the existing PostgreSQL service, provisions configured domain databases without rotating passwords or changing owners, runs the same migration implementations as deployment, initializes approved catalogues once, and verifies committed migration hashes. Host web commands and ports remain unchanged. Unmarked existing catalogue data fails for review; repeat seeds preserve edits. No synthetic operational records are generated.

Configure the CMS workspace's `.env.local` with `DATABASE_URL` targeting `gms_cms`, a stable `PAYLOAD_SECRET` of at least 32 characters, shared-auth URLs and cookie settings. `CMS_DB_NAME` overrides the expected name for an existing nonstandard database. Domain migration scripts similarly accept `<DOMAIN>_DB_NAME`; online jobs explicitly pass their existing names.

CMS schema-push adoption is an operator command. First apply the committed initial migration to a separate reference database using `CMS_DB_NAME` and `DATABASE_URL` targeting that isolated database. Then run `pnpm --filter @barrelsgd/web-cms db:adopt` against the existing CMS, with `CMS_BASELINE_REFERENCE_URL` pointing to the reference. Both schema dumps must match, the reference must contain exactly the initial migration, and the target must have no applied migration history. It records the baseline in a transaction and preserves content. PostgreSQL client tools are required; migration images include them. Stop schema-changing development processes during adoption. Any difference requires review, never automatic schema push or reset.

## Core delivery and Traefik

The promotion route remains `dev → staging → main → published release → production`; humans merge and publish. Core artifact tags include the environment (`staging-sha-<commit>` or `production-sha-<commit>`) so production builds cannot replace staging web images. Both pipelines build complete commit-matched image sets on GitHub-hosted runners. Deployment runs on `[self-hosted, staging|production, core]`. Never grant deployment runners to PR jobs. Production refs must be version tags reachable from `main`; staging uses the `staging` branch. Manual deployment selects that same ref and supplies `sha-<full commit SHA>`.

Deploy order: validate configuration, required off-host backup, resolve and record image digests, provision databases, serial FastAPI/admin/CMS migrations and catalogue checks, applications, readiness, external functional smoke. Failed migrations prevent new dependent applications from starting. No automatic schema rollback or database restoration occurs. Select an earlier schema-compatible release for application rollback. Core deployments and daily backups use `scripts/production/core.sh`, share `core-<environment>` workflow concurrency, and hold the same host flock through completion. Provision the lock file for the runner account; manual operations use the same entrypoint.

Core Traefik retains its existing certificate volume and ports 80/443. Configure `cms.<base-domain>` DNS alongside existing application subdomains. CMS routes internally to 3006; admin and CMS use `/api/ready` health checks. FastAPI uses `/api/v1/utils/ready/`. The dashboard and Adminer remain authenticated. PostgreSQL has no public core port mapping. Weather-to-core traffic requires a private interface binding plus source-restricted DigitalOcean firewall and PostgreSQL access rules; never add a public 5432 rule. Weather hosts need their own proxy/certificates and distinct SURFACE/wis2box Compose projects; validate existing routing before changing it.

Set the GitHub environment variable `CORE_REDIS_IMAGE` to a reviewed `redis:7-alpine@sha256:…` reference, alongside the reviewed PostgreSQL image. Required core GitHub secrets include existing auth/mail/database values plus `CMS_DB_PASSWORD`, `PAYLOAD_SECRET`, `DO_SPACES_ACCESS_KEY_ID`, `DO_SPACES_SECRET_ACCESS_KEY`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, and `DO_SPACES_ENDPOINT`. Configure separate staging/production backup buckets and object buckets. Runner prerequisites: Docker Compose, Python 3, Node 24, AWS CLI, private persistent volumes and GHCR access. Existing database names and volume bindings are authoritative. A fresh host needs operator-reviewed volume and empty database provisioning before the first required backup/deployment; never create replacement volumes automatically.

## Recovery acceptance

Target RPO 24 hours, RTO within the next day, retention 30 days. `backup-core.py` uploads all six authoritative core databases and writes a completion marker only after every upload is verified. It never restores onto production. Required file/object/SURFACE/wis2box/Sutron backups must also pass before infrastructure release acceptance; core database coverage alone is insufficient.

Download backups onto an isolated restore host. Start a compatible PostgreSQL container with a `grenmet-restore-` name and `grenmet.restore=true` label, then use `RESTORE_CONTAINER=... bash scripts/production/restore-core.sh <dump paths>`. It creates new isolated databases, restores with fatal errors, and leaves them for schema/record checks and migration-upgrade testing. Never label a production container as a restore container. Verify representative records, constraints, uploaded files and application behavior, then record timings and evidence.

Do not change the deployed PostgreSQL image to PostGIS until restored copies pass extension, migration and application checks against the selected pinned PostgreSQL 17/PostGIS image. SURFACE retains Timescale/PostGIS PG13; its engine upgrade is separate work.

## Release evidence still required

Record fresh/repeat initialization, upgrade of isolated restored copies, deliberate migration failure, wrong database rejection, CMS fresh/adoption/mismatch results, database unavailable/missing-schema readiness, Traefik DNS/TLS/routes, backup failure/age monitoring and the full isolated restore drill. Run staging deployment and collector-to-gallery verification on actual hosts. Missing infrastructure is unverified, not a passing check. Weather delivery tooling requires live staging acceptance before release. Persistent Events and Salesbus still require implementation and separate release acceptance.

## Staging inventory and first CMS rollout

Operator inventory on 2026-09-06 confirmed `grenmet-staging-01` has FastAPI and four domain databases, with no CMS database. Its PostgreSQL image is `postgres:17`, its data volume is `grenmet-staging_pgdata-staging`, and its API role `app` is a superuser. Preserve that image family and volume until an isolated restored copy validates a PostGIS transition. The existing worker's ARQ heartbeat passed; its inherited HTTP probe was incorrect. The corrected Compose worker probe uses ARQ and a per-container heartbeat.

The pre-provisioning backup checks actual database existence. Only the specifically configured CMS database may be absent for its first rollout, and only with GitHub environment variable `BOOTSTRAP_CMS=true` and no existing complete backup marker. Remove the variable after adoption; a missing CMS after a complete backup always blocks deployment. All other missing databases fail the gate. The five-database backup records this absence and does not replace the daily six-database freshness marker. After CMS provisioning and migration, a required complete backup must succeed before new applications start. Routine backups always require all six stores.

Deployment adds `FASTAPI_DB_USER=app_runtime` and the required GitHub environment secret `FASTAPI_DB_PASSWORD`. Retain the existing `POSTGRES_USER` and `POSTGRES_PASSWORD` as administrator/migration credentials; do not rename or demote the existing role during this rollout. Only API and worker services receive the runtime password. The database container runs the grant job; prestart retains the migration credentials. The job rejects elevated runtime roles, roles with memberships, and database/schema owners; it never rotates an existing password. It grants CRUD on application tables, sequence usage and schema usage within the FastAPI database. Default privileges cover future migration-owned objects. Runtime login and representative schema access must pass before applications start.

This role transition must pass on an isolated restored database and then staging. Application rollback can use the old image with the new runtime credentials if schema-compatible. Removing the administrator role, changing data ownership, and password rotation are separate operator-reviewed work. Do not change developer `.env.local` for this online-only role split.


## Weather and file recovery implementation

See [weather delivery and recovery](../../infra/weather/README.md) for operator JSON descriptors, private `.env.local` paths, external-volume adoption, immutable upstream images, source configuration, timer templates, and the isolated restore procedure. Weather, object and Sutron backup tools are implemented but require their configured hosts and successful real backup/restore runs before acceptance. Events and Salesbus remain outside this infrastructure release.

Local evidence on 2026-09-07: the host ran all three storage integration tests successfully, including CMS fresh/repeat migration, admin catalogue preservation/concurrency, and rejection of an elevated API runtime role. The role test exposed and now guards against psql's successful `\quit` exit; rejection paths use SQL exceptions with `ON_ERROR_STOP`. No application databases were replaced.

## Docker build review (2026-09-07)

Root and Dockerfile-specific ignore rules exclude nested dependencies, local package/Python caches, environment files, crawler state and backup artifacts. Web builds also exclude Bishop raw observations and local scratch/tooling directories. The cancelled CMS build sent 6.20 GB; 3.5 GB was a project-local pnpm cache and 2.7 GB was raw observations. The unused project-local cache was removed; observations and installed dependencies were preserved. Measure the next build context and final image sizes rather than treating these source sizes as image measurements.

All nine Node Dockerfiles copy every workspace manifest before frozen installation. Web and Hono runtime stages reuse their updated base layer. CMS/admin migration stages use installed dependencies and source without compiling Next.js; they run as the non-root node user. Their final stages copy app-scoped production dependency trees and migration assets from separate packaging stages. CMS additionally retains its shared TypeScript configuration, which Payload loads at runtime. Rebuild and measure these revised images; the prior host measurements were 351 MB for CMS and 2.8 GB for the unpruned migration image. Sentry credentials use BuildKit secret mounts; the admin email build placeholder exists only in its build command. Runtime secrets must be supplied separately.

Static validation covers merged core/SURFACE/wis2box Compose models and workflow YAML. Core API container health uses schema readiness; prestart disables the inherited HTTP healthcheck. Online data volumes remain external and private PostgreSQL binding is preserved. Existing Traefik HTTPS redirects, authenticated core dashboard, opt-in routing and persistent certificates remain in place. A read-only Docker socket mount still grants access to the Docker API: moving to a restricted socket proxy requires a separately verified routing change.

The retired production/staging Compose files and upstream SURFACE development Dockerfiles remain historical/local configurations; current release workflows use the aligned deployment files. Local ports remain unchanged for host/container development. Actual image builds, vulnerability results, Traefik DNS/TLS and restore drills are outstanding. Development tool images still contain moving tool versions; they are not production artifacts.

Core services rotate JSON logs at 10 MB with three files per container. Existing containers receive this setting when recreated by a reviewed deployment. Hono base-image updates now join the weekly Docker Dependabot review. These choices follow [Docker build guidance](https://docs.docker.com/build/building/best-practices/), [pnpm portable production packaging](https://pnpm.io/cli/deploy), and [Docker logging guidance](https://docs.docker.com/engine/logging/configure/).

### Verification on dev pushes

A push to `dev` runs CI and does not deploy. Web CI builds and starts all eight web runner images plus Hono, retries their HTTP health endpoints, and builds both migration targets with offline dependency import checks. Existing storage integration tests run fresh/repeated/concurrent migration and privilege scenarios against disposable PostgreSQL. These import checks do not replace running the migration images against a database. API CI builds the production image and imports the application; weather CI builds SURFACE, wxwatch and GMS ingest. GeoNetCast is local only and is excluded from image publishing and online collector delivery.

Staging deployment starts on a `staging` push after its pipeline gates pass. Production remains release-driven. Real staging readiness, application flows and backup/restore acceptance remain separate from image builds and basic health checks.
