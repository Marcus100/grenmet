# GMS Digital Services Programme — Roadmap

This roadmap covers the implementation of the GMS Digital Services Programme, led by the Digital Transformation Officer (DTO). It tracks both the **technical build** (what is being developed in this monorepo) and the **programme phases** (the operational milestones from the DTO Terms of Reference).

The broader GMS service strategy and product catalogue live in [GMS Digital Service Architecture](../architecture.md). Programme governance, KPIs, and reporting structure are in the [DTO Terms of Reference](./dto-terms-of-reference.md).

**Current date:** May 2026 | **Next major milestone:** July 2026 end-of-period review

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🔄 | In progress |
| 📋 | Planned |
| ⏳ | Deferred / blocked |
| 🚩 | Needs attention |

---

## Programme Phases (Execution Plan)

These are the operational phases from the DTO Terms of Reference. Each phase maps to one or more technical workstreams in this monorepo.

| Phase | Description | Target window | Status |
|---|---|---|---|
| **Phase 1** | ICT Readiness and Assessment | Jan–Feb 2026 | ✅ Complete |
| **Phase 2** | CAP Implementation and SOPs | Feb–Apr 2026 | 🔄 In progress |
| **Phase 3** | CDMS Implementation | Mar–Jun 2026 | 🔄 In progress |
| **Phase 4** | Internal Dashboard MVP | Mar–Jun 2026 | 🔄 In progress |
| **Phase 5** | Automation Tools | Continuous | 🔄 Partial |
| **Phase 6** | Website, Mobile App, and Public Products | Follows Phase 2 | 🔄 In progress |

---

## Milestone 0 — Foundation (✅ Complete, Jan–May 2026)

Everything built to establish the platform before domain-specific features.

### Infrastructure and CI/CD
- ✅ pnpm v10 + Turborepo v2 monorepo with 8 Next.js applications
- ✅ FastAPI backend — authentication and HR domains, PostgreSQL via SQLModel/asyncpg
- ✅ Drizzle ORM for wxwatch and wxproducts (separate DB per app)
- ✅ Docker + Docker Compose for FastAPI, PostgreSQL, and infrastructure services
- ✅ 10 GitHub Actions workflows: web builds, API image builds, deploy to staging and production, database backup, code quality (Biome), type checking, security scanning (CodeQL), API client sync check
- ✅ Automated database backup pipeline
- ✅ Kubb-generated TypeScript API client from FastAPI OpenAPI schema

### Shared Platform
- ✅ Shared authentication (`@grenmet/auth`) — session cookies, sign-in/sign-up, session exchange
- ✅ Shared UI component library (`@grenmet/ui`) — 20+ shadcn-style primitives built on Base UI
- ✅ GrenMet Design System v1 — `--gm-*` CSS custom properties, Tailwind v4 aliases, Figma variable contract
- ✅ `design-system:sync`, `design-system:check`, and `design-system:audit` tooling
- ✅ Figma `GrenMet v1 Foundation Contract` — color, spacing, radius, typography, shadow tokens

### Application Scaffolds
- ✅ All 8 Next.js apps bootstrapped with routing, auth, and environment configuration
- ✅ `spicewx` established as the v1 design system reference app

---

## Phase 1 — ICT Readiness and Assessment (✅ Complete)

*Mapping: Programme Phase 1*

- ✅ Infrastructure reviewed and documented
- ✅ Application stack selected and configured (Next.js, FastAPI, PostgreSQL, Docker)
- ✅ Repository structure, branching strategy, and CI/CD established
- ✅ Access, accounts, and environment configurations set up
- ✅ Digital roadmap drafted and informally approved

---

## Phase 2 — CAP and Warning Products (🔄 In Progress)

*Mapping: Programme Phase 2 + Phase 3 partial*

### Completed
- ✅ CAP alert database schema (`wxproducts/src/db/schema/cap.ts`)
- ✅ IBF (Impact-Based Forecasting) schema (`wxproducts/src/db/schema/ibf.ts`)
- ✅ Tropical weather outlook schema
- ✅ Product metadata and suite schemas for grouping related products

### In Progress
- 🔄 CAP alert composition UI — internal tool for forecasters to author and review CAP alerts
- 🔄 Standard Operating Procedures (SOPs) for CAP alert production
- 🔄 Warning display components in `@grenmet/ui` (Warning/IBF design system lane)
- 🔄 CAP export (structured XML / JSON output)

### Planned
- 📋 Multi-channel dissemination integration (SMS, email, website, WhatsApp, social media)
- 📋 Warning banner and alert detail components for public website
- 📋 Impact matrix UI — severity, likelihood, affected areas, recommended actions
- 📋 Warning content contract validation (level, headline, affected areas, validity, impacts, actions, confidence, source)
- 📋 CAP alert archive and search
- 📋 Forecaster training on CAP tool

---

## Phase 3 — CDMS and Data Management (🔄 In Progress)

*Mapping: Programme Phase 3*

The CDMS (SURFACE) is a separate external system, not part of this monorepo. Work in this phase spans both the external SURFACE system and data ingestion pipelines into the grenmet platform.

