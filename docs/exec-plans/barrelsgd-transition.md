# Barrels Grenada Platform Transition

**Status:** Proposed — not yet implemented
**Recorded:** 2026-07-18
**Amended:** 2026-07-25
**Owner:** Repository maintainers

This document describes the destination architecture. The execution order,
baseline freeze, commit boundaries, and rollout sequencing live in
[Barrels Grenada Migration Plan](barrelsgd-migration-plan.md).

## Goal

Turn the existing repository into the primary Barrels Grenada software
monorepo while retaining GrenMet as the main digital product built for the
Grenada Meteorological Service (GMS). Barrels Grenada begins with products and
client software relevant to Grenada, with a longer-term market across the OECS,
CARICOM, and other companies.

This document records future work only. It does not authorize a repository
rename, deployment, DNS change, infrastructure mutation, or removal of an
existing service.

## Why

The current repository, package scope, and infrastructure names make the
GrenMet product appear to own software that now belongs to the wider Barrels
portfolio. The transition must establish company ownership without erasing
GrenMet or conflating it with the institution it serves.

## Scope

This plan covers company and product naming, repository and package ownership,
GrenMet consolidation, shared platform services, application deployment,
domains, and fresh infrastructure. It does not build Events/Tickets or the
future reusable HR product, decide software licensing or client ownership, or
activate custom domains before access is available.

## Canonical terminology

- Software company and umbrella brand: **Barrels Grenada**.
- Technical slug, repository name, infrastructure prefix, and package owner:
  `barrelsgd`.
- Meteorological institution served by GrenMet: **Grenada Meteorological
  Service (GMS)**.
- GMS digital portal developed within the Barrels portfolio: **GrenMet**.
- Public GrenMet surface: the GMS website at `weather.gd`.
- Internal GrenMet surface: the authenticated **GMS Dashboard**.
- GitHub repository target: `Marcus100/barrelsgd`.
- Workspace scope target: `@barrelsgd/*`.
- This monorepo is the default home for Barrels-operated products and closely
  related client applications. Use another repository when ownership,
  confidentiality, deployment, or team independence requires it.

GrenMet is a product identity, not the owner of generic shared packages or
infrastructure. Intentional GrenMet identifiers that should remain include:

- GrenMet product names and GMS user-facing copy.
- Product-explicit technical names such as `@barrelsgd/web-grenmet` and
  `@barrelsgd/grenmet`.
- Existing GMS `--gm-*` design tokens and assets.
- GMS-specific Figma integration.
- GMS product codes and CAP identifiers beginning with `urn:grenmet:cap`.
- GrenMet capabilities and module names such as CAP and WxWatch.

Every use of `grenmet` must be classified during implementation. Preserve it
when it identifies the GrenMet product; replace it when it incorrectly claims
ownership of company-wide infrastructure or unrelated Barrels products.

The same classification rule applies to the Python and ops workspaces
(`apps/api/fastapi`, `scripts/scrapy-wxwatch`, `scripts/sutron-collector`,
`scripts/wis2-setup`, `geonetcast`, `notebooks`). Rename identifiers that claim
company or infrastructure ownership; keep capability names such as WxWatch and
CAP, and keep GMS domain terminology. The vendored `surface/` and `wis2box/`
trees are not renamed — see [VENDORED.md](../../VENDORED.md) — because renaming
them increases divergence from upstream without establishing any ownership.

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
| GrenMet public site and GMS Dashboard | `@barrelsgd/web-grenmet` | 3003 | `weather.barrels.gd`, later `weather.gd` |
| Signal | `@barrelsgd/web-signal` | 3004 | `signal.barrels.gd` |
| MBIA public airport site | `@barrelsgd/web-mbia` | 3005 | `mbia.barrels.gd` until a dedicated domain is chosen |
| Barrels corporate hub | `@barrelsgd/web-barrels` | 3006 | `barrels.gd` |
| GAA corporate site | `@barrelsgd/web-gaa` | 3007 | `gaa.barrels.gd`, later `gaa.gd` |
| FastAPI | Barrels API identity | Existing API port | `api.barrels.gd` |

