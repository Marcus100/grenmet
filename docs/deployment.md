# Barrels Grenada — Deployment Guide

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-12

> Current releases use `docker-compose.deploy.yml` and the canonical domain table
> at the end of this guide. The per-environment `docker-compose.prod.yml` and
> `docker-compose.staging.yml` files describe the retired prototype layout.

This monorepo uses GitHub Actions with self-hosted runners to deploy to staging and production.
Each environment runs on its own dedicated Digital Ocean droplet. Elections Grenada
is the exception: it deploys independently to Vercel; see [its deployment guide](web/elections-deployment.md).

For operational SSH access, use the `deploy` account on production and `root` on
staging. Authenticate with the existing SSH key; DigitalOcean API authentication
through `doctl` does not unlock an encrypted SSH key.

## Pipeline overview

Promotion follows `dev → staging → main → release`. Use pull requests for branch
promotion; the user merges them and publishes the release. See the
[release runbook](operations/release-runbook.md) for the full sequence.

- A push to `staging` runs `pipeline-staging.yml`: CI, applicable image builds,
  then deployment with the `staging` image tag.
- Merging to `main` does not build deployment images or deploy production.
- Publishing a release runs `pipeline-prod.yml`: builds all images at the release
  tag, then deploys that same tag for FastAPI, web apps, and migrations.
- A manual **Deploy** dispatch redeploys existing images; it does not build them.
  Supply an explicit image tag. The **Deploy to Production** entry point requires it.

Both environments use `infra/docker/docker-compose.deploy.yml`, layered with
`staging.env` or `production.env` and a temporary `.env.secrets` generated from
GitHub environment secrets. The workflow deletes that file during cleanup;
containers still receive their configured runtime secrets.

