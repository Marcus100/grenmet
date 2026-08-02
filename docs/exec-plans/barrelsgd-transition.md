# Barrels Grenada Platform Transition

**Status:** In progress — boundaries 1 and 2 complete
**Recorded:** 2026-07-18
**Amended:** 2026-08-02 — GrenMet retired as a name; GMS is now the single name
for the meteorological service and its software
**Owner:** Repository maintainers

This document describes the destination architecture. The execution order,
baseline freeze, commit boundaries, and rollout sequencing live in
[Barrels Grenada Migration Plan](barrelsgd-migration-plan.md).

## Goal

Turn the existing repository into the primary Barrels Grenada software
monorepo, with the Grenada Meteorological Service (GMS) platform retained as its
largest product rather than as its owner. Barrels Grenada begins with products
and client software relevant to Grenada, with a longer-term market across the
OECS, CARICOM, and other companies.

This document records future work only. It does not authorize a repository
rename, deployment, DNS change, infrastructure mutation, or removal of an
existing service.

## Why

The current repository, package scope, and infrastructure names make the
meteorological platform appear to own software that now belongs to the wider
Barrels portfolio: a news site, an airport site, and an events console all
authenticate through a cookie named for the weather service. The transition must
establish company ownership without diminishing GMS, which remains the largest
product in the portfolio and keeps its own packages, branding, and domain.

## Scope

This plan covers company and product naming, repository and package ownership,
the GAA staff portal, shared platform services, application deployment,
domains, and fresh infrastructure. It does not itself build Events/Tickets or the
reusable HR product, decide software licensing or client ownership, or activate
custom domains before access is available.

Events/Tickets is nonetheless the **number one product priority**, with GMS
second. This transition is the substrate those products are built on, not a
competitor for the same time. Sequencing is recorded in
[Barrels Grenada Product Strategy](../strategy/barrels-product-strategy.md);
where that document and this one appear to disagree on Events, the strategy
document governs priority and this document governs naming and ownership.

## Canonical terminology

- Software company and umbrella brand: **Barrels Grenada**.
- Technical slug, repository name, infrastructure prefix, and package owner:
  `barrelsgd`.
- Client organisation: **Grenada Airports Authority (GAA)**, which operates
  Maurice Bishop International Airport (MBIA) and Lauriston Airport, and of which
  the meteorological service is a department.
- Meteorological department of GAA, and the name of the software built for it:
  **Grenada Meteorological Service (GMS)**.
- Public GMS surface: the GMS website at `weather.gd`, with published SOPs and
  documentation at `docs.weather.gd`.
- Internal GAA surface: the authenticated **GAA staff portal**, which serves GMS
  first and other GAA departments as they onboard.
- GitHub repository target: `Marcus100/barrelsgd`.
- Workspace scope target: `@barrelsgd/*`.
- This monorepo is the default home for Barrels-operated products and closely
  related client applications. Use another repository when ownership,
  confidentiality, deployment, or team independence requires it.

The organisational hierarchy the naming must reflect:

```
Barrels Grenada                       software company, owns this repository
└── GAA                               client organisation
    ├── GMS                           meteorological department  → weather.gd
    ├── MBIA and Lauriston            airports                   → passenger site
    ├── Janitorial                    department
    ├── Transport                     department
    └── People and HR                 organisation-wide
```

GMS is one department of GAA, not a peer of it. Barrels products such as Signal,
Events, Shop, and Salesbus sit outside this tree entirely and belong to the
company, not to any client.

Two distinct kinds of administrative surface follow from this, and they must not
be conflated:

- The **Barrels superuser admin** (`admin.barrels.gd`) is the company control
  plane. Its users are Barrels staff and it can reach every product and client.
- A **client staff portal** is one organisation's internal tooling. Its users are
  that organisation's employees. GAA's is the first; others may follow, and they
  may link to the superuser admin but are never merged into it.