The existing Hurricane Plan app remains transitional on port 3002 only until
its content and workflows are accepted within GrenMet SOPs.

Two further identities are reserved but not built, so the port map, image list,
and DNS map never need re-cutting:

| Application | Package | Port | Host | Image |
| --- | --- | ---: | --- | --- |
| Barrels Shop (ecommerce) | `@barrelsgd/web-shop` | 3008 | `shop.barrels.gd` | `ghcr.io/marcus100/barrelsgd-web-shop` |
| Weather-data proxy | `@barrelsgd/api-hono` | 4000 | `proxy.barrels.gd` | `ghcr.io/marcus100/barrelsgd-api-hono` |

Neither is built during this transition. Reserving an identity creates no DNS
record, Compose service, Traefik route, image build, or Sentry project.
`apps/api/honoapi` currently serves only `GET /health` and is consumed by no
application; it receives the workspace scope rename and nothing else.

Staging mirrors these applications beneath `*.staging.barrels.gd`. The hub is
served from `staging.barrels.gd`. Custom production domains such as
`weather.gd` and `gaa.gd` are never used for staging.

## Package and design-system boundaries

Use the company-owned `@barrelsgd/*` scope for packages published from this
monorepo. Company scope does not replace product identity: application and
domain package names must identify their product explicitly, such as
`@barrelsgd/web-grenmet`, `@barrelsgd/web-signal`, and
`@barrelsgd/web-mbia`.

The intended package responsibilities are:

- `@barrelsgd/ui` contains brand-neutral primitives and semantic design-token
  contracts.
- `@barrelsgd/theme` contains generic display-mode, layout, and preference
  infrastructure. It must not select GrenMet branding by default.
- `@barrelsgd/grenmet` contains GMS assets, `--gm-*` tokens, GrenMet theme
  presets, alert cards, and weather-product/status variants.
- `@barrelsgd/barrels` contains the supplied Barrels assets, typography,
  colors, favicons, and theme presets used by the hub, Barrels admin, and the
  authentication service's default shell. Initiating-product context selects

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

## GrenMet portal consolidation

Rename `apps/web/spicewx` to `apps/web/grenmet` and use the package name
`@barrelsgd/web-grenmet`. GrenMet encompasses both the public GMS website and
the authenticated GMS Dashboard; it is not merely a weather page.

Move the existing `admin-gms` functionality, database clients, migrations,
tests, and operational code into the GMS Dashboard. Core GrenMet capabilities
include public forecasts, CAP warnings, WxWatch automation, meteorological
operations, published SOPs, and the internal forecaster workspace.

Existing organization-wide modules remain available during the transition:

- HR, roster, calendar, transport, janitorial, users, and related modules stay
  in the GMS Dashboard until equivalent reusable Barrels products exist.
- The future Barrels HR product is a single multi-tenant product, not one
  deployment per business. GMS, MBIA, GAA, and future clients are organizations
  within one codebase and deployment, with data scoped by tenant. Extraction must
  preserve GMS workflows before the old modules are retired.
- WxProducts is a retiring capability. Preserve required behavior and data
  during consolidation, but do not establish it as a permanent GrenMet
  boundary without a separate decision.
- Move the standalone Hurricane Plan content and workflows into GrenMet SOPs.
  Published SOPs use `/sops`; editing and operational controls remain
  authenticated.

The consolidated route set includes:

- `/admin`
- `/admin/cap`
- `/admin/wxwatch`
- `/admin/wxproducts` during its retirement period
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
- `/sops` for published GMS SOPs

Handlers such as `/signin`, `/auth/*`, and required `/api/*` routes may remain
outside `/admin`. Remove the old `admin-gms` and Hurricane Plan applications
only after every callsite, migration, script, test, container, route, and
deployment reference has moved and redirects are verified. The migration
image becomes `barrelsgd-web-grenmet-migrate`.

### GrenMet host behavior

Before access to `weather.gd` is available, `weather.barrels.gd` serves the
public GMS site, `/sops`, and the authenticated GMS Dashboard.

After the custom domain is enabled:

- `weather.gd` is canonical for public GrenMet routes and published SOPs at
  `weather.gd/sops`.