FastAPI publishes as `ghcr.io/marcus100/grenmet:<tag>`. Web apps use
`ghcr.io/marcus100/barrelsgd-<app>:<tag>`; see the
[image inventory](web/deployment.md#docker-images).

---

## Local validation

Before promoting to staging, validate locally from the repo root:

```bash
pnpm start    # Start shared infra (Postgres, Adminer, Mailcatcher) + FastAPI
pnpm status   # Show container status
pnpm stop     # Stop all services
```

Local service endpoints:

- FastAPI Swagger: `http://localhost:8000/swagger`
- FastAPI ReDoc: `http://localhost:8000/redoc`
- FastAPI Scalar: `http://localhost:8000/scalar`
- Health check: `http://localhost:8000/api/v1/utils/health-check/`
- Adminer: `http://localhost:8080`
- MailCatcher: `http://localhost:1080`

Infrastructure compose files used locally:

- Shared infra: `infra/docker/docker-compose.yml`
- FastAPI: `apps/api/fastapi/docker-compose.yml`

Staging and production use the shared deployment Compose file, not the local
stack. For an operational fallback, use the [manual procedure](#manual-deploy-fallback--no-ci).

For API-specific steps (migrations, smoke checks), see [docs/api/deployment.md](api/deployment.md).

---

## Part 1 — GitHub setup (do once)

### 1.1 Create GitHub Environments

Go to your repo → **Settings → Environments → New environment**.

Create two environments, named exactly:

- `staging`
- `production`

For `production`, consider adding yourself as a **Required reviewer** under Protection rules
so that production deployments require manual approval before running.

### 1.2 Add secrets to each environment

Go into each environment and add the following secrets. Staging and production use the
**same secret names** but **different values**.

| Secret name                | What it is                            | Example / how to generate                                      |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `SECRET_KEY`               | FastAPI JWT signing key               | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `POSTGRES_USER`            | Postgres superuser name               | `app`                                                          |
| `POSTGRES_PASSWORD`        | Postgres superuser password           | Generate with the command above                                |
| `FIRST_SUPERUSER`          | Bootstrap admin email                 | `admin@weather.gd`                                             |
| `FIRST_SUPERUSER_PASSWORD` | Bootstrap admin password              | Strong random string                                           |
| `WXWATCH_DB_PASSWORD`      | wxwatch DB user password              | Generate with the command above                                |
| `WXPRODUCTS_DB_PASSWORD`   | wxproducts DB user password           | Generate with the command above                                |
| `JANITORIAL_DB_PASSWORD` | Janitorial database password | Generate a separate random value |
| `TRANSPORT_DB_PASSWORD` | Transport database password | Generate a separate random value |
| `GAA_ADMIN_SSO_CLIENT_SECRET` | GAA Admin single sign-on secret    | `openssl rand -base64 32` (different per environment and per app)   |
| `CAP_SSO_CLIENT_SECRET` | CAP warning desk single sign-on secret (`cap.${BASE_DOMAIN}/desk`; empty keeps its sign-in off, public alert pages unaffected) | `openssl rand -base64 32` (different per environment and per app) |
| `BARRELS_ADMIN_SSO_CLIENT_SECRET` | Barrels staff console single sign-on secret (empty keeps its sign-in off; superusers only) | `openssl rand -base64 32` (different per environment and per app) |
| `CMS_SSO_CLIENT_SECRET`    | CMS single sign-on secret             | `openssl rand -base64 32` (different per environment and per app)   |
| `GMSDASH_SSO_CLIENT_SECRET` | GMS Dashboard single sign-on secret (optional; empty keeps sign-in off) | `openssl rand -base64 32` (different per environment and per app) |
| `BOOKINGS_SSO_CLIENT_SECRET` | Bookings single sign-on secret (optional; empty keeps sign-in off; the API must register `bookings` first) | `openssl rand -base64 32` (different per environment and per app) |
| `EVENTS_SSO_CLIENT_SECRET` | Events single sign-on secret (optional) | `openssl rand -base64 32` (different per environment)        |
| `RESEND_API_KEY`           | Email sending via Resend              | From your resend.com dashboard                                 |
| `EMAIL`                    | Let's Encrypt registration email      | Your real email address                                        |
| `USERNAME`                 | Traefik dashboard login (SSH tunnel only) | e.g. `admin`                                               |
| `HASHED_PASSWORD`          | Bcrypt hash of the dashboard password | See note below                                                 |
| `STAGING_BASIC_AUTH_USERS` | **Staging only.** Basic-auth gate on every staging web host (not the API) | `htpasswd -nbB <user> '<password>'` lines, comma-separated |
| `ADMINER_BASIC_AUTH_USERS` | **Staging only.** Adminer login, separate from the dashboard's | `htpasswd -nbB <user> '<password>'` |
| `STAGING_PROBE_CREDENTIALS` | **Staging only.** `user:password` (plaintext) of one `STAGING_BASIC_AUTH_USERS` entry, used by the deploy smoke and the availability probe | e.g. `probe:<password>` |
| `SENTRY_DSN`               | Error tracking (optional)             | From sentry.io, or leave empty string                          |

The complete runtime and build-time inventory is in [docs/env.md](env.md).
Google login needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; object storage
needs the `STORAGE_*` inputs consumed by `deploy.yml`. Configure these when enabling
those integrations.

**Generating `HASHED_PASSWORD`:**

On Linux / macOS (or your staging server once set up):

```bash
docker run --rm httpd:2.4 htpasswd -nbB admin 'your-password-here' | cut -d: -f2
```

Save only the hash part (starting with `$2y$...`). The `USERNAME` secret holds the username
separately — the compose file combines them as `${USERNAME}:${HASHED_PASSWORD}`.

**Generating the staging basic-auth secrets** (`STAGING_BASIC_AUTH_USERS`,
`ADMINER_BASIC_AUTH_USERS`): store the whole `htpasswd -nbB` line, user included:

```bash
docker run --rm httpd:2.4 htpasswd -nbB reviewer 'your-password-here'
# reviewer:$2y$05$...
```

Several users go in one secret, comma-separated. Paste the hash exactly as printed:
do **not** double the `$` signs — `render-env.py` escapes them for Compose and
rejects anything that is not a bcrypt `htpasswd` line. Add a dedicated `probe` user
to `STAGING_BASIC_AUTH_USERS` and store its `probe:<password>` as
`STAGING_PROBE_CREDENTIALS`. Production must not have these secrets; the workflow
passes them only to staging.

> Note: `SECRET_KEY`, `POSTGRES_PASSWORD`, `WXWATCH_DB_PASSWORD`, `WXPRODUCTS_DB_PASSWORD`
> and `FIRST_SUPERUSER_PASSWORD` **must be different** between staging and production.

---

## Part 2 — Server setup (repeat for staging, then production)

Do this once per droplet. Staging and production are identical steps — just use different
runner labels (`staging` vs `production`).

### 2.1 Provision the droplet

**Recommended spec:**

- OS: Ubuntu 24.04 LTS
- Size: 4 GB RAM / 2 vCPU minimum (size for the enabled services and measured workload)
- Region: closest to your users
- Add your SSH key at creation time

### 2.2 Point DNS to the server

In your DNS provider, create records pointing to the droplet's IP.
A wildcard record is simplest if your provider supports it:

**Staging:**

```text
*.staging.barrels.gd  →  <staging droplet IP>   (A record, TTL 300)
```

**Production:**

```text
*.barrels.gd          →  <production droplet IP>  (A record, TTL 300)
```

If your DNS provider doesn't support wildcards, add individual A records for each subdomain.
See the [URLs section](#urls) at the bottom of this file for the full list.

Verify propagation before deploying (Let's Encrypt will fail if DNS isn't resolving):

```bash
nslookup api.staging.barrels.gd
nslookup auth.staging.barrels.gd
```

### 2.3 Install Docker

SSH into the droplet as root, then run:

```bash
curl -fsSL https://get.docker.com | sh
```

Verify:

```bash
docker --version        # Docker 26+
docker compose version  # Docker Compose v2.x
```

### 2.4 Create a dedicated runner user

Using a dedicated `github` user (rather than root) limits what the runner can access:

```bash
adduser github
usermod -aG docker github
```

### 2.5 Open firewall ports

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP (Traefik redirects to HTTPS)
ufw allow 443   # HTTPS
ufw enable
ufw status
```

### 2.6 Install the GitHub Actions self-hosted runner

On GitHub, go to **Settings → Actions → Runners → New self-hosted runner**.
Select **Linux / x64**. GitHub will show you the exact download URL and token for your repo.

Switch to the `github` user and follow the on-screen commands:

```bash
sudo su - github

mkdir actions-runner && cd actions-runner

# Download (use the URL GitHub shows you — do not copy this example verbatim)
curl -o actions-runner-linux-x64-2.x.x.tar.gz -L https://github.com/actions/runner/releases/...
tar xzf ./actions-runner-linux-x64-2.x.x.tar.gz

# Configure — when prompted for labels, enter the environment name exactly
./config.sh --url https://github.com/Marcus100/grenmet --token YOUR_TOKEN_FROM_GITHUB
# When asked: "Enter any additional labels (comma separated)"
# → type:  staging        (for the staging server)
# → type:  production     (for the production server)
```

Install as a system service so it restarts on reboot:

```bash
exit   # back to root

cd /home/github/actions-runner

./svc.sh install github   # run as the 'github' user
./svc.sh start
./svc.sh status           # should show: active (running)
```

Back on GitHub, refresh the **Settings → Actions → Runners** page.
The runner should appear as **Idle** (green dot). If it shows offline, check:

```bash
./svc.sh status
journalctl -u actions.runner.* -n 50
```

---

## Part 3 — First deploy to staging

1. Run `pnpm fix`, `pnpm type-check`, and the pre-merge checks on `dev`.
2. Push the reviewed changes and open a PR from `dev` to `staging`.
3. Wait for required checks, then merge the PR on GitHub.
4. Watch **Staging Pipeline**. Its CI jobs gate the applicable API/web image
   builds and deployment on the self-hosted `staging` runner. The web image
   matrix contains nine targets, including the CMS migration runner.
5. Verify the [configured app domains](#canonical-app-domains). New routes are
   available only after the environment has successfully deployed this configuration.

For a fresh droplet only, create the external volumes named by `PGDATA_VOLUME`,
`REDIS_VOLUME`, and `CERTS_VOLUME` in `staging.env` before the first deployment.
Existing droplets must retain their existing volumes. Compose deliberately fails
if a required external volume is missing instead of silently creating an empty database.

The deployment starts Postgres, ensures the configured databases exist, then
starts the remaining services with migrations enforced through dependencies.
It requires API liveness and the configured web container health checks to
pass. It also logs external web-root responses; those external checks are non-fatal.

Check database readiness and the user flows separately:

```bash
curl -fsS https://api.staging.barrels.gd/api/v1/utils/health-check/
curl -fsS https://api.staging.barrels.gd/api/v1/utils/ready/
```

Verify login, return URLs, and any data-backed pages you changed.

## Part 4 — Deploy to production

1. Open a PR from `staging` to `main`; wait for checks and merge on GitHub.
2. Go to **Releases → Draft a new release**.
3. Choose a new, increasing `vN.M` tag targeting `main` and publish the release.
4. Watch **Production Pipeline** build all images at that tag and deploy them.
5. Verify the production domains and API readiness as above.

The production runner needs label `production`, its own GitHub environment
secrets, and the external volumes named in `production.env`. Bootstrap those
volumes only on a fresh droplet; preserve existing data on an established server.

To retry an existing release, use **Actions → Deploy → Run workflow**, select
`environment=production`, and supply the existing release image tag. Select the
matching release as the workflow ref, especially when the Compose layout changed.
The **Deploy to Production** wrapper delegates to this same workflow.

---

### Adding a deployed service or a required secret

The service registry in `scripts/ci/release-scope.mjs` is the single list of
core services, split into data (`db`, `redis`), migration and app roles.
`core.sh` starts exactly those lists, so a service you add to
`docker-compose.deploy.yml` must also be added to the registry. CI enforces
this: `scripts/production/deploy-preflight.test.mjs` (part of
`pnpm test:delivery`) renders the staging and production Compose models with
synthetic secrets, with no real credentials, and fails when a service is
missing or unregistered, an app service has no healthcheck, or an image does not
map to the registry. Live credentials are still checked by `core.sh` on the
deployment host.

A new required secret goes in `REQUIRED_SECRETS` in
`scripts/production/render-env.py` and in the `deploy.yml` env block; the same
test fails if either is missing.

### Image pulls

The `pull-verify` phase pins every image by digest in `runtime/deploy.lock.yml`,
then pulls only images not already on the host, `PULL_PARALLEL` (default 4) at
a time. An image already present under that digest is byte-for-byte the one
wanted, so unchanged services cost no download.

### Rolling starts (no gap while containers are replaced)

By default the `start` phase recreates every app service, which stops each
service's only container before its replacement is healthy. Traefik then has no
backend, so every route returns 404 for up to the start period (seen on staging
run 37131928180).

Set the GitHub environment variable `ROLLING_DEPLOY` to `1` (or `true`) to start routed
services (`api` and every `web-*`, the `routed` role in
`scripts/ci/release-scope.mjs`) in parallel batches instead (`ROLLOUT_PARALLEL`,
default 4; `1` restores one at a time):

1. Start a second container from the new image beside the old one.
2. Wait until it is healthy. Traefik only routes to healthy containers.
3. Stop and remove the old container.

If the new container never becomes healthy, it is removed, the old one keeps
serving, and the deploy fails in the `start` phase. Workers and the proxy are
not rolled: they still start the ordinary way after the routed services.

A routed service whose running container is healthy and whose Compose config
hash (digest-pinned image, environment, labels) is unchanged is kept as it is.
Every service in a batch finishes before the next batch starts; after a failure
no later batch starts. Log lines are prefixed with the service name.

Stopped leftover containers of a routed service are removed before each
rolling start. If a deploy fails or is cancelled mid-rollout, the unfinished new
container is removed. Any other value of `ROLLING_DEPLOY` stops the deploy
before anything changes.

Constraints and known gaps:

- A routed service cannot publish host ports or set `container_name`, because
  two copies must run at once. The release-scope check rejects either.
- During the overlap, old and new code serve requests together against the
  already-migrated schema, so migrations must stay backward compatible
  (additive).
- Traefik drops a router whose containers disagree on its `traefik.*` labels.
  A release that changes a routed service's labels (router rule, extra hosts,
  port or healthcheck path) can still return 404 briefly while both containers
  run.
- The old container keeps receiving requests until it stops (up to 30
  seconds), so a few in-flight requests can fail with 502.
- Container numbers keep increasing (`api-2`, `api-3`, …). Read logs by service:
  `docker compose -p <project> logs api`.

Turn it on for `staging` first and confirm that the smoke checks and logs are
clean before you set it for `production`.

## Troubleshooting

### Runner is offline

```bash
# On the server, as root:
cd /home/github/actions-runner
./svc.sh status
./svc.sh start
```

### Reading a failed deploy

`core.sh deploy` prints each phase (render-config, auth, disk, pull-verify,
databases, migrations, grants, start, smoke) as a collapsible, timestamped log
group, and the job summary shows a duration table. On failure it prints an
`::error::` naming the failed and last completed phase, whether the previous
release should still be serving, and — once containers have changed — a
bounded (`DIAGNOSTIC_TIMEOUT`, default 30 s) report: every container's state,
exit code, restart count and OOM flag, plus the recent health-probe output and
last 200 log lines of each unhealthy, restarting or failed container. It never
prints full `docker inspect` output, which contains the environment. The final
`up` uses `--remove-orphans`, so containers of services removed from
`docker-compose.deploy.yml` are retired on the next deploy.

### Deploy fails — "no space left on device" or "Not enough free disk space"

The disk phase also requires 2 GB free in the runner's temp directory
(`RUNNER_MIN_FREE_GB`); a full runner disk failed staging on 2026-10-07 with
`No space left on device` while writing the step summary.

Each deploy pulls a full set of `sha-…` images and used to leave the old ones
behind, which filled the staging disk on 2026-10-11 (`failed to extract layer …
no space left on device`). `core.sh` now prunes unused images older than 72 hours
(`IMAGE_PRUNE_AGE`) before it pulls, then stops with `Not enough free disk space
to pull images` if less than 6 GB is free (`DEPLOY_MIN_FREE_GB`). That check runs
before anything is pulled or restarted, so the running stack is untouched.

If you still hit it, free space on the runner host and re-run the failed deploy:

```bash
df -h /
docker system df
docker image prune -a -f --filter "until=72h"   # never prune volumes: they hold data
gh run rerun <run-id> --failed
```

Images used by running containers are never removed. On 2026-10-11 this freed
about 26 GB on staging; Docker volumes were only 175 MB.

### Deploy fails — "secret not found" or blank value

Check that the secret name in **Settings → Environments → staging** exactly matches
what the workflow expects (case-sensitive). Compare the runtime inputs in `deploy.yml` with the environment inventory in [docs/env.md](env.md). Optional integrations require their own credentials when enabled.

### Let's Encrypt / HTTPS not working

DNS must resolve before Traefik can obtain a certificate. Verify:

```bash
nslookup auth.staging.barrels.gd    # must return your droplet IP
```

Then check Traefik logs:

```bash
docker logs grenmet-staging-proxy-1 --tail 100
```

### API health check fails after deploy

Check the prestart (migrations) container first — it runs before the API:

```bash
docker logs grenmet-staging-prestart-1 --tail 50
docker compose -p grenmet-staging logs api --tail 50
```

### A web app container keeps restarting

```bash
docker compose -p grenmet-staging logs web-auth --tail 50
# Replace web-auth with the failing service name
```

Most likely cause: a required env var is missing from the compose file or GitHub secret.

### Rollback to previous version (production)

Dispatch **Deploy** with `environment=production` and the previous release tag
as both the workflow ref and image tag. This keeps image names, Compose layout,
and code from the same release together. Do not republish an old release to retry it.
See the [release runbook](operations/release-runbook.md#rollback--redeploy).

Application rollback does not reverse database migrations or restore data.
Assess migration compatibility before reverting application code.

## Manual deploy (fallback — no CI)

Use a checkout of the release being deployed on the target server. Authenticate
Docker to GHCR with package-read access. In `infra/docker`, securely prepare a
mode-600 temporary `.env.secrets` using the **Write runtime secrets env** step in
[deploy.yml](../.github/workflows/deploy.yml) as the exact input inventory.
Include `TAG` and `WEB_TAG` set to the same existing image tag and the derived
module database URLs. Non-secret settings come from the committed environment file;
do not copy the retired `.env.staging` / `.env.prod` templates.

After preparing the secrets file, run this from Bash on the staging server:

```bash
cd /path/to/grenmet/infra/docker
set -euo pipefail
chmod 600 .env.secrets
trap 'rm -f .env.secrets' EXIT
compose=(docker compose --env-file staging.env --env-file .env.secrets
  -f docker-compose.deploy.yml -p grenmet-staging)
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait db
"${compose[@]}" exec -T db bash /docker-entrypoint-initdb.d/init-databases.sh
"${compose[@]}" pull
"${compose[@]}" up -d --pull always --remove-orphans
"${compose[@]}" ps
"${compose[@]}" logs --tail 50 prestart cms-migrate api
```

For production, use `production.env` and project `grenmet`. Check API liveness,
readiness, and every web container's health before considering the deploy
successful, following the health-check step in `deploy.yml`. Do not delete data volumes.

For routine diagnostics after workflow cleanup, use `docker ps` and
`docker logs <container-name>`; Compose commands need the same environment files
and project arguments as deployment.

---

## URLs

The app inventory is maintained once in the [canonical table](#canonical-app-domains).
Additional operational routes are:

| Service | Production | Staging |
| --- | --- | --- |
| API documentation | Disabled | https://api.staging.barrels.gd/swagger |
| Adminer | Disabled by profile | https://adminer.staging.barrels.gd |
| Traefik dashboard | SSH tunnel only (below) | SSH tunnel only (below) |

Adminer requires `ADMINER_BASIC_AUTH_USERS` credentials. Every other staging web
host requires `STAGING_BASIC_AUTH_USERS` credentials and answers with
`X-Robots-Tag: noindex, nofollow`; `api.staging` has only the noindex header,
because the browser apps call it cross-origin. Production has neither.

The Traefik dashboard has no public host. It listens on the droplet's loopback
interface only (`127.0.0.1:8080`, Traefik's internal `traefik` entrypoint) and
still asks for the `USERNAME`/`HASHED_PASSWORD` login:

```bash
ssh -L 8080:127.0.0.1:8080 <user>@<droplet>   # then open http://localhost:8080/dashboard/
```

## Canonical app domains

The active release pipelines use `docker-compose.deploy.yml` with
`production.env` or `staging.env`. This table describes repository configuration, not proof of a completed deployment.
The following routes replace the prototype
hurricane/spice hosts; no legacy redirects are installed.

| App | Local port | Production | Staging |
| --- | --- | --- | --- |
| Barrels homepage | Static | https://barrels.gd (Vercel; www redirects here) | Vercel preview deployments |
| Auth | 3000 | https://auth.barrels.gd | https://auth.staging.barrels.gd |
| Barrels admin (staff console) | 3012 | https://admin.barrels.gd | https://admin.staging.barrels.gd |
| GAA Admin (GMS/GAA portal) | 3001 | https://gms.barrels.gd | https://gms.staging.barrels.gd |
| Docs | 3002 | https://docs.barrels.gd | https://docs.staging.barrels.gd |
| Weather | 3003 | https://weather.barrels.gd | https://weather.staging.barrels.gd |
| Signal | 3004 | https://signal.barrels.gd | https://signal.staging.barrels.gd |
| MBIA | 3005 | https://mbia.barrels.gd | https://mbia.staging.barrels.gd |
| Events | 3009 | https://events.barrels.gd | https://events.staging.barrels.gd |
| CAP alert hub | 3010 | https://cap.barrels.gd | https://cap.staging.barrels.gd |
| GMS Dashboard | 3013 | https://gmsdash.barrels.gd | https://gmsdash.staging.barrels.gd |
| Bookings | 3015 | https://bookings.barrels.gd | https://bookings.staging.barrels.gd |
| Elections | 3007 | https://elections.barrels.gd (Vercel) | Vercel preview deployments |
| FastAPI | 8000 | https://api.barrels.gd | https://api.staging.barrels.gd |

Cloudflare wildcard A records point `*.barrels.gd` to the production droplet and
`*.staging.barrels.gd` to the staging droplet (IPs: see the DigitalOcean dashboard). The DNS configuration supplied on 2026-09-06 uses DNS-only mode;
Traefik obtains host certificates through the existing ACME challenge. Moving the
droplet hostnames behind Cloudflare's proxy is one planned change (issue #859):
see the [Cloudflare proxy runbook](operations/cloudflare-proxy.md).

Roll out staging first and verify every app health endpoint, login return URLs,
and API CORS. Promote through main and a new release after staging succeeds.
Renamed prototype containers can remain running as Compose orphans. Current
delivery does not automatically remove them; follow the retirement procedure
below to remove their old host routes after verifying ownership.
Database and uploaded-data volumes retain their existing names and contents.
Rollback uses the previous release's committed workflow and Compose definition:
select the previous release tag as both the workflow ref and image tag.

Signal subscriptions and MBIA contact delivery remain prototypes; MBIA flights
and Events records remain demo data. The Hono API (`hapi`) was retired on
2026-09-23 ([ADR-0015](adr/0015-retire-hono-python-backend.md)); remove its old
container and route with the retirement procedure below. Hosting these apps does not complete those product workflows.


## Admin host move

Owner decision 2026-10-21. `admin.*` becomes the Barrels staff / superuser
control plane (`apps/web/admin`, ADR-0039). The GMS/GAA staff portal
(`apps/web/gaa-admin`, Met office) moves to `gms.*`. This is the hostname only:
`apps/web/gms` is still the public weather site at `weather.*`. Hard switch, no
redirects (the portal is used only by the owner and internal staff in testing).
Compose service `web-admin` is the console and `web-gmsadmin` the portal; their
Traefik router/service labels are `web-barrels-admin` and `web-gms-portal`, names
no earlier container defined.

Staging is cut over first by the normal flow (dev, then `staging`); production
follows only when the same change is promoted to `main`, so do the production
checks below before promoting.

**Staging (owner):**

0. **Secret uniqueness pre-check.** `render-env.py` now refuses to render when two
   apps share one single sign-on secret (it fails closed with a message that names
   no values). Before the first deploy, and again before promoting to production,
   confirm every secret that is set is unique per app and per environment:
   `GAA_ADMIN`, `BARRELS_ADMIN`, `CMS`, `EVENTS`, `WEATHER`, `MBIA`, `SIGNAL`,
   `DOCS`, `ELECTIONS`, `GMSDASH` and `BOOKINGS` `_SSO_CLIENT_SECRET`. Regenerate
   any duplicates with `openssl rand -base64 32` (and update the matching app and
   API value together).
1. DNS: `*.staging.barrels.gd` already resolves everything to the staging VM, so
   `admin.staging` and `gms.staging` need no new record. Check in Cloudflare that
   the wildcard (or explicit A records) exists for both, DNS only like the other
   staging hosts. `gmsadmin.staging` is no longer served.
2. Create the GitHub `staging` environment secret `BARRELS_ADMIN_SSO_CLIENT_SECRET`
   (`openssl rand -base64 32`, at least 32 characters, different from every other
   app secret). Then, owner-only, edit `.github/workflows/deploy.yml` (this PR does
   not change it): in the render-env `env:` block next to
   `GAA_ADMIN_SSO_CLIENT_SECRET` (around line 117) add
   `BARRELS_ADMIN_SSO_CLIENT_SECRET: ${{ secrets.BARRELS_ADMIN_SSO_CLIENT_SECRET }}`.
   Console sign-in stays OFF until both the line and the secret exist.
3. Merge to `staging`; the pipeline builds the new image `barrelsgd-web-admin`
   and redeploys. Smoke: `https://gms.staging.barrels.gd/api/ready`,
   `https://admin.staging.barrels.gd/api/health`; sign in to each (console:
   superuser only). Everyone re-signs in once on `gms.staging` (session cookies
   are host-only).

**Before promoting to production:** repeat the secret uniqueness pre-check for
the `production` environment; create the `production` secret
`BARRELS_ADMIN_SSO_CLIENT_SECRET` and make sure the `deploy.yml` line above is
in place (console sign-in stays OFF until both exist); the `*.barrels.gd` wildcard covers `admin` and
`gms`, but check there is no explicit `gms.barrels.gd` or `admin.barrels.gd`
record pointing elsewhere (the retired public `gms.*` site: old links now reach
the portal sign-in). `gmsadmin.barrels.gd` stops being served.

**Deploy impact.** The portal is listed before the console in
`scripts/ci/release-scope.mjs`, so a rolling deploy starts the new portal
container, waited healthy, while the old `web-admin` (the former gaa-admin) still
serves `admin.*`, and only then replaces it with the console. With rolling on, no outage is expected. For roughly 5-35 seconds during the
replacement two routers share `Host(admin.<domain>)` (the old portal container and
the new console) and either app may answer; there is no security impact because
each app has its own cookies and sign-in gate. The first request to `gms.<domain>`
triggers certificate issuance, so the smoke check retries that host (4 attempts,
15 s apart) on a first deploy. If rolling is off or a
replacement fails, expect 1-3 minutes of 404s on the portal while it restarts;
deploy in a quiet window (only the owner and internal staff use production
today). A rollback has the same shape. `check-release-scope.mjs --compose` fails
if the console and portal share a host, and `render-env.py` rejects two apps
sharing one single sign-on secret. Notification emails already sent with
`admin.staging` (and, after promotion, production `admin.barrels.gd`) links now
land on the console sign-in page.

**Rollback.** Revert the change (compose, release scope and docs) and redeploy;
the portal returns to `admin.*`. No database or API schema change is involved, so
rollback loses no data. The rollback deploy needs the images of the reverted
commit to still exist: pull-verify requires each image revision to equal
`GITHUB_SHA`, so a revert is rebuilt by the pipeline like any other change.

## Legacy service retirement

`docker-compose.prod.yml` and `docker-compose.staging.yml` are retired prototype
layouts. Current releases use `docker-compose.deploy.yml`. Do not add retired
hurricane/spice domains to CORS merely because an old container still exists.

Run this read-only inventory from a checkout containing the inventory command
on the staging Docker host:

```bash
bash scripts/production/inventory.sh --services-only --project grenmet-staging
```

For production, use `--project grenmet`. The command compares container service
labels with the current Compose service inventory, includes stopped containers,
and reports unexpected services for review. It includes image IDs and available
registry digests, restart policy, selected routing labels, networks, and mounts with writable
flags. It excludes environment values and middleware credentials and performs
no database queries or Docker mutations. Missing registry digests remain empty;
a mutable tag is not a substitute for a retained recovery image.

An empty project report is not proof that another project or host is clean.
The report cannot establish traffic usage or whether container writable layers
contain unique data. Inspect those separately before retirement. Unknown
services are review findings, not automatic deletion candidates; tools and
one-off containers need their own ownership check.

Retirement sequence, staging before production:

1. Record host, project, container IDs, routing labels, image digests, mounts,
   and current external application checks. Confirm replacement routes work.
2. Review traffic and writable data for `web-hurricaneplan` and `web-spicewx`.
   Preserve any unique data and retain recovery images before stopping them.
3. Prepare an explicit list of container IDs and have the operator stop only
   those verified legacy containers. Record their restart policies and set
   `--restart=no` on only these containers so a Docker restart cannot revive
   them. Keep stopped containers through the next successful staging deployment
   so they can be restarted if retirement causes a problem.
4. Verify replacement routes and authentication, and confirm the old routers
   are gone. If checks fail, restore the recorded restart policies, restart the
   retained containers, and investigate.
5. Remove the verified stopped containers after acceptance. Preserve volumes
   and recovery records. Repeat the inventory to confirm no unintended changes.

No redirects are needed for the retired `hurricane.` and `spice.` hosts (owner decision, 2026-10-03); after retirement they return 404.

Do not use blanket `--remove-orphans` as the initial cleanup: it removes services
absent from the supplied Compose definition, including ones not reviewed for
retirement. Historical releases retain their own committed Compose definitions.

On September 8, 2026, operator-provided staging output showed both legacy
containers running alongside healthy current applications at commit
`979522b4e18eb8dba5b355a03d830b4d7098c677`. The operator confirmed project/service ownership, Traefik enabled and no
mounts for either legacy container. Filesystem diffs showed changes confined to
Next.js generated output and image caches. Both were stopped; external
readiness/page-content smoke passed afterward and both legacy staging hosts
returned HTTP 404 with `404 page not found`. The operator then confirmed both containers were `exited` with restart policy
`no`. Final container removal remains pending until the next successful
staging deployment. This is staging
evidence, not production state.

Retained recovery images:

- Hurricane: `ghcr.io/marcus100/grenmet-web-hurricaneplan@sha256:eba1e7732f398df4ba99168f288302863f1552cd16cb2b5620391169d1e2fada`
- Spice: `ghcr.io/marcus100/grenmet-web-spicewx@sha256:30b7e4c7ab7d36482cb6c673558963e5798fc94ee897816152ffb3f7a0d94a66`
