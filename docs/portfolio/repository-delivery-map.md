# Repository Delivery Map

**Status:** Authoritative repository coverage map  
**Effective:** 2026-08-16  
**Owner:** Barrels Grenada engineering

## Purpose

This map assigns every material repository surface a primary owner,
classification, lifecycle, and planning destination. It prevents the historical
GMS-first implementation from making unrelated software appear to be owned by
GMS. The [portfolio plan](barrels-portfolio-implementation-plan.md) governs
priority, and the [client programme plan](gaa-gms-client-programme-plan.md)
governs GAA/GMS outcomes.

Lifecycle terms are **active**, **prototype**, **planned**, **independent**,
**reference**, **generated**, and **historical**. They do not imply production
acceptance.

## Applications and APIs

| Repository surface | Primary classification and owner | Lifecycle | Planning destination |
| --- | --- | --- | --- |
| `apps/web/auth` | Barrels platform identity | Active | Product-aware shared sign-in with application-scoped access |
| `apps/web/gaa-admin` | GAA staff portal with GMS and GAA modules | Active; renamed at transition boundary 7 | `apps/web/gaa-admin`; GMS pilot followed by GAA department rollout |
| `apps/web/gms` | GMS public weather service | Active foundation; renamed at transition boundary 6 | `apps/web/gms`; forecasts, observations, warnings, and public products |
| `apps/web/cms` | GMS editorial content service delivered by Barrels | Active development | Dedicated CMS database, shared FastAPI identity, reviewed migrations and publishing |
| `apps/web/docs` | GMS public documentation and preparedness content | Active content application; renamed at transition boundary 8 | `apps/web/docs` on the dedicated GMS documentation host |
| `apps/web/events` | Barrels Events product | Prototype | Approved Events discovery/ticketing pilot after transition gates |
| `apps/web/signal` | Barrels Signal media product | Active | Maintain separately; deepen according to product evidence |
| `apps/web/mbia` | GAA/MBIA passenger public service | Active | Keep distinct from GAA corporate and staff applications |
| `apps/api/fastapi` | Barrels-operated shared API serving client and product domains | Active | Preserve domain boundaries; make authorization product/organisation aware |
| `apps/api/honoapi` | Reserved Barrels weather-data proxy | Prototype health stub | Explore only after a real consumer and contract exist |

The current `gaa-admin` module ownership is intentionally mixed during the
transition:

| Module | Operational owner | Destination |
| --- | --- | --- |
| CAP, WxWatch, WxProducts | GMS | Remain GMS capabilities presented within the GAA portal |
| HR, users, shared roster/workflow | GAA | Organisation-wide platform core, piloted in GMS |
| Janitorial | GAA Janitorial | Department module |
| Transport/bus | GAA Transport | Department module |
| Salesbus | Barrels | Extract from the client portal before product investment |

## Shared packages

| Repository surface | Primary classification and owner | Lifecycle | Dependency rule |
| --- | --- | --- | --- |
| `packages/cms-migrations` | Barrels delivery tooling for GMS content | Active | Dependency-only package for the canonical CMS migration config; excludes web UI dependencies |
| `packages/admin-migrations` | Barrels delivery tooling for GAA | Active | Dependency-only package for admin migrations and baselines; no web runtime dependencies |
| `packages/auth` | Barrels platform | Active | May serve products and clients; grants no application access by default |
| `packages/ui` | Barrels platform, brand-neutral primitives | Active; separation complete at boundaries 3-5 | Carries no brand prefix; must not depend on a brand package or select GMS branding by default |
| `packages/theme` | Barrels platform display infrastructure | Active | Brand-neutral; product packages supply mappings |
| `packages/gms` | GMS client presentation package | Active; extracted at boundaries 4-5b | Owns the GMS logo, palette and components; may depend on shared UI/theme, never the reverse |
| `packages/api-client` | Barrels platform generated client | Generated | Regenerate from FastAPI OpenAPI; never edit generated output manually |
| `packages/email-templates` | Barrels platform messaging | Active | Product/client branding supplied by caller |
| `packages/mdx` | Barrels platform content processing | Active | Shared processing without owning content policy |
| `packages/tsconfig` | Barrels engineering configuration | Active | Shared compile policy only |

## FastAPI domains and data responsibility