A client staff portal is also distinct from **Barrels Business**, the
organization-facing self-service product described in
[Barrels Grenada Product Strategy](../strategy/barrels-product-strategy.md).
Barrels Business is a light, many-organisation product for managing profiles,
events, orders, and staff access. The GAA staff portal is deep bespoke client
tooling — HR, rosters, janitorial, transport, payroll — built for one
organisation. They are related in spirit and separate in fact.

**GrenMet is retired as a name.** It was an internally coined contraction of
*Grenada Meteorological Service* — a second spelling of GMS rather than a
distinct product brand, and it was never the institution's own name for its
software. Carrying two names for one thing is what made company ownership and
product identity hard to tell apart. GMS is now the single name for the
meteorological service and for the software built for it.

Retiring the word does not retire the product. GMS remains a Barrels product
with its own packages, branding, and identity; only the redundant spelling goes.

`gm` is **not** an abbreviation of GrenMet. It expands to *Grenada Met*, so the
`--gm-*` design tokens, their Figma integration, and the GMS assets are already
correct and are not renamed. Capability and module names such as CAP and WxWatch
are likewise unaffected.

Every use of `grenmet` must be classified during implementation:

- Replace it with `barrelsgd` where it claims ownership of company-wide
  infrastructure or unrelated Barrels products — the session cookie, Docker
  project and container names, backup paths, image names, and runner labels.
- Replace it with `gms` where it names the meteorological product — package
  names, directories, user-facing copy, and the `urn:gms:cap` fallback
  identifier.
- Preserve nothing. Unlike the company-versus-product split, no occurrence of
  the literal string `grenmet` survives this transition outside vendored trees
  and historical git commits.

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
| Barrels superuser admin | `@barrelsgd/web-admin` | 3001 | `admin.barrels.gd` |
| GMS documentation and SOPs | `@barrelsgd/web-docs` | 3002 | `docs.weather.gd` |
| GMS public site | `@barrelsgd/web-gms` | 3003 | `weather.barrels.gd`, later `weather.gd` |
| Signal | `@barrelsgd/web-signal` | 3004 | `signal.barrels.gd` |
| MBIA public airport site | `@barrelsgd/web-mbia` | 3005 | `mbia.barrels.gd` until a dedicated domain is chosen |
| Barrels corporate hub | `@barrelsgd/web-barrels` | 3006 | `barrels.gd` |
| GAA corporate site | `@barrelsgd/web-gaa` | 3007 | `gaa.barrels.gd`, later `gaa.gd` |
| GAA staff portal | `@barrelsgd/web-gaa-admin` | 3011 | `weather.gd` during the GMS pilot, later `admin.gaa.gd` |
| Events and Tickets | `@barrelsgd/web-events` | 3009 | `events.barrels.gd` |
| FastAPI | Barrels API identity | Existing API port | `api.barrels.gd` |

`web-docs` is the renamed Hurricane Plan app. Its content already builds through
content-collections, so this is a rename and a host change, not a content
migration. Port 3002 is retained.

