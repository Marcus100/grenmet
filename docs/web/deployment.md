# Web App Deployment

The full deployment pipeline (GitHub Actions, self-hosted runners, Docker Compose,
staging vs production) is documented in [`docs/deployment.md`](../deployment.md).
This document covers web-app-specific details only.

## Docker images

Each web app builds its own Docker image. Image names follow this pattern:

```
ghcr.io/marcus100/grenmet-web-<app>:<tag>
```

| App | Image name |
|---|---|
| admin-gms | `grenmet-web-admin-gms` |
| auth | `grenmet-web-auth` |
| wxwatch | `grenmet-web-wxwatch` |
| hurricaneplan | `grenmet-web-hurricaneplan` |
| spicewx | `grenmet-web-spicewx` |
| wxproducts | `grenmet-web-wxproducts` |
| hr | `grenmet-web-hr` |
| salesbus | `grenmet-web-salesbus` |

Image names must be **lowercase** — CI will fail otherwise.

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