| Domain | Classification | Primary consumer or owner | Direction |
| --- | --- | --- | --- |
| Auth and permissions | Barrels platform | All authorized applications | Add organisation/application-aware grants through a separately approved migration |
| CAP | GMS operational service | GMS forecasters and public feeds | Complete controlled warning lifecycle and dissemination evidence |
| HR, roster, leave, timesheet, exchanges, status, parking | GAA staff platform | GAA, piloted in GMS | Harden shared core and remove department assumptions |
| Billing | Barrels platform/product capability | Approved transactional products | Keep isolated until an approved product consumes it |
| Storage | Barrels platform | Multiple domains | Preserve domain ownership, access controls, retention, and audit |
| Worker and webhooks | Barrels platform runtime | Async product/client operations | Add consumers only with retry, idempotency, monitoring, and ownership |

Drizzle-owned WxWatch/WxProducts data currently lives with the staff portal;
this is an implementation location, not a transfer of operational ownership
away from GMS.

## Operational pipelines, tools, and automation

| Repository surface | Classification and owner | Lifecycle | Planning destination |
| --- | --- | --- | --- |
| `scripts/bishop-weather` | GMS tide research and collection tooling | Research | Validate source coverage and provenance before operational adoption; downloaded datasets remain local |
| `scripts/gms-ingest` | GMS weather product ingestion delivered by Barrels | Active development | Verify collection, decoding, storage, freshness, and recovery before operational acceptance |
| `scripts/gms-roster` | GAA staff roster import tooling, piloted in GMS | Active | Review extracted assignments and month boundaries before publishing a roster |
| `scripts/production` | Barrels engineering database provisioning | Active | Apply reviewed migrations and repeatable baseline seeds without overwriting recorded operational data |
| `scripts/sutron-collector` | GMS observation operations delivered by Barrels | Active development | Prove hardware collection, durable spool, SURFACE export, monitoring, and recovery |
| `scripts/scrapy-wxwatch` | GMS forecast-support operations delivered by Barrels | Active | Deploy bounded schedules with freshness, storage, database, and alert ownership |
| `scripts/wis2-setup` | GMS/WIS2 integration artifacts | Active pilot | Complete local soak and separately approved global publication gates |
| `scripts/wxregister` | GMS data migration/extraction utility | Reference utility | Retain until migration need is resolved; promote or retire explicitly |
| `scripts/docs` | Barrels engineering documentation guardrails | Active | Enforce links, portfolio coverage, and document-system integrity |
| `scripts/design-system` | Barrels engineering design-system automation | Active | Separate brand-neutral enforcement from GMS-specific contracts |
| `scripts/ci` | Barrels engineering CI image selection | Active | Select affected images conservatively and retain full verification on promotion PRs |
| `scripts/guardrails` | Barrels engineering change-safety automation | Active | Preserve blast-radius checks across all products and programmes |
| `scripts/api` | Barrels engineering API generation/drift automation | Active | Keep OpenAPI and generated clients synchronized |

## Infrastructure and operations

