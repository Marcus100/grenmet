# Barrels Grenada — Deployment Guide

> Current releases use `docker-compose.deploy.yml` and the canonical domain table
> at the end of this guide. The per-environment `docker-compose.prod.yml` and
> `docker-compose.staging.yml` files describe the retired prototype layout.

This monorepo uses GitHub Actions with self-hosted runners to deploy to staging and production.
Each environment runs on its own dedicated Digital Ocean droplet.

## Pipeline overview

Promotion follows `dev → staging → main → release`. Use pull requests for branch
promotion; the user merges them and publishes the release. See the
[release runbook](operations/release-runbook.md) for the full sequence.

- A push to `staging` runs `pipeline-staging.yml`: CI, applicable image builds,
  then deployment with the `staging` image tag.
- Merging to `main` does not build deployment images or deploy production.
- Publishing a release runs `pipeline-prod.yml`: builds all images at the release
  tag, then deploys that same tag for FastAPI, web apps, Hono, and migrations.
- A manual **Deploy** dispatch redeploys existing images; it does not build them.
  Supply an explicit image tag. The **Deploy to Production** entry point requires it.

Both environments use `infra/docker/docker-compose.deploy.yml`, layered with
`staging.env` or `production.env` and a temporary `.env.secrets` generated from
GitHub environment secrets. The workflow deletes that file during cleanup;
containers still receive their configured runtime secrets.

FastAPI publishes as `ghcr.io/marcus100/grenmet:<tag>`. Web apps and Hono use
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
| `SESSION_COOKIE_NAME`      | Session cookie name                   | `grenmet_session` (same in both)                               |
| `RESEND_API_KEY`           | Email sending via Resend              | From your resend.com dashboard                                 |
| `EMAIL`                    | Let's Encrypt registration email      | Your real email address                                        |
| `USERNAME`                 | Traefik + Adminer dashboard login     | e.g. `admin`                                                   |
| `HASHED_PASSWORD`          | Bcrypt hash of the dashboard password | See note below                                                 |
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

```
*.staging.barrels.gd  →  <staging droplet IP>   (A record, TTL 300)
```

**Production:**

```
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
   matrix contains nine targets, including the migration runner and Hono.
5. Verify the [configured app domains](#canonical-app-domains). New routes are
   available only after the environment has successfully deployed this configuration.

For a fresh droplet only, create the external volumes named by `PGDATA_VOLUME`,
`REDIS_VOLUME`, and `CERTS_VOLUME` in `staging.env` before the first deployment.
Existing droplets must retain their existing volumes. Compose deliberately fails
if a required external volume is missing instead of silently creating an empty database.

The deployment starts Postgres, ensures the configured databases exist, then
starts the remaining services with migrations enforced through dependencies.
It requires API liveness and the configured web/Hono container health checks to
pass. It also logs external web-root responses; those external checks are non-fatal.

Check database readiness and the user flows separately:

```bash
curl -fsS https://api.staging.barrels.gd/api/v1/utils/health-check/
curl -fsS https://api.staging.barrels.gd/api/v1/utils/ready/
curl -fsS https://hapi.staging.barrels.gd/health
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

## Troubleshooting

### Runner is offline

```bash
# On the server, as root:
cd /home/github/actions-runner
./svc.sh status
./svc.sh start
```

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
docker logs grenmet-staging-api-1 --tail 50
```

### A web app container keeps restarting

```bash
docker logs grenmet-staging-web-auth-1 --tail 50
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
"${compose[@]}" logs --tail 50 prestart web-migrate api
```

For production, use `production.env` and project `grenmet`. Check API liveness,
readiness, and every web/Hono container's health before considering the deploy
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
| Traefik dashboard | https://traefik.barrels.gd | https://traefik.staging.barrels.gd |

Adminer and the Traefik dashboard require the configured dashboard credentials.

## Canonical app domains

The active release pipelines use `docker-compose.deploy.yml` with
`production.env` or `staging.env`. This table describes repository configuration, not proof of a completed deployment.
The following routes replace the prototype
hurricane/spice hosts; no legacy redirects are installed.

| App | Local port | Production | Staging |
| --- | --- | --- | --- |
| Auth | 3000 | https://auth.barrels.gd | https://auth.staging.barrels.gd |
| GAA Admin | 3001 | https://admin.barrels.gd | https://admin.staging.barrels.gd |
| Docs | 3002 | https://docs.barrels.gd | https://docs.staging.barrels.gd |
| Weather | 3003 | https://weather.barrels.gd | https://weather.staging.barrels.gd |
| Signal | 3004 | https://signal.barrels.gd | https://signal.staging.barrels.gd |
| MBIA | 3005 | https://mbia.barrels.gd | https://mbia.staging.barrels.gd |
| Events | 3009 | https://events.barrels.gd | https://events.staging.barrels.gd |
| Hono | 4000 | https://hapi.barrels.gd | https://hapi.staging.barrels.gd |
| FastAPI | 8000 | https://api.barrels.gd | https://api.staging.barrels.gd |

Cloudflare wildcard A records point `*.barrels.gd` to `134.122.119.220` and
`*.staging.barrels.gd` to `167.71.24.42`. The DNS configuration supplied on 2026-09-06 uses DNS-only mode;
Traefik obtains host certificates through the existing ACME challenge.

Roll out staging first and verify every app health endpoint, login return URLs,
and API CORS. Promote through main and a new release after staging succeeds.
Renamed prototype containers can remain running as Compose orphans. Current
delivery does not automatically remove them; follow the retirement procedure
below to remove their old host routes after verifying ownership.
Database and uploaded-data volumes retain their existing names and contents.
Rollback uses the previous release's committed workflow and Compose definition:
select the previous release tag as both the workflow ref and image tag.

Signal subscriptions and MBIA contact delivery remain prototypes; MBIA flights
and Events records remain demo data. Hono exposes its health stub, not a completed
weather API. Hosting these apps does not complete those product workflows.


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