### Completed
- ✅ Product database schemas for aviation (METAR/SPECI, TAF), surface observations (SYNOP), marine, and BUFR
- ✅ Hourly observation schema
- ✅ wxwatch — weather image scraping, storage, and archive (automated pipeline)

### In Progress
- 🔄 SURFACE CDMS evaluation and configuration for Grenada data
- 🔄 Data ingestion design for AWS data into platform

### Planned
- 📋 SURFACE CDMS deployed with historical data loaded
- 📋 Automated AWS data ingestion pipeline (target latency: < 5 minutes)
- 📋 Data quality control (QA/QC) automation
- 📋 SYNOP and METAR observation ingestion from operational sources
- 📋 Data completeness baseline measurement and monitoring
- 📋 Staff training on CDMS

---

## Phase 4 — Internal Dashboard MVP (🔄 In Progress)

*Mapping: Programme Phase 4*

The internal dashboard is the `admin-gms` application (port 3001).

### Completed
- ✅ admin-gms framework — authentication, navigation, layout
- ✅ Data visualisation components (ApexCharts — bar chart, line chart)
- ✅ Calendar component (FullCalendar)
- ✅ Data table component (TanStack Table + Virtual)
- ✅ Form system (TanStack Form)
- ✅ Vitest unit tests and Playwright end-to-end tests established

### In Progress
- 🔄 GMS-specific dashboard views (replacing generic scaffold with operational content)
- 🔄 AWS data display integration

### Planned
- 📋 Live AWS station status panel
- 📋 CAP alert status and recent warnings panel
- 📋 Event log and recent significant weather panel
- 📋 System health indicators (uptime, pipeline status, last data received)
- 📋 Forecaster pilot — UAT with Forecasting Unit
- 📋 Observation dashboard (station map, hourly data, missing data alerts)
- 📋 Product production tracker (what was issued, when, by whom)

---

## Phase 5 — Automation Tools (🔄 Partial, Continuous)

*Mapping: Programme Phase 5*

### Completed
- ✅ Forecast product PDF export (morning forecast — Playwright headless browser, `wxproducts`)
- ✅ Weather image scraping pipeline (`wxwatch`)
- ✅ CI/CD automation (builds, tests, deployments, backups)

### In Progress
- 🔄 Additional PDF export formats (midday, evening, marine bulletin)
- 🔄 HR workflow automation (timesheets, shift management — `hr` app + FastAPI)

### Planned (rolling, 4–6 week increments)
- 📋 Forecast bulletin template automation — structured text generation from product data
- 📋 Morning/midday/evening summary digest generation
- 📋 Automated report generation for climate summaries
- 📋 Alert/advisory notification automation (triggers from CAP status)
- 📋 Data pipeline monitoring and alerting (failed ingestion, data gaps)

---

## Phase 6 — Public Website and Products (🔄 In Progress)

*Mapping: Programme Phase 6*

The public-facing platform is `spicewx` (port 3003), the primary GMS public weather website.

### Completed
- ✅ spicewx application with weather conditions, date-based forecast navigation, header, footer, nav drawer
- ✅ GrenMet Design System v1 applied to spicewx as the reference implementation
- 🔄 hurricaneplan — public hurricane preparedness content site with MDX, Algolia search, and structured guides (design system migration in progress)
- ✅ auth — shared sign-in/sign-up platform for all GMS web applications

### In Progress
- 🔄 spicewx — completing v1 reference implementation (full design system compliance)
- 🔄 Current conditions component (live observation card)
- 🔄 Daily forecast display with morning/midday/evening summaries

### Planned
- 📋 Warning banner and alert display (integrating with CAP system)
- 📋 Public weather product pages (marine, aviation summaries)
- 📋 Mobile-responsive polish pass
- 📋 Performance audit (target: < 3 seconds page load)
- 📋 Search engine accessibility and metadata
- 📋 Tropical weather outlook public display
- 📋 Social card / shareable forecast image generation
- 📋 SMS / subscription signup integration

---

## Near-Term Actions (Before July 2026 Review) 🚩

These are items with an immediate deadline — the July 2026 end-of-period performance review.

### CI/CD — Hard Deadline: June 2 2026
- 🚩 **Bump all Node.js 20 GitHub Actions to Node.js 24-compatible versions** (forced deadline June 2, 2026)
  - Affected: `actions/checkout`, `actions/setup-python`, `astral-sh/setup-uv`, `actions/upload-artifact`, `docker/build-push-action`, `docker/setup-buildx-action`, `github/codeql-action/upload-sarif`, `codecov/codecov-action`

### Programme Governance — Before July Review
- 🚩 **Establish and document KPI baselines** — first measurements recorded for all KPIs in Section 11 of the TOR
- 🚩 **Submit DTO Terms of Reference for formal signatures** — document has been verbally approved but not signed; must be formalised before the July review
- 🚩 **Formalise cloud budget** — the informal XCD $250/month cap needs written management approval before production systems incur costs
- 📋 **Deliver first staff digital skills training session**
- 📋 **Draft ICT governance documentation** (security policy, backup procedures, system inventory)

