# Barrels Grenada Platform Transition

**Status:** Proposed — not yet implemented
**Recorded:** 2026-07-18
**Owner:** Repository maintainers

## Goal

Turn the existing GrenMet monorepo into the Barrels Grenada platform while
retaining GrenMet/GMS as one product within that platform. The repository will
continue to contain all Barrels-operated websites, services, and shared
packages.

This document records future work only. It does not authorize a repository
rename, deployment, DNS change, infrastructure mutation, or removal of an
existing service.

## Canonical terminology

- Human organization and brand: **Barrels Grenada**.
- Technical slug, repository name, infrastructure prefix, and package owner:
  `barrelsgd`.
- Weather and meteorological-management product: **GrenMet** or **GMS**.
- GitHub repository target: `Marcus100/barrelsgd`.
- Workspace scope target: `@barrelsgd/*`.
- One monorepo remains the source of truth for current and future Barrels
  websites.

GrenMet is a product identity, not the owner of generic shared packages or
infrastructure. Intentional GrenMet identifiers that should remain are:

- GrenMet/GMS user-facing product copy.
- The future `@barrelsgd/grenmet` product package.
- Existing GMS `--gm-*` design tokens and assets.
- GMS-specific Figma integration.
- CAP identifiers beginning with `urn:grenmet:cap`.

All other uses of `grenmet` must be reviewed during implementation and either
renamed to `barrelsgd` or added explicitly to the intentional-remnant list.

## Governance gates for future implementation

The architecture in this document records the desired destination, but the
document is not approval to bypass repository gates while reaching it.

- Before introducing the proposed product packages, neutral token contracts,
  or another new pattern or abstraction, satisfy the Reasoning Gate: state the
  problem, why the current approach is insufficient, and the tradeoffs, then
  wait for explicit approval.
- Stop and ask before creating shared-package files, modifying any
  `tsconfig*.json` or protected root configuration, changing a Drizzle schema or
  creating a migration, or adding or changing a public FastAPI route or OpenAPI
  contract.
- Ask before touching any file that was not explicitly approved for the active
  implementation boundary. Approval of this execution plan is not blanket
  approval for every file it mentions.
- For a public API or OpenAPI change, update `docs/api/contracts.md`, regenerate
  `openapi.json` and the TypeScript client, and run `pnpm check:drift`.
- Before completing every implementation boundary, run `pnpm fix` followed by
  `pnpm type-check`, trace all consumers required by the Blast-Radius Gate, and
  run the relevant focused tests.

## Target applications and domains

| Application | Target package | Port | Production host |
| --- | --- | ---: | --- |
| Authentication | `@barrelsgd/web-auth` | 3000 | `auth.barrels.gd` |
| Barrels admin | `@barrelsgd/web-admin` | 3001 | `admin.barrels.gd` |
| Hurricane Plan | `@barrelsgd/web-hurricaneplan` | 3002 | `hurricane.barrels.gd` |
| Weather and GMS admin | `@barrelsgd/web-weather` | 3003 | `weather.barrels.gd`, later `weather.gd` |
| Signal | `@barrelsgd/web-signal` | 3004 | `signal.barrels.gd` |
| MBIA/GAA | `@barrelsgd/web-mbia` | 3005 | `mbia.barrels.gd`, later `gaa.gd` |
| Barrels corporate hub | `@barrelsgd/web-barrels` | 3006 | `barrels.gd` |
| FastAPI | Barrels API identity | Existing API port | `api.barrels.gd` |

Staging mirrors these applications beneath `*.staging.barrels.gd`. The hub is
served from `staging.barrels.gd`. Custom production domains such as
`weather.gd` and `gaa.gd` are never used for staging.

## Package and design-system boundaries

Rename all workspace packages from `@grenmet/*` to `@barrelsgd/*`.

The intended package responsibilities are:

- `@barrelsgd/ui` contains brand-neutral primitives and semantic design-token
  contracts.
- `@barrelsgd/theme` contains generic display-mode, layout, and preference
  infrastructure. It must not select GrenMet branding by default.
- `@barrelsgd/grenmet` contains GMS assets, `--gm-*` tokens, GrenMet theme
  presets, alert cards, and weather-product/status variants.
- `@barrelsgd/barrels` contains the supplied Barrels assets, typography,
  colors, favicons, and theme presets used by the hub, authentication app, and
  Barrels admin.