- Public requests to `weather.barrels.gd` permanently redirect with status
  `308` to the equivalent path and query on `weather.gd`.
- `/admin`, `/signin`, `/auth/*`, and private/internal API routes remain
  canonical on `weather.barrels.gd`.
- Protected SOP editing remains part of the GMS Dashboard even though published
  SOPs are available on `weather.gd/sops`.
- Requests for private routes on `weather.gd` permanently redirect to the
  equivalent `weather.barrels.gd` URL.
- The former standalone Hurricane Plan URL permanently redirects to `/sops`
  after the SOP migration is accepted.
- Validated environment configuration enables custom-domain mode without a
  further code change.
- Middleware must prevent redirect loops and preserve paths and queries.

## Barrels hub and administration

Create `apps/web/barrels` as the company site at `barrels.gd`. Permanently
redirect `www.barrels.gd` to `barrels.gd`. The page should use the approved
Barrels brand kit and copy once supplied.

Create `apps/web/admin` as a separate Barrels-wide control plane at
`admin.barrels.gd`:

- Require Barrels authentication.
- Show a minimal dashboard with launch/status cards for the hub, GrenMet,
  Signal, MBIA, GAA, authentication, and API.
- Add Events/Tickets and HR cards only when those products are deployed.
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

## Out-of-scope follow-ups

- Begin Barrels Events and Barrels Tickets as one future product with event
  discovery and ticketing modules. Split them only if branding or operations
  materially diverge. They are not part of this infrastructure migration.
- Build reusable Barrels HR as a future product. GMS becomes a customer or
  tenant only after the replacement covers its current HR and roster workflows.
- Treat Grenada Signal as a separate Barrels media product, not a GrenMet
  module.
- Keep the MBIA passenger website and GAA corporate website distinct while
  sharing airport data, administration, and platform services where useful.
- Add future Grenada-focused products according to evidence, operating
  capacity, and customer demand; expand to OECS and CARICOM markets without
  forcing unrelated products into GrenMet.

## Repository and platform rename

- Rename the root project to `barrelsgd-monorepo`.
- Update company-owned workspace scopes to `@barrelsgd/*`, while retaining
  product-explicit names such as `web-grenmet`, `web-signal`, `web-mbia`, and
  `web-gaa`.
- Update imports, Turbo filters, scripts, TypeScript references, test aliases,
  lockfile workspace entries, and documentation atomically.
- Change the shared OpenAPI title to `Barrels Grenada API` while keeping
  GrenMet-specific route and schema terminology where it represents GMS.
- Make shared authentication product-aware: each application supplies its
  display name, email branding, sign-in presentation, roles, and access policy.
  Use Barrels branding only for Barrels company surfaces.
- Replace `grenmet_session` with the company-owned technical cookie
  `barrelsgd_session` and intentionally reset all sessions.
- Regenerate `openapi.json` before regenerating the TypeScript API client.
  Never edit generated client files manually.
- Rename the repository in place to `Marcus100/barrelsgd` and update local
  remotes only during the authorized external rollout.
- Review workflows and integrations for explicit references to the old
  repository. GitHub redirects normal web and Git traffic after a rename, but
  hosted Actions references to the previous `owner/repository` do not redirect.

The final case-insensitive `grenmet` scan is a classification audit, not a
deletion target. Every remaining occurrence must identify the GrenMet product
or GMS domain intentionally.

## Images and deployment services

Build and publish these target images:

- `ghcr.io/marcus100/barrelsgd`
- `ghcr.io/marcus100/barrelsgd-web-auth`
- `ghcr.io/marcus100/barrelsgd-web-admin`
- `ghcr.io/marcus100/barrelsgd-web-grenmet`
- `ghcr.io/marcus100/barrelsgd-web-grenmet-migrate`
- `ghcr.io/marcus100/barrelsgd-web-signal`
- `ghcr.io/marcus100/barrelsgd-web-mbia`
- `ghcr.io/marcus100/barrelsgd-web-gaa`
- `ghcr.io/marcus100/barrelsgd-web-barrels`

Retain the existing Hurricane Plan image only during its migration into
GrenMet SOPs; it is not part of the final image set.

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