`web-gaa-admin` is the renamed `admin-gms`. See
[GAA staff portal](#gaa-staff-portal) for why it is named for GAA while serving
GMS first.

Three further identities are reserved but not built, so the port map, image list,
and DNS map never need re-cutting:

| Application | Package | Port | Host | Image |
| --- | --- | ---: | --- | --- |
| Barrels Shop (ecommerce) | `@barrelsgd/web-shop` | 3008 | `shop.barrels.gd` | `ghcr.io/marcus100/barrelsgd-web-shop` |
| Salesbus (point of sale) | `@barrelsgd/web-salesbus` | 3010 | `salesbus.barrels.gd` | `ghcr.io/marcus100/barrelsgd-web-salesbus` |
| Weather-data proxy | `@barrelsgd/api-hono` | 4000 | `proxy.barrels.gd` | `ghcr.io/marcus100/barrelsgd-api-hono` |

### Port allocation strategy

Ports 3000–3019 were assigned in arrival order, before the Barrels/client
hierarchy was clear. They are **not** renumbered: ports are an internal dev and
container detail, and per `docs/ports.md` each change touches seven places across
env files, Dockerfiles, Compose, and CI. Churning eleven live apps to tidy a
number nobody sees is not worth it.

Allocation from 3020 onward is **blocked per owner**, so growth stays legible:

| Block | Owner |
| --- | --- |
| 3000–3019 | Barrels platform, Barrels products, and GAA — historical, arrival-ordered |
| 3020–3029 | second client organisation |
| 3030–3039 | third client organisation |
| 3040+ | subsequent clients, ten per organisation |

New Barrels products continue to fill gaps below 3020. A client organisation
never shares a block with another client, so a whole organisation can be found,
firewalled, or removed by its range.

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
`@barrelsgd/web-gms`, `@barrelsgd/web-signal`, and
`@barrelsgd/web-mbia`.

The intended package responsibilities are:

- `@barrelsgd/ui` contains brand-neutral primitives and semantic design-token
  contracts.
- `@barrelsgd/theme` contains generic display-mode, layout, and preference
  infrastructure. It must not select GMS branding by default.
- `@barrelsgd/gms` contains GMS assets, `--gm-*` tokens, GMS theme
  presets, alert cards, and weather-product/status variants.
- `@barrelsgd/barrels` contains the supplied Barrels assets, typography,
  colors, favicons, and theme presets used by the hub, Barrels admin, and the
  authentication service's default shell. Initiating-product context selects

Product packages may depend on shared UI and theme packages. Shared packages
must not depend on either product package.

During the separation:

- Move the current GMS logo and weather-specific alert components out of the
  shared UI package and into `@barrelsgd/gms`.
- Replace GMS-specific classes in generic badges and alerts with semantic
  statuses such as success, warning, danger, and information.
- Keep compatible component props where practical.
- Put neutral base rules and semantic contracts in
  `@barrelsgd/ui/styles/base`.
- Put GMS mappings and `--gm-*` tokens in
  `@barrelsgd/gms/styles/foundation`.
- Put approved Barrels mappings in
  `@barrelsgd/barrels/styles/foundation`.
- Let Signal and MBIA retain their app-specific palettes while mapping those
  palettes to neutral UI semantics.
- Restrict GMS token and Figma checks to GMS consumers rather than applying
  them to every Barrels application.

The Barrels visual implementation is gated on receipt of the approved logo,
colors, typography, favicons, headline, company description, and contact copy.
Do not invent final brand values in their absence.

## GMS public site

Rename `apps/web/spicewx` to `apps/web/gms` and use the package name
`@barrelsgd/web-gms`. This app is the **public** meteorological service website:
forecasts, current conditions, published CAP warnings, and public product pages.
It is not an admin surface and does not absorb `admin-gms`.

Rename `apps/web/hurricaneplan` to `apps/web/docs` and use the package name
`@barrelsgd/web-docs`, served at `docs.weather.gd`. Its documents already build
through content-collections, so this is a rename and a host change rather than a
content migration, and port 3002 is retained. Published SOPs and hurricane
guidance live here; authenticated editing stays in the staff portal.

This supersedes the earlier plan to fold Hurricane Plan content into a `/sops`
path inside the GMS site. A dedicated documentation host is cheaper, avoids a
content migration, and keeps the public weather site focused.

## GAA staff portal

Rename `apps/web/admin-gms` to `apps/web/gaa-admin` and use the package name
`@barrelsgd/web-gaa-admin` on port 3011. It keeps all its current modules; this
boundary renames and rehosts, it does not split.

**Why a GAA name for a GMS-first app.** The portal already holds janitorial and
transport data belonging to sibling GAA departments. Naming it for GMS would
place one department's name over another department's records, which is the same
ownership error this transition removes elsewhere. Naming it for GAA also avoids
a second rename when other departments onboard.

**Why it keeps serving GMS first.** GMS is the pilot department. Until others
onboard, the portal remains at `weather.gd`, and no user-visible behaviour
changes. It moves to `admin.gaa.gd` when the pilot expands — a routing change,
not a re-architecture.

The portal must not be confused with `@barrelsgd/web-admin`, the Barrels
superuser control plane at `admin.barrels.gd`. Different organisations, different
users, different data. They may link; they never merge.

Current modules and their owners:

| Module | Owner |
| --- | --- |
| `cap`, `wxwatch`, `wxproducts` | GMS |
| `roster` | GMS — forecaster duty cover |
| `janitor` | GAA janitorial department |
| `bus` | GAA transport department |
| `hr`, `hr-setup`, `users` | GAA organisation-wide |
| `salesbus` | Barrels product, extracted separately |

Branding follows ownership. `--gm-*` tokens are exclusive to GMS surfaces;
GAA departments use GAA branding, for which `--gaa-*` tokens already exist in the
MBIA site. Portal chrome is GAA's. This is why the neutral token contracts in
boundary 3 are a prerequisite: without them every module inherits whichever
palette happens to ship in shared UI.

`salesbus` is a Barrels point-of-sale prototype with no production users. It is
extracted to `@barrelsgd/web-salesbus` at `salesbus.barrels.gd`, port 3010. With
no users there is no data migration, so the extraction may happen at any
convenient point. It also carries duplicate UI primitives that must be
reconciled with `@barrelsgd/ui` during extraction.

WxProducts is **not** retiring. It holds the meteorological product suite —
METAR/SPECI, TAF, SYNOP, BUFR, IWXXM, CAP, marine, and the morning, midday,
evening and outlook forecast models — across 40+ schemas, and is being integrated
into the staff portal as a first-class GMS capability. Earlier drafts of this plan
called it a retiring capability; that label was wrong and is withdrawn.

The future Barrels HR product is a single multi-tenant product, not one
deployment per business. GAA, MBIA, and future clients are organizations within
one codebase and deployment, with data scoped by tenant. Until that product
exists, HR stays in the portal — but its data model must remain
organisation-agnostic, because assumptions baked in now are paid for at the
second customer.

### GMS host behavior

Before access to `weather.gd` is available, `weather.barrels.gd` serves the
public GMS site.

After the custom domain is enabled:

- `weather.gd` is canonical for the public GMS site.
- `docs.weather.gd` serves published SOPs and documentation.
- Public requests to `weather.barrels.gd` permanently redirect with status
  `308` to the equivalent path and query on `weather.gd`.
- The staff portal remains reachable during the GMS pilot and later moves to
  `admin.gaa.gd`.
- The former standalone Hurricane Plan URL permanently redirects to
  `docs.weather.gd`.
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
- Show a minimal dashboard with launch/status cards for the hub, GMS,
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
- Treat Grenada Signal as a separate Barrels media product, not a GMS
  module.
- Keep the MBIA passenger website and GAA corporate website distinct while
  sharing airport data, administration, and platform services where useful.
- Add future Grenada-focused products according to evidence, operating
  capacity, and customer demand; expand to OECS and CARICOM markets without
  forcing unrelated products into GMS.

## Repository and platform rename

- Rename the root project to `barrelsgd-monorepo`.
- Update company-owned workspace scopes to `@barrelsgd/*`, while retaining
  product-explicit names such as `web-gms`, `web-signal`, `web-mbia`, and
  `web-gaa`.
- Update imports, Turbo filters, scripts, TypeScript references, test aliases,
  lockfile workspace entries, and documentation atomically.
- Change the shared OpenAPI title to `Barrels Grenada API` while keeping
  GMS-specific route and schema terminology where it represents GMS.
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

The final case-insensitive `grenmet` scan must return **no results** outside the
vendored `surface/` and `wis2box/` trees and historical git commits. Because the
name is retired rather than reassigned, any surviving occurrence is a defect, not
a classification decision. The corresponding `--gm-*` scan is the opposite: those
tokens are expected, correct, and must not be renamed.

## Images and deployment services

Build and publish these target images:

- `ghcr.io/marcus100/barrelsgd`
- `ghcr.io/marcus100/barrelsgd-web-auth`
- `ghcr.io/marcus100/barrelsgd-web-admin`
- `ghcr.io/marcus100/barrelsgd-web-gms`
- `ghcr.io/marcus100/barrelsgd-web-docs`
- `ghcr.io/marcus100/barrelsgd-web-gaa-admin`
- `ghcr.io/marcus100/barrelsgd-web-gaa-admin-migrate`
- `ghcr.io/marcus100/barrelsgd-web-signal`
- `ghcr.io/marcus100/barrelsgd-web-mbia`
- `ghcr.io/marcus100/barrelsgd-web-gaa`
- `ghcr.io/marcus100/barrelsgd-web-barrels`
- `ghcr.io/marcus100/barrelsgd-web-events`

The Hurricane Plan image is renamed to `barrelsgd-web-docs` rather than retired;
the app is renamed and rehosted, not dissolved. The migration-runner image
follows the staff portal, since the Drizzle schemas live there.

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
  `api`, `web-auth`, `web-admin`, `web-gms`, `web-signal`, `web-mbia`,
  `web-gaa`, and `web-barrels`.
- Keep the Hurricane Plan project only through its SOP migration.
- Use `staging` and `production` Sentry environments and separate DSNs stored
  as deployment secrets.
- Do not reuse the old infrastructure-level GMS Sentry organization or
  projects; GMS remains a product name within the Barrels organization.

## DNS map and rollout

Initial production records are:

- `barrels.gd` and `www.barrels.gd`
- `auth.barrels.gd`
- `admin.barrels.gd`
- `api.barrels.gd`
- `weather.barrels.gd`
- `docs.weather.barrels.gd` for published SOPs and documentation
- `events.barrels.gd`
- `hurricane.barrels.gd` as a redirect-only hostname after the docs rename
- `signal.barrels.gd`
- `mbia.barrels.gd`
- `gaa.barrels.gd`

Staging records are:

- `staging.barrels.gd`
- `auth.staging.barrels.gd`
- `admin.staging.barrels.gd`
- `api.staging.barrels.gd`
- `weather.staging.barrels.gd`
- `docs.weather.staging.barrels.gd`
- `events.staging.barrels.gd`
- `hurricane.staging.barrels.gd` until redirect verification is complete
- `signal.staging.barrels.gd`
- `mbia.staging.barrels.gd`
- `gaa.staging.barrels.gd`

The rollout order is:

1. Provision and secure fresh staging.
2. Deploy every target image and initialize empty databases.
3. Complete staging functional, authentication, migration, backup, and restore
   verification.
4. Complete the Hurricane Plan rename to docs, then retain the old hostname, TLS
   certificate, and lightweight permanent redirect until its approved
   redirect-retention period ends.
5. Provision production and deploy without changing public DNS.
6. Lower applicable DNS TTLs.
7. Point `*.barrels.gd` records to the new production droplet.
8. Verify HTTPS, host routing, product-branded authentication, GMS redirects,
   health checks, Sentry, and backups.
9. Retire the legacy infrastructure resources named for GMS immediately
   after every acceptance check passes and the owner explicitly confirms
   destruction. The GMS product itself continues.
10. Add `weather.gd` later and enable its canonical-host behavior.
11. Add `gaa.gd` later, make it canonical for the GAA corporate site, and
    permanently redirect `gaa.barrels.gd` to it.
12. Keep MBIA as a distinct passenger website; never redirect it to GAA merely
    because the corporate domain becomes available.

## Reviewable implementation sequence

Repository agents must not create commits. The following are small review
boundaries that an authorized human may commit separately:

1. [x] Correct canonical company, product, institution, and domain terminology.
2. [x] Rename company-owned workspace scopes and generic platform identifiers while
   retaining product-explicit package names.
3. [ ] Add neutral UI and theme contracts without changing application appearance.
4. [ ] Extract the GMS product package and migrate GMS consumers.
5. [ ] Add the Barrels product package with placeholder-safe brand interfaces.
6. [ ] Rename SpiceWX to GMS: `apps/web/spicewx` → `apps/web/gms`,
   `@barrelsgd/web-gms`. Public site only. Its current 25 files are a foundation
   to build on, not a sketch to replace, so this is a rename rather than a
   rewrite.
7. [ ] Rename the staff portal: `apps/web/admin-gms` → `apps/web/gaa-admin`,
   `@barrelsgd/web-gaa-admin`, port 3001 → 3011. Rename and rehost only — no
   module split, no route moves, no data migration. This also releases
   `@barrelsgd/web-admin` for the Barrels superuser control plane, which
   boundary 2 incorrectly assigned to the portal.
8. [ ] Rename Hurricane Plan to docs: `apps/web/hurricaneplan` → `apps/web/docs`,
   `@barrelsgd/web-docs`, served at `docs.weather.gd`, port 3002 retained. Add a
   permanent redirect from the former standalone URL.
9. [ ] Complete the WxProducts integration into the staff portal as a first-class
   GMS capability. It is not retiring; treat its schemas and encodings as core
   meteorological output.
10. [ ] Extract `salesbus` to `@barrelsgd/web-salesbus` at `salesbus.barrels.gd`,
    port 3010, reconciling its duplicate UI primitives with `@barrelsgd/ui`.
    No production users, so no data migration is required.
11. [ ] Add the Barrels admin shell and corporate hub.
12. [ ] Separate GAA from the MBIA passenger site and containerize both.
13. [ ] Containerize Signal and every remaining target application.
14. [ ] Make shared authentication product-aware.
15. [ ] Rename Docker, Compose, backup, Sentry, and workflow identities.
16. [ ] Regenerate OpenAPI and the API client where contracts change.
17. [ ] Update operational documentation and run the remnant audit: a
    case-insensitive `grenmet` scan that must return no results outside vendored
    trees, and a `--gm-*` scan that confirms those tokens were left intact.
18. [ ] Perform the separately authorized GitHub repository rename.
19. [ ] Provision and validate staging, then provision and cut over production.
20. [ ] Complete the `weather.gd` and `gaa.gd` cutovers independently when access
    is available.
21. [ ] Give Events/Tickets its own product boundaries once the naming boundaries
    it depends on have landed — it is the number one product priority, not a
    deferred initiative. Until those boundaries exist the prototype stays out of
    the deployment estate, so that Events arrives as a planned product rather than
    as hidden scope inside this transition. Reusable HR remains a later
    initiative.

### Sequencing against Events

Events is the number one product priority, but it is built **after boundaries 3-8
land**, not alongside them. Boundaries 3 to 5 give it neutral token contracts and
product packages so it stops depending on GMS tokens; 6 to 8 complete the app
renames it would otherwise be rebuilt around. Building Events first would mean
building it twice.

The order is therefore: boundaries 3-8, then Events, with the remaining
boundaries following.

Each boundary must preserve a runnable workspace, pass its focused checks, run
`pnpm fix` followed by `pnpm type-check`, and complete the Blast-Radius Gate
before continuing.

## Verification and acceptance

### Repository quality

- Run `pnpm fix` and `pnpm type-check`.
- Run package checks and tests for every changed workspace.
- Run the GMS, docs, and GAA staff portal test suites.
- Run FastAPI pytest, lint, and mypy checks.
- Regenerate OpenAPI and the client, then run `pnpm check:drift`.
- Confirm generated client files were not manually edited.

### Routes and authentication

- Public GMS works on `weather.barrels.gd` before custom-domain mode.
- Every GAA staff portal route requires authentication.
- Published SOPs and documentation resolve on `docs.weather.gd`; protected
  editing remains authenticated in the staff portal.
- The former Hurricane Plan URL redirects permanently to `docs.weather.gd`.
- Authentication retains the intended return URL and presents the calling
  product's branding and roles.
- `admin.barrels.gd` serves only the Barrels superuser control plane and never
  the GAA staff portal.
- The Barrels admin root remains a distinct protected dashboard.
- Custom-domain mode canonicalizes public and private GMS routes correctly,
  preserves paths and queries, and cannot form loops.
- MBIA and GAA remain separately routable websites.
- `grenmet_session` no longer authenticates; `barrelsgd_session` does.

### Branding and package ownership

- Shared UI renders without a product package.
- Shared UI contains no GMS assets or concrete `--gm-*` values.
- The GMS applications render GMS styling through `@barrelsgd/gms`.
- Barrels company surfaces consume `@barrelsgd/barrels`.
- Signal, MBIA, and GAA retain their intended identities.
- No package remains under `@grenmet/*`, and no identifier, directory, or
  user-facing string contains `grenmet` in any casing; GMS remains explicit in
  the names of product-specific packages, modules, assets, and copy.
- `--gm-*` tokens, GMS assets, and the GMS Figma integration are unchanged.
- The final remnant audit returns no `grenmet` occurrences outside vendored
  trees, and confirms `--gm-*` was left intact.

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
- `admin.barrels.gd` is the Barrels superuser control plane, for Barrels staff.
  GAA business administration belongs to the GAA staff portal, for GAA staff.
- GAA HR, roster, and organization-wide modules remain in the staff portal until
  the reusable Barrels HR product meets their workflows. That product is intended
  for sale to other organisations, so its data model must stay
  organisation-agnostic from the outset.
- Code ownership between Barrels Grenada and GAA is unresolved and is being
  settled with GAA directly. Data residency, the data-processing relationship,
  and exit terms are open alongside it. None of these block repository work, but
  they must be recorded before a second client is onboarded.
- MBIA and GAA are separate websites. MBIA is not a temporary alias for GAA.
- `apps/web/dowden` and `apps/web/gdbank` are out of scope. Both are empty
  untracked directories moving to their own repository; they receive no Barrels
  package, port, host, or image identity here, and the remnant audit records them
  as intentionally absent rather than missing.
- Barrels Events/Tickets is the number one product priority and GMS is second.
  Events is not built *by* this transition, but it is not a distant initiative
  either: it is the next product to receive real boundaries, a Dockerfile, a host,
  and a deployment path once the naming boundaries it depends on have landed.
- Reusable HR and Barrels Shop remain later initiatives. Shop's identity is
  reserved; its implementation is not.
- `apps/web/events` (`@barrelsgd/web-events`, port 3009) is today an
  organiser-console prototype: static, with no environment, database,
  authentication, or API dependency, and every control disabled. Its production
  identity — `events.barrels.gd`, image, and DNS records — is allocated because
  Events is the number one product priority, but allocation is not deployment.
  The prototype is not containerised, routed, or deployed until Events receives
  its own product boundaries. The remnant audit records it as an intentional
  prototype rather than an unfinished target application.
- Shared authentication is one central Barrels-operated login. Accounts may be
  shared across applications, but holding an account grants no access by itself:
  access and roles are granted per application and per organisation, and the
  sign-in surface presents the calling product's branding. See
  [ADR-0009](../adr/0009-gaa-staff-platform.md) for the role-assignment model
  this requires.
- DNS changes, repository renames, secret creation, infrastructure provisioning,
  deployment, and resource deletion require separate explicit authorization.