Product packages may depend on shared UI and theme packages. Shared packages
must not depend on either product package.

During the separation:

- Move the current GMS logo and weather-specific alert components out of the
  shared UI package and into `@barrelsgd/grenmet`.
- Replace GMS-specific classes in generic badges and alerts with semantic
  statuses such as success, warning, danger, and information.
- Keep compatible component props where practical.
- Put neutral base rules and semantic contracts in
  `@barrelsgd/ui/styles/base`.
- Put GMS mappings and `--gm-*` tokens in
  `@barrelsgd/grenmet/styles/foundation`.
- Put approved Barrels mappings in
  `@barrelsgd/barrels/styles/foundation`.
- Let Signal and MBIA retain their app-specific palettes while mapping those
  palettes to neutral UI semantics.
- Restrict GMS token and Figma checks to GrenMet consumers rather than applying
  them to every Barrels application.

The Barrels visual implementation is gated on receipt of the approved logo,
colors, typography, favicons, headline, company description, and contact copy.
Do not invent final brand values in their absence.

## Weather and GMS admin merger

Rename `apps/web/spicewx` to `apps/web/weather` and use the package name
`@barrelsgd/web-weather`.

Move all existing `admin-gms` functionality, database clients, migrations,
tests, and operational code into Weather. Public Weather pages remain at the
root. Existing GMS interfaces move beneath an authenticated `/admin` layout,
including:

- `/admin`
- `/admin/cap`
- `/admin/wxwatch`
- `/admin/wxproducts`
- `/admin/hr`
- `/admin/hr-setup`
- `/admin/roster`
- `/admin/calendar`
- `/admin/janitor`
- `/admin/transport`
- `/admin/bus`
- `/admin/salesbus`
- `/admin/users`
- `/admin/profile`

Handlers such as `/signin`, `/auth/*`, and required `/api/*` routes may remain
outside `/admin`. Remove the old `admin-gms` application only after every
callsite, migration, script, test, container, and deployment reference has
moved. The migration image becomes `barrelsgd-web-weather-migrate`.

### Weather host behavior

Before access to `weather.gd` is available, `weather.barrels.gd` serves both
the public Weather site and authenticated GMS administration.

After the custom domain is enabled:

- `weather.gd` is canonical for public Weather routes.
- Public requests to `weather.barrels.gd` permanently redirect with status
  `308` to the equivalent path and query on `weather.gd`.
- `/admin`, `/signin`, `/auth/*`, and private/internal API routes remain
  canonical on `weather.barrels.gd`.
- Requests for those private routes on `weather.gd` permanently redirect to
  the equivalent `weather.barrels.gd` URL.
- Validated environment configuration enables custom-domain mode without a
  further code change.
- Middleware must prevent redirect loops and preserve paths and queries.

## Barrels hub and administration

Create `apps/web/barrels` as a corporate holding page at `barrels.gd`.
Permanently redirect `www.barrels.gd` to `barrels.gd`. The page should use the
approved Barrels brand kit and copy once supplied.

Create `apps/web/admin` as a separate Barrels-wide control plane at
`admin.barrels.gd`:

- Require Barrels authentication.
- Show a minimal dashboard with launch/status cards for the hub, Weather,
  Hurricane Plan, Signal, MBIA, authentication, and API.
- Support optional operational links to GitHub Actions, Sentry, and the
  DigitalOcean project through validated `src/env.ts` configuration.
- Do not place GMS business modules in this application.
- Keep `/signin` as its own sign-in route.

For bookmarked GMS routes, permanently redirect known former module prefixes
on `admin.barrels.gd` to their equivalents beneath
`weather.barrels.gd/admin`. This includes `/cap`, `/hr`, `/wxwatch`,
`/wxproducts`, `/roster`, `/calendar`, `/janitor`, `/transport`, `/bus`,
`/salesbus`, `/users`, and `/profile`. The Barrels admin root and its new
control-plane routes remain local.

## Repository and platform rename

- Rename the root project to `barrelsgd-monorepo`.
- Update workspace package names, imports, Turbo filters, scripts, TypeScript
  references, test aliases, lockfile workspace entries, and documentation.
- Change the OpenAPI title to `Barrels Grenada API`.
- Change generic email and TOTP issuer wording to `Barrels Grenada`.
- Replace `grenmet_session` with `barrelsgd_session` and intentionally reset
  all sessions.
