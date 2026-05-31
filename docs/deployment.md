# GrenMet — Deployment Guide

This monorepo uses GitHub Actions with self-hosted runners to deploy to staging and production.
Each environment runs on its own dedicated Digital Ocean droplet.

## Pipeline overview

Every push to `staging` or `main` triggers this chain automatically:

```
Push to branch
  │
  ├─ CI (FastAPI)           lint, type-check, tests, docker build smoke test
  └─ CI — Web Apps          Biome, type-check, build all 8 Next.js apps
         │
         ├─ Build and Push Docker Images    → ghcr.io/marcus100/grenmet:<tag>
         └─ Build Web App Images            → ghcr.io/marcus100/grenmet-web-*:<tag>
                  │
                  └─ Deploy to Staging / Deploy to Production
                     (runs on your self-hosted runner, on the droplet)
```

- `staging` branch → deploys with tag `staging` to `*.staging.barrels.gd`
- `main` branch → deploys with tag `latest` to `*.barrels.gd`
- Publishing a GitHub Release → deploys with `latest` + version tag to production

The deploy workflow generates a `.env` file from GitHub Secrets on the runner, runs
`docker compose up -d`, then deletes the `.env` file. No secrets are stored on the server.

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

Baseline staging and production compose files:

```bash
docker compose -f infra/docker/docker-compose.staging.yml --profile tools up -d
docker compose -f infra/docker/docker-compose.prod.yml --profile tools up -d
```

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
| `SESSION_COOKIE_NAME`      | Session cookie name                   | `grenmet_session` (same in both)                               |
| `RESEND_API_KEY`           | Email sending via Resend              | From your resend.com dashboard                                 |
| `EMAIL`                    | Let's Encrypt registration email      | Your real email address                                        |
| `USERNAME`                 | Traefik + Adminer dashboard login     | e.g. `admin`                                                   |
| `HASHED_PASSWORD`          | Bcrypt hash of the dashboard password | See note below                                                 |
| `SENTRY_DSN`               | Error tracking (optional)             | From sentry.io, or leave empty string                          |

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
- Size: 4 GB RAM / 2 vCPU minimum (8 GB recommended — you're running 10 containers)
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
./config.sh --url https://github.com/mrcus100/grenmet --token YOUR_TOKEN_FROM_GITHUB
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

### 3.1 Commit and push to the staging branch

Make sure your local `dev` branch is clean and passing:

```bash
pnpm fix && pnpm type-check
```

Then merge to staging:

```bash
git checkout staging
git merge dev
git push origin staging
```

### 3.2 Watch the workflow chain on GitHub

Go to **Actions** tab. The workflows run in this order:

| Workflow                     | Runs on                         | Duration |
| ---------------------------- | ------------------------------- | -------- |
| CI (FastAPI)                 | GitHub-hosted                   | ~10 min  |
| CI — Web Apps                | GitHub-hosted                   | ~10 min  |
| Build and Push Docker Images | GitHub-hosted                   | ~5 min   |
| Build Web App Images         | GitHub-hosted (8 parallel jobs) | ~15 min  |
| Deploy to Staging            | Self-hosted `staging` runner    | ~5 min   |

Total: roughly 30–45 minutes end-to-end.

### 3.3 Verify

Once the deploy workflow completes:

```
https://api.staging.barrels.gd/api/v1/utils/health-check/   → {"status":"ok"}
https://auth.staging.barrels.gd/
https://adminer.staging.barrels.gd/                           → prompted for USERNAME/PASSWORD
```

On the server you can also inspect:

```bash
docker ps
docker compose -p grenmet-staging ps
docker compose -p grenmet-staging logs api --tail 50
```

---

## Part 4 — Deploy to production

### 4.1 Set up the production server

Repeat all of Part 2 on the production droplet, using label `production` for the runner.
Use the DNS records for `*.barrels.gd` (no `staging.` prefix).

### 4.2 Deploy

**Option A — Continuous deploy (merge to main):**

```bash
git checkout main
git merge staging
git push origin main
```

This deploys images tagged `latest`.

**Option B — Versioned release (recommended):**

1. Merge `staging` → `main` and push.
2. On GitHub → **Releases → Draft a new release**.
3. Tag: `v0.1.0`, target: `main`.
4. Click **Publish release**.

This tags the API image as both `latest` and `v0.1.0`, giving you a clear version history
and the ability to roll back by re-deploying a previous release tag.

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
what the workflow expects (case-sensitive). All 13 secrets must be present.

### Let's Encrypt / HTTPS not working

DNS must resolve before Traefik can obtain a certificate. Verify:

```bash
nslookup auth.staging.barrels.gd    # must return your droplet IP
```

Then check Traefik logs:

```bash
docker compose -p grenmet-staging logs proxy --tail 100
```

### API health check fails after deploy

Check the prestart (migrations) container first — it runs before the API:

```bash
docker compose -p grenmet-staging logs prestart --tail 50
docker compose -p grenmet-staging logs api --tail 50
```

### A web app container keeps restarting

```bash
docker compose -p grenmet-staging logs web-auth --tail 50
# Replace web-auth with the failing service name
```

Most likely cause: a required env var is missing from the compose file or GitHub secret.

### Rollback to previous version (production)

Find the previous image tag in GitHub → Packages, then trigger a manual workflow dispatch
from **Actions → Deploy to Production → Run workflow**, or re-deploy the previous release
by re-publishing it.

---

## Manual deploy (fallback — no CI)

If you need to deploy without GitHub Actions (e.g., runner is down), use the reference
env files in `infra/docker/`.

```bash
# On the server
cd /path/to/grenmet/infra/docker

# Copy the reference file and fill in real secrets
cp .env.staging .env
nano .env    # replace all "changethis" values

# Validate the compose config
docker compose --env-file .env -f docker-compose.staging.yml config

# Deploy
docker compose --env-file .env -f docker-compose.staging.yml -p grenmet-staging up -d

# Remove the env file when done — do not leave secrets on disk
rm .env
```

For production, use `.env.prod` and `docker-compose.prod.yml` with `-p grenmet`.

---

## URLs

### Staging (`*.staging.barrels.gd`)

| Service           | URL                                      |
| ----------------- | ---------------------------------------- |
| Auth (sign-in)    | `https://auth.staging.barrels.gd`        |
| Admin GMS         | `https://admin.staging.barrels.gd`       |
| WxWatch           | `https://wxwatch.staging.barrels.gd`     |
| Hurricane Plan    | `https://hurricane.staging.barrels.gd`   |
| Spice WX          | `https://spice.staging.barrels.gd`       |
| WxProducts        | `https://wxproducts.staging.barrels.gd`  |
| HR                | `https://hr.staging.barrels.gd`          |
| Salesbus          | `https://sales.staging.barrels.gd`       |
| FastAPI backend   | `https://api.staging.barrels.gd`         |
| API docs          | `https://api.staging.barrels.gd/swagger` |
| Adminer (DB UI)   | `https://adminer.staging.barrels.gd`     |
| Traefik dashboard | `https://traefik.staging.barrels.gd`     |

### Production (`*.barrels.gd`)

| Service           | URL                              |
| ----------------- | -------------------------------- |
| Auth (sign-in)    | `https://auth.barrels.gd`        |
| Admin GMS         | `https://admin.barrels.gd`       |
| WxWatch           | `https://wxwatch.barrels.gd`     |
| Hurricane Plan    | `https://hurricane.barrels.gd`   |
| Spice WX          | `https://spice.barrels.gd`       |
| WxProducts        | `https://wxproducts.barrels.gd`  |
| HR                | `https://hr.barrels.gd`          |
| Salesbus          | `https://sales.barrels.gd`       |
| FastAPI backend   | `https://api.barrels.gd`         |
| API docs          | `https://api.barrels.gd/swagger` |
| Adminer (DB UI)   | `https://adminer.barrels.gd`     |
| Traefik dashboard | `https://traefik.barrels.gd`     |
