# Web App Deployment

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-18

The full deployment pipeline (GitHub Actions, self-hosted runners, Docker Compose,
staging vs production) is documented in [`docs/deployment.md`](../deployment.md).
This document covers web-app-specific details only.

## Docker images

The build workflow publishes these images under `ghcr.io/marcus100/`:

| Target | Image name |
| --- | --- |
| Auth | `barrelsgd-web-auth` |
| GAA Admin | `barrelsgd-web-gaa-admin` |
| Docs | `barrelsgd-web-docs` |
| Weather (gms) | `barrelsgd-web-gms` |
| Signal | `barrelsgd-web-signal` |
| MBIA | `barrelsgd-web-mbia` |
| Events | `barrelsgd-web-events` |

FastAPI is built separately as `ghcr.io/marcus100/grenmet`. Staging uses tag
`staging`; production releases use the same release tag for every image,
with FastAPI prestart handling domain migrations and seeds. Both environments consume `docker-compose.deploy.yml`.

Signal, MBIA, and Events have Dockerfiles and container startup checks in
web CI. Their product features may still be prototypes; deployment support does
not imply live data or a completed integration. See the
[domain inventory and limitations](../deployment.md#canonical-app-domains).

The consolidated CAP/HR/wxwatch/wxproducts/salesbus modules ship inside the
GAA Admin image as path-prefixed routes, not separate images. Image names must
be lowercase.

## Environment variables at deploy time

Secrets are injected as environment variables via GitHub Actions → runner →
`docker compose`. Each app's required variables are listed in
[`docs/env.md`](../env.md). Never hardcode secrets in Dockerfiles or compose files.

## Build validation before promoting

Before opening a PR to `staging` or `main`:

```bash
pnpm fix          # Must pass with no changes
pnpm type-check   # Must pass with zero errors
pnpm build        # Must complete without errors
```