| Repository surface | Classification and owner | Lifecycle | Boundary |
| --- | --- | --- | --- |
| `infra/docker` | Barrels platform infrastructure | Active; legacy naming remains during transition | Shared app/API databases and local/staging/production composition |
| `infra/weather` | GMS weather delivery operated by Barrels | Active development | Separate SURFACE/WIS2 lifecycles, collector schedules, durable storage and recovery; GeoNetCast remains local |
| `infra/postgres` | Barrels database bootstrap and compatibility assets | Active | Keep roles/extensions aligned with application migrations and independently managed stacks |
| `.github/workflows` | Barrels engineering delivery automation | Active | CI, images, deployment orchestration, backups, and database preparation |
| `.github/security` | Barrels engineering security policy | Active | Versioned, reviewed vulnerability exceptions with bounded expiry |
| `.github/actions` | Reusable Barrels CI actions | Active | Centralize supported setup behavior without hiding workflow permissions |
| `.github/dependabot.yml` and `.github/labeler.yml` | Repository maintenance automation | Active | Dependency and change classification only; no product authority |
| `docs/operations` | Mixed Barrels engineering and GMS operational controls | Active | Each runbook identifies its operational owner and environment |
| `docs/products` | Product specifications and implementation plans, classified by their named owner | Planned/reference | Keep product scope and acceptance criteria aligned with the portfolio and client programme plans |
| `docs/api` and `docs/web` | Barrels engineering references | Active | Describe current interfaces and delivery practice, not programme priority |
| `docs/adr` | Durable architecture decisions | Active/historical by ADR status | Amend decisions explicitly; never let a roadmap silently override an accepted ADR |
| `docs/internal` | GMS programme, catalogue, evidence, and reporting documents | Mixed draft/active/historical | Subordinate to the client programme view; retain specialist authority |
| `docs/strategy` | Barrels company/product strategy | Active | Governs product direction, not client operational acceptance |
| `docs/exec-plans` | Repository transition/migration execution | Active plus superseded material | Governs approved implementation boundaries and records historical sequencing |
| `docs/portfolio` | Authoritative portfolio planning system | Active | Reconcile company priorities, client outcomes, and repository coverage |
| `docs/agents` | Agent-facing engineering guidance | Active reference | Keep consistent with root guardrails and executable checks |
| `docs/hr` | GAA staff-platform design evidence | Active/reference | Subordinate to the GAA client programme and productization gate |
| `docs/architecture.md`, `docs/data-architecture.md`, and `docs/technical-overview.md` | Architecture system of record | Active | Describe current boundaries and approved direction |
| `docs/deployment.md`, `docs/infrastructure.md`, `docs/staging-prep.md`, and `docs/weather-gd-golive.md` | Delivery and cutover references | Active | Require environment owner and release authorization |
| `docs/design-system.md`, `docs/design-workflow.md`, and `docs/env.md` | Cross-cutting engineering references | Active | Preserve brand and configuration boundaries |
| `docs/audit-2026-06.md`, `docs/fastapi-cap-audit.md`, `docs/quality-score.md`, and `docs/security.md` | Audit and quality evidence | Snapshot/active by document | Refresh claims explicitly; never treat a score as acceptance |
| `docs/grenada-streaming-events-brief.md`, `docs/ports.md`, and `docs/troubleshooting.md` | Product option and engineering references | Mixed Explore/active reference | Follow the authority and lifecycle stated in each document |

The fourteen current workflow files under `.github/workflows` are one delivery
surface. Their individual image, CI, deployment, backup, database, labeling,
and smoke responsibilities remain documented in workflow and deployment
references rather than duplicated here.

## Repository governance and developer tooling