- Regenerate `openapi.json` before regenerating the TypeScript API client.
  Never edit generated client files manually.
- Rename the repository in place to `Marcus100/barrelsgd` and update local
  remotes only during the authorized external rollout.
- Review workflows and integrations for explicit references to the old
  repository. GitHub redirects normal web and Git traffic after a rename, but
  hosted Actions references to the previous `owner/repository` do not redirect.

The final case-insensitive `grenmet` scan must contain only documented product
identifiers.

## Images and deployment services

Build and publish these target images:

- `ghcr.io/marcus100/barrelsgd`
- `ghcr.io/marcus100/barrelsgd-web-auth`
- `ghcr.io/marcus100/barrelsgd-web-admin`
- `ghcr.io/marcus100/barrelsgd-web-hurricaneplan`
- `ghcr.io/marcus100/barrelsgd-web-weather`
- `ghcr.io/marcus100/barrelsgd-web-weather-migrate`
- `ghcr.io/marcus100/barrelsgd-web-signal`
- `ghcr.io/marcus100/barrelsgd-web-mbia`
- `ghcr.io/marcus100/barrelsgd-web-barrels`

Add every application to the Docker build matrix, Compose services, Traefik
routing, health checks, deployment smoke tests, Sentry configuration, and
release documentation. Every application must expose a lightweight
unauthenticated health endpoint.

Keep GitHub Environments named `staging` and `production`. Rename self-hosted
runner labels to `barrelsgd-staging` and `barrelsgd-production`. Rename
workflow names, concurrency groups, artifacts, images, and deployment paths.
Recheck repository secrets, environment secrets, branch protection, webhooks,
GHCR permissions, and Sentry integration after the repository rename.

## Fresh DigitalOcean infrastructure

Provision fresh resources in NYC3:

- Droplet and OS hostname `barrelsgd-staging`, Basic 4 GiB/2 vCPU.
- Droplet and OS hostname `barrelsgd-production`, Basic 4 GiB/2 vCPU.
- DigitalOcean project `barrelsgd`.
- VPC `barrelsgd-nyc3`.
- Firewall `barrelsgd-web`.
- Compose projects `barrelsgd-staging` and `barrelsgd-production`.
- New `barrelsgd-*` volumes, networks, containers, directories, and backup
  paths.

Do not copy old Docker volumes, databases, Redis data, sessions, certificates,
or filesystem state. Run migrations against empty databases and create one
initial owner through the approved bootstrap mechanism, with credentials
provided out of band.

Adminer remains restricted to staging. Operational Traefik dashboards retain
the existing access-control approach.

### Backups and observability

- Create a new private Spaces bucket, preferably
  `barrelsgd-backups-nyc3`, after confirming name availability.
- Store local dumps beneath `/var/backups/barrelsgd`.
- Produce encrypted daily production database dumps, upload them to Spaces,
  apply retention, and verify each upload.
- Run scheduled restore verification into an isolated temporary database.
- Enable weekly DigitalOcean backups for production only.
- Create the Sentry organization `barrelsgd` with per-application projects:
  `api`, `web-auth`, `web-admin`, `web-hurricaneplan`, `web-weather`,
  `web-signal`, `web-mbia`, and `web-barrels`.
- Use `staging` and `production` Sentry environments and separate DSNs stored
  as deployment secrets.
- Do not reuse the old GrenMet Sentry organization or projects.

## DNS map and rollout

Initial production records are:

- `barrels.gd` and `www.barrels.gd`
- `auth.barrels.gd`
- `admin.barrels.gd`
- `api.barrels.gd`
- `hurricane.barrels.gd`
- `weather.barrels.gd`
- `signal.barrels.gd`
- `mbia.barrels.gd`

Staging records are:

- `staging.barrels.gd`
- `auth.staging.barrels.gd`
- `admin.staging.barrels.gd`
- `api.staging.barrels.gd`
- `hurricane.staging.barrels.gd`
- `weather.staging.barrels.gd`
- `signal.staging.barrels.gd`
- `mbia.staging.barrels.gd`

The rollout order is:

1. Provision and secure fresh staging.
2. Deploy every image and initialize empty databases.
3. Complete staging functional, authentication, migration, backup, and restore
   verification.