---

## Design System — Foundation Compliance (H1–H2 2026)

Separate from the programme phases, the design system has its own compliance track across all apps.

### Completed
- ✅ GrenMet v1 foundation block deployed to all 8 web apps
- ✅ spicewx established as reference implementation
- ✅ Figma `GrenMet v1` file consolidated into current `00 Overview` and `13 Components` handoff map
- ✅ Button Code Connect mapping complete locally (publish deferred — Figma account limitation)

### In Progress
- 🔄 Foundation compliance audit per app (run `pnpm design-system:audit`)
- 🔄 Resolving documented exceptions: admin-gms TailAdmin drift, hurricaneplan template drift, document-lane fixed A4 dimensions, and accepted media/layout exceptions
- 🔄 Input component set exists in Figma and code; local Code Connect mapping is next while publish access remains blocked

### Planned
- 📋 Promote selected audit rules to blocking CI checks (starting with spicewx)
- 📋 Warning/IBF design system lane — banner, impact matrix, status/validity components
- 📋 Public Weather design system lane — conditions card, forecast strip, daily summary
- 📋 Tropical Cyclone design system lane — outlook and advisory shells
- ⏳ Dark mode token design — deferred; requires dedicated Figma design pass; v1 is light-mode only
- ⏳ Figma Code Connect publish — deferred; requires Figma account with Developer, Organization, or Enterprise capability

---

## H2 2026 — Product Depth

Follows successful completion of Phase 2–6 core deliverables.

### Warning and IBF
- 📋 IBFWS operational for ≥ 5 hazard types (rainfall/flood, high wind, thunderstorm, marine, tropical cyclone)
- 📋 Warning dissemination pipeline fully automated and tested
- 📋 Hazardous Weather and Climate Events Catalogue — MVP operational
- 📋 CAP feed accessible to regional partners (CMO, CARIBE-EWS)

### Aviation and Marine
- 📋 METAR/SPECI and TAF display in operational dashboard
- 📋 Marine forecast product page on public website
- 📋 Aviation meteorological service products accessible to aerodrome operations

### Data and Observation
- 📋 CDMS fully operational with automated data ingestion
- 📋 Observation dashboard live in admin-gms
- 📋 Hono API — first external data endpoint defined and deployed

### HR and Administration
- 📋 HR app at production-ready state (timesheets, rosters, leave, shift swaps)

---

## 2027 and Beyond — Strategic Services

These are strategic targets from the GMS Digital Service Architecture. They depend on H1/H2 2026 core deliverables and GMS leadership approval for operational workflows.

- 📋 Climate Service — monthly summaries, normals, data portal, drought monitoring
- 📋 Observation and Monitoring dashboard — AWS/SYNOP/rain-gauge station health, real-time map
- 📋 Agriculture weather service — farmer outlooks, dry-spell guidance, agrometeorological bulletins
- 📋 Partner and stakeholder briefing system — NDEMA, airport, government, utilities
- 📋 Full CAP dissemination to GDACS, regional feeds, and SMS/WhatsApp channels
- 📋 AI/ML pilot — nowcasting, rainfall prediction, anomaly detection
- 📋 IoT sensor integration trials — rain gauges, coastal sensors, lightning detection
- 📋 WMO WIS2 alignment — structured data publication and discovery
- 📋 Annual Digital Transformation Report — first edition (December 2026)
- 📋 Annual Climate and Extreme Events Report — first edition (December 2026)

---

## CodeQL v4 Upgrade (December 2026 Deadline)
- 📋 Upgrade CodeQL Action v3 → v4 (deprecation deadline December 2026)

---

## Deferred (No Active Timeline)

| Item | Blocker |
|---|---|
| Dark mode design tokens | Requires dedicated Figma design pass; v1 is light-mode only |
| Figma Code Connect publish | Figma Education account lacks the required publish capability |
| Runtime schema reconciliation (wxproducts ↔ GMS product catalogue) | Requires GMS leadership review before runtime interfaces change |
| Full cross-app component migration to `@grenmet/ui` | Phased; gated on design system component depth |
| Test suites for non-admin apps | Only admin-gms has Vitest + Playwright today |
| AI/ML operational tools | Year 2+ — gated on stable data infrastructure |

---

## Reference Documents

| Document | Location | Purpose |
|---|---|---|
| GMS Digital Service Architecture | [`docs/architecture.md`](../architecture.md) | Service strategy, product catalogue, warning model |
| DTO Terms of Reference | [`docs/internal/dto-terms-of-reference.md`](./dto-terms-of-reference.md) | Programme governance, KPIs, deliverables, risk register |
| Design System Guide | [`docs/design-system.md`](../design-system.md) | Token system, Figma bridge, compliance guide |
| Environment Variables | [`docs/env.md`](../env.md) | Per-app environment configuration |
| Developer Reference | [`CLAUDE.md`](../../CLAUDE.md) | Monorepo commands, architecture, conventions |

---

*Last updated: May 2026 | Maintained by the Digital Transformation Officer, GMS*
