# Elections Grenada deployment

Elections Grenada is an independent Vercel project in the existing monorepo.
The Barrels holding page has its own Vercel project; operational apps retain the DigitalOcean/GitHub Actions release flow. The target
production domain is `elections.barrels.gd`; configuration alone does not establish
that a deployment or DNS cutover has succeeded.

## Project settings

| Setting | Value |
| --- | --- |
| Repository | `Marcus100/grenmet` |
| Project name | `elections-grenada` |
| Root directory | `apps/web/elections` |
| Framework | Next.js |
| Node.js | 24.x |
| Include source files outside the Root Directory | Enabled (shared workspace packages) |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output directory | Next.js default |

The app's `vercel.json` keeps build/install settings with its code. Enable
`ENABLE_EXPERIMENTAL_COREPACK=1` in both Preview and Production so Vercel honors
the root `package.json` package-manager pin instead of guessing from the lockfile.
Do not install a different pnpm major to make deployment pass.

Select the production branch deliberately when connecting Git. The repository's
existing promotion flow is `dev → staging → main`; use `main` for automatic
production deployment and other branches for previews. An explicitly authorized
manual production deployment can publish a reviewed commit before its promotion.
Vercel publishing is independent of the Docker release workflow.

## Sign in with the Barrels account

"Sign in" (ADR-0017) appears once these are set in the Vercel project for
Production (and Preview only if a staging API is reachable from previews):

| Variable | Value |
|---|---|
| `AUTH_API_URL` | `https://api.barrels.gd` |
| `AUTH_API_V1_STR` | `/api/v1` |
| `AUTH_APP_URL` | `https://auth.barrels.gd` |
| `ELECTIONS_SSO_CLIENT_SECRET` | 32+ characters; the same value as the production GitHub secret of that name, which the API reads |

The site keeps its own host-only `elections_session` cookie.

## Data and services

The app reads checked-in JSON and generated files. Commit `src/data/source/`,
`src/data/derived/`, `scripts/history/` and the public CSV exports together.
`pnpm build` checks data fingerprints before building. Production does not need
Python, a database, Redis, FastAPI, or the original research downloads.
See the [data editing guide](../../apps/web/elections/src/data/README.md).

Elections-only source changes do not select Docker image builds. Its package
manifest still selects the Node images because their install layers copy all
workspace manifests. Shared packages and lockfiles retain the existing checks.

## Error reporting

Use an Elections-specific Sentry project and DSN. There is no fallback to the
other apps' staging project. Configure these in Vercel's project settings:

| Variable | Purpose |
| --- | --- |
| `SENTRY_PROJECT` | Elections Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Build-time source-map upload credential, if enabled |
| `NEXT_PUBLIC_SENTRY_DSN` | Elections project's public ingestion DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` or `preview`, matching the target |

The Sentry organization is `grenmet`, matching the repository configuration.
Without a DSN the site can run but error reporting is not active. Do not copy
backend credentials or other apps' environment files into this project.

## Domain and verification

1. Build a preview and check `/`, `/2026`, `/results`, `/sources`, `/api/health`,
   `/atlas-data.json`, and a CSV download.
2. Add `elections.barrels.gd` to this Vercel project.
3. In the existing Cloudflare zone, add an explicit `elections` CNAME using the
   exact target Vercel supplies. Resolve conflicting records for this hostname;
   retain the existing wildcard, other application records and nameservers.
4. Wait for Vercel's domain and TLS verification, then verify the custom domain.
5. Record the deployed commit, preview/production URLs and verification result.

No changes to the DigitalOcean Compose services or release image inventory are
needed. Rollbacks use the Elections project's previous Vercel deployment.

References: [Vercel monorepos](https://vercel.com/docs/monorepos),
[Corepack build configuration](https://vercel.com/docs/builds/configure-a-build),
[custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