### Meteorological ops stacks are out of the platform estate

SURFACE and wis2box run on their own host with their own lifecycle and Compose
stacks, and are not folded into the Barrels application topology. They are
upstream WMO and CDMS software on independent release cycles, and SURFACE carries
a live TimescaleDB. Integration with the platform happens at the data layer,
through FastAPI, and nowhere else.

Barrels ownership applies to their DigitalOcean project, backups, and monitoring
— not to their container names, Compose projects, or deployment pipeline. The
legacy-infrastructure retirement step must not reach this host.

### Backups and observability

- Create a new private Spaces bucket, preferably
  `barrelsgd-backups-nyc3`, after confirming name availability.
- Store local dumps beneath `/var/backups/barrelsgd`.
- Produce encrypted daily production database dumps, upload them to Spaces,
  apply retention, and verify each upload.
- Run scheduled restore verification into an isolated temporary database.
- Enable weekly DigitalOcean backups for production only.
- Create the Sentry organization `barrelsgd` with per-application projects:
  `api`, `web-auth`, `web-admin`, `web-grenmet`, `web-signal`, `web-mbia`,
  `web-gaa`, and `web-barrels`.
- Keep the Hurricane Plan project only through its SOP migration.
- Use `staging` and `production` Sentry environments and separate DSNs stored
  as deployment secrets.
- Do not reuse the old infrastructure-level GrenMet Sentry organization or
  projects; GrenMet remains a product name within the Barrels organization.

## DNS map and rollout

Initial production records are:

- `barrels.gd` and `www.barrels.gd`
- `auth.barrels.gd`
- `admin.barrels.gd`
- `api.barrels.gd`
- `weather.barrels.gd`
- `hurricane.barrels.gd` as a redirect-only hostname after SOP migration
- `signal.barrels.gd`
- `mbia.barrels.gd`
- `gaa.barrels.gd`

Staging records are:

- `staging.barrels.gd`
- `auth.staging.barrels.gd`
- `admin.staging.barrels.gd`
- `api.staging.barrels.gd`
- `weather.staging.barrels.gd`
- `hurricane.staging.barrels.gd` until SOP redirect verification is complete
- `signal.staging.barrels.gd`
- `mbia.staging.barrels.gd`
- `gaa.staging.barrels.gd`

The rollout order is:

1. Provision and secure fresh staging.
2. Deploy every target image and initialize empty databases.
3. Complete staging functional, authentication, migration, backup, and restore
   verification.
4. Complete the Hurricane Plan to GrenMet SOP migration, then retain the old
   hostname, TLS certificate, and lightweight permanent redirect until its
   approved redirect-retention period ends.
5. Provision production and deploy without changing public DNS.
6. Lower applicable DNS TTLs.
7. Point `*.barrels.gd` records to the new production droplet.
8. Verify HTTPS, host routing, product-branded authentication, GMS redirects,
   health checks, Sentry, and backups.
9. Retire the legacy infrastructure resources named for GrenMet immediately
   after every acceptance check passes and the owner explicitly confirms
   destruction. The GrenMet product itself continues.
10. Add `weather.gd` later and enable its canonical-host behavior.
11. Add `gaa.gd` later, make it canonical for the GAA corporate site, and
    permanently redirect `gaa.barrels.gd` to it.
12. Keep MBIA as a distinct passenger website; never redirect it to GAA merely
    because the corporate domain becomes available.

## Reviewable implementation sequence

Repository agents must not create commits. The following are small review
boundaries that an authorized human may commit separately:

1. [x] Correct canonical company, product, institution, and domain terminology.
2. [ ] Rename company-owned workspace scopes and generic platform identifiers while
   retaining product-explicit package names.
3. [ ] Add neutral UI and theme contracts without changing application appearance.
4. [ ] Extract the GrenMet product package and migrate GMS consumers.
5. [ ] Add the Barrels product package with placeholder-safe brand interfaces.
6. [ ] Rename SpiceWX to GrenMet.
7. [ ] Move GMS admin routes, tests, migrations, and data layers into the GMS
   Dashboard.
8. [ ] Move Hurricane Plan content and workflows into GrenMet SOPs, then add
   permanent redirects.