| Repository surface | Classification and owner | Lifecycle | Boundary |
| --- | --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md`, and `CONTRIBUTING.md` | Repository governance | Active | Commands, safety rules, conventions, and review gates |
| `README.md` | Repository entry point | Active | Orientation only; links to authoritative specialist documents |
| `VENDORED.md` | Third-party provenance policy | Active | Defines upgrade and local-change boundaries for vendored stacks |
| `.agents/skills`, `.claude/skills`, and `.claude/commands` | Agent workflow playbooks | Active tooling | Support engineering work; they do not set portfolio priority |
| `.claude/hooks`, `.claude/settings.json`, `.agents/commands`, `.agents/rules`, and `.agents/hooks.json` | Agent/editor configuration | Active tooling | Must preserve repository guardrails across supported tools |
| `.devcontainer` and `.vscode` | Developer environment | Active tooling | Reproducible local setup; not a deployment environment |
| `.husky`, `.lintstagedrc.mjs`, and `.turbo` | Local quality and task orchestration | Active tooling | Fast feedback supplements, but does not replace, CI |
| `scripts/sutron-collector/capture` | Sutron field-capture procedure and scripts | Governed | Promoted from the former `.capture-tools` scratch directory after field validation; that scratch copy is retired |

| Root configuration | Classification | Lifecycle rule |
| --- | --- | --- |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and `biome.jsonc` | JavaScript workspace and quality policy | Change with affected workspaces and CI |
| `pyproject.toml`, `.python-version`, and `uv.lock` | Python workspace and dependency lock | Keep all Python members synchronized |
| `pnpm-lock.yaml`, `.node-version`, and `.npmrc` | JavaScript runtime/dependency lock | Regenerate only through approved package-manager work |
| `.dockerignore`, `.editorconfig`, `.gitattributes`, and `.gitignore` | Repository hygiene and build context | Review broad pattern changes for hidden artifacts |
| `figma.config.json` | Design/code integration | Active configuration tied to the design-system boundary |
| `skills-lock.json` | Agent skill dependency lock | Update through the skill-management workflow |
| `July 2026.pdf` | Historical programme source report at repository root | Reference; migrate into `docs/internal/reports` when provenance is preserved |

These rows deliberately classify support and governance surfaces without turning
them into delivery initiatives. Root configuration changes inherit the portfolio
classification of the application, client programme, or engineering capability
they affect.

## Independent operational stacks

| Repository surface | Classification and owner | Lifecycle | Boundary |
| --- | --- | --- | --- |
| `surface` | GMS CDMS flavor of upstream SURFACE | Independent operational stack | Own database, Compose lifecycle, upgrade process, backups, and service acceptance |
| `wis2box` | GMS WIS2 deployment configuration using upstream images | Independent operational stack | Own data directory, credentials, Compose lifecycle, monitoring, and upgrade process |

Barrels may operate hosting, backups, monitoring, connectors, and support under
agreement. That does not make the upstream systems Barrels products or permit
the main platform deployment to mutate their lifecycle. Integration occurs at
documented data boundaries.

## Research, training, and reference assets

| Repository surface | Classification | Lifecycle | Promotion rule |
| --- | --- | --- | --- |
| `geonetcast` | GMS training and satellite/NWP reference material | Reference | Adopt a script into operations only with an owner, supported runtime, tests, monitoring, and data rights |
| `notebooks` | Data exploration | Research | Results are non-operational until converted to a reviewed package, service, or procedure |
| `docs/internal/reports` | Source reports and evidence | Reference | Preserve provenance; derived commitments live in an approved plan |
| `docs/agent-configuration-guide.md` | Agent-workspace design tutorial | Reference | Keep aligned with the configuration it teaches, or retire it when the tooling moves on |
| `docs/sutron-serial-capture.md` | Operator learning note for the Sutron serial capture | Reference | Promote confirmed findings into `scripts/sutron-collector` documentation |
| `VENDORED.md` | Vendored-system provenance and upgrade policy | Active reference | Update when a vendored release or ownership boundary changes |

## Planned identities not present as applications

| Planned surface | Classification | Horizon | Creation gate |
| --- | --- | --- | --- |
| Barrels corporate hub | Barrels company surface | Next | Transition dependencies and approved brand/copy |
| Barrels superuser admin | Barrels control plane | Next | Explicit access model and minimal operational scope |
| GAA corporate site | GAA public-service delivery | Later | GAA content owner, domain, scope, and acceptance |
| Barrels Shop | Barrels product option | Explore | Separate product discovery and investment approval |
| Salesbus | Barrels product option/prototype extraction | Explore | Remove from client portal, then validate users and commercial case |
| Reusable workforce product | Barrels productization option | Explore | GAA pilot evidence plus rights, demand, tenant, support, and pricing decisions |
| Streaming/media application | Barrels product option | Explore | Audience, rights, economics, operating model, and architecture approval |

Reserved ports, package names, hosts, or images prevent naming collisions; they
do not authorize implementation or create delivery commitments.

## Repository-wide dependency rules

1. Product/client packages may depend on brand-neutral platform packages;
   platform packages must not depend on product/client packages.
2. Application identity and authorization are explicit; a shared login is not
   shared access.
3. Client operational data retains its institutional owner regardless of which
   Barrels-operated database or UI holds it.
4. Generated artifacts follow their source contract. Vendored stacks follow
   their recorded upstream lifecycle.
5. Research/reference code never enters an operational path without an adoption
   gate.
6. Each new workspace or top-level operational directory must be added to this
   map in the same change.

## Coverage and maintenance

Run `pnpm docs:check-portfolio` after adding, removing, or renaming a workspace
or governed top-level surface. The check verifies that every discovered JS and
Python workspace and every required operational root appears in this map, that
the three authoritative views link to one another, and that prohibited
client-as-product claims do not return.

Update lifecycle evidence when a prototype becomes active, an active surface is
retired, an ADR changes the boundary, or institutional acceptance is recorded.
Do not infer production status from a package manifest, passing tests, or a
completed interface.