4. Provision production and deploy without changing public DNS.
5. Lower applicable DNS TTLs.
6. Point `*.barrels.gd` records to the new production droplet.
7. Verify HTTPS, host routing, authentication, GMS redirects, health checks,
   Sentry, and backups.
8. Retire the old GrenMet infrastructure immediately after every acceptance
   check passes and the owner explicitly confirms destruction. This choice
   intentionally provides no extended infrastructure rollback window.
9. Add `weather.gd` later and enable its canonical-host behavior.
10. Add `gaa.gd` later, make it canonical, and permanently redirect
    `mbia.barrels.gd` to the equivalent GAA path.

## Reviewable implementation sequence

Repository agents must not create commits. The following are small review
boundaries that an authorized human may commit separately:

1. Document canonical terminology, domains, and intentional GrenMet remnants.
2. Rename the workspace scope and generic platform identifiers.
3. Add neutral UI and theme contracts without changing application appearance.
4. Extract the GrenMet product package and migrate GMS consumers.
5. Add the Barrels product package with placeholder-safe brand interfaces.
6. Rename SpiceWX to Weather.
7. Move GMS admin routes, tests, migrations, and data layers into Weather.
8. Add Weather host-aware routing and legacy admin redirects.
9. Remove the old `admin-gms` workspace.
10. Add the Barrels admin shell.
11. Add the Barrels corporate hub.
12. Containerize Signal, MBIA, Barrels Admin, and Barrels Hub.
13. Rename Docker, Compose, backup, Sentry, and workflow identities.
14. Regenerate OpenAPI and the API client.
15. Update operational documentation and run the final remnant audit.
16. Perform the separately authorized GitHub repository rename.
17. Provision and validate staging, then provision and cut over production.
18. Complete the `weather.gd` and `gaa.gd` cutovers independently when access
    is available.

Each boundary must preserve a runnable workspace, pass its focused checks, run
`pnpm fix` followed by `pnpm type-check`, and complete the Blast-Radius Gate
before continuing.

## Verification and acceptance

### Repository quality

- Run `pnpm fix` and `pnpm type-check`.
- Run package checks and tests for every changed workspace.
- Run the migrated Weather and GMS admin test suites.
- Run FastAPI pytest, lint, and mypy checks.
- Regenerate OpenAPI and the client, then run `pnpm check:drift`.
- Confirm generated client files were not manually edited.

### Routes and authentication

- Public Weather works on `weather.barrels.gd` before custom-domain mode.
- Every GMS `/admin` route requires authentication.
- Authentication retains the intended return URL.
- Former GMS paths on `admin.barrels.gd` redirect to Weather administration.
- The Barrels admin root remains a distinct protected dashboard.
- Custom-domain mode canonicalizes public and private Weather routes correctly,
  preserves paths and queries, and cannot form loops.
- `grenmet_session` no longer authenticates; `barrelsgd_session` does.

### Branding and package ownership

- Shared UI renders without a product package.
- Shared UI contains no GMS assets or concrete `--gm-*` values.
- Weather renders GMS styling through `@barrelsgd/grenmet`.
- Barrels applications consume `@barrelsgd/barrels`.
- Signal and MBIA retain their intended identities.
- No unauthorized `@grenmet`, `grenmet-*`, old image, cookie, runner, or
  Compose identifier remains.

### Deployment

- Build every target container independently.
- Validate staging and production Compose configurations.
- Verify health checks and Traefik routing for every staging host.
- Verify TLS, secure cookies, CORS, trusted hosts, and callback URLs.
- Verify a Sentry event from every service.
- Produce and successfully restore a production-format backup in staging.
- Complete production smoke tests before destroying old infrastructure.

## Assumptions and prerequisites

- `Marcus100` remains the GitHub repository owner.
- No existing users, application data, sessions, or database history require
  migration.
- DNS control for `barrels.gd` is available.
- Access to `weather.gd` and `gaa.gd` is a later prerequisite and does not block
  the first Barrels deployment.
- `admin.barrels.gd` is the Barrels-wide control plane. All current GMS
  administration belongs to Weather.
- `mbia.barrels.gd` is temporary and will redirect to `gaa.gd`.
- DNS changes, repository renames, secret creation, infrastructure provisioning,
  deployment, and resource deletion require separate explicit authorization.