9. [ ] Audit WxProducts consumers and create a separate retirement boundary.
10. [ ] Remove the old `admin-gms` and Hurricane Plan workspaces only after their
    replacements pass acceptance checks.
11. [ ] Add the Barrels admin shell and corporate hub.
12. [ ] Separate GAA from the MBIA passenger site and containerize both.
13. [ ] Containerize Signal and every remaining target application.
14. [ ] Make shared authentication product-aware.
15. [ ] Rename Docker, Compose, backup, Sentry, and workflow identities.
16. [ ] Regenerate OpenAPI and the API client where contracts change.
17. [ ] Update operational documentation and run the classified remnant audit.
18. [ ] Perform the separately authorized GitHub repository rename.
19. [ ] Provision and validate staging, then provision and cut over production.
20. [ ] Complete the `weather.gd` and `gaa.gd` cutovers independently when access
    is available.
21. [ ] Plan Events/Tickets and reusable HR as later product initiatives, not as
    hidden additions to this transition.

Each boundary must preserve a runnable workspace, pass its focused checks, run
`pnpm fix` followed by `pnpm type-check`, and complete the Blast-Radius Gate
before continuing.

## Verification and acceptance

### Repository quality

- Run `pnpm fix` and `pnpm type-check`.
- Run package checks and tests for every changed workspace.
- Run the migrated GrenMet and GMS Dashboard test suites.
- Run FastAPI pytest, lint, and mypy checks.
- Regenerate OpenAPI and the client, then run `pnpm check:drift`.
- Confirm generated client files were not manually edited.

### Routes and authentication

- Public GrenMet works on `weather.barrels.gd` before custom-domain mode.
- Every GMS Dashboard `/admin` route requires authentication.
- Published SOPs resolve at `/sops`; protected editing remains authenticated.
- The former Hurricane Plan URL redirects permanently to GrenMet SOPs after
  migration.
- Authentication retains the intended return URL and presents the calling
  product's branding and roles.
- Former GMS paths on `admin.barrels.gd` redirect to the GMS Dashboard.
- The Barrels admin root remains a distinct protected dashboard.
- Custom-domain mode canonicalizes public and private GrenMet routes correctly,
  preserves paths and queries, and cannot form loops.
- MBIA and GAA remain separately routable websites.
- `grenmet_session` no longer authenticates; `barrelsgd_session` does.

### Branding and package ownership

- Shared UI renders without a product package.
- Shared UI contains no GMS assets or concrete `--gm-*` values.
- GrenMet renders GMS styling through `@barrelsgd/grenmet`.
- Barrels company surfaces consume `@barrelsgd/barrels`.
- Signal, MBIA, and GAA retain their intended identities.
- No company-wide package remains under `@grenmet/*`; GrenMet remains explicit
  in the names of product-specific packages, modules, assets, and copy.
- The final remnant audit distinguishes intentional product identity from stale
  infrastructure ownership.

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
- Barrels Grenada is the software company responsible for this repository;
- No existing users, application data, sessions, or database history require
  migration.
- DNS control for `barrels.gd` is available.
- Access to `weather.gd` and `gaa.gd` is a later prerequisite and does not block
  the first Barrels deployment.
- `admin.barrels.gd` is the Barrels-wide control plane. GrenMet business
  administration belongs to the GMS Dashboard.
- Existing GMS HR, roster, and organization-wide modules remain until reusable
  Barrels replacements meet their workflows.
- MBIA and GAA are separate websites. MBIA is not a temporary alias for GAA.
- `apps/web/dowden` and `apps/web/gdbank` are out of scope. Both are empty
  untracked directories moving to their own repository; they receive no Barrels
  package, port, host, or image identity here, and the remnant audit records them
  as intentionally absent rather than missing.
- Barrels Events/Tickets, reusable HR, and Barrels Shop are future product
  initiatives, not hidden scope in this transition. Shop's identity is reserved;
  its implementation is not.
- Shared authentication infrastructure presents product-specific branding,
  roles, and access.
- DNS changes, repository renames, secret creation, infrastructure provisioning,
  deployment, and resource deletion require separate explicit authorization.
