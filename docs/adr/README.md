# Architecture Decision Records

This directory records durable architecture decisions for Barrels Grenada. ADRs should describe choices that affect code structure, deployment, data ownership, security, or operational behavior.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-monorepo.md) | Use a pnpm/Turborepo monorepo | Accepted |
| [0002](0002-shared-auth-session.md) | Use shared auth with opaque browser sessions | Partly superseded (0016, 0017) |
| [0003](0003-domain-databases.md) | One main database with a schema per module; separate databases only where owner, retention or risk differ | Accepted (rewritten 2026-10-20) |
| [0004](0004-generated-api-client.md) | Generate the TypeScript API client from FastAPI OpenAPI | Accepted |
| [0005](0005-compose-traefik-deployment.md) | Deploy with Docker Compose and Traefik on dedicated droplets | Accepted |
| [0006](0006-design-system-governance.md) | Govern shared UI through Barrels design-system tokens and packages | Superseded by 0011 |
| [0007](0007-cap-warning-lifecycle.md) | Model warning operations with a CAP-aware lifecycle | Partly superseded (0013, 0023) |
| [0008](0008-hr-approval-workflow.md) | Route HR forms through a named-approver approval workflow | Accepted, built |
| [0009](0009-gaa-staff-platform.md) | Build a GAA-wide staff platform, piloted in Meteorology | Superseded by 0039, 0040 |
| [0010](0010-wis2-publishing-via-surface-builtin.md) | Publish observations to WIS2 via SURFACE's built-in publisher | Accepted, amended by 0032 |
| [0011](0011-brand-neutral-design-tokens.md) | Separate brand palettes from shared UI primitives (supersedes 0006) | Accepted |
| [0012](0012-decouple-design-tooling-from-figma.md) | Decouple design tooling from Figma (supersedes the Figma coupling in 0006/0011) | Accepted |
| [0013](0013-cap-alert-self-publish-and-bulletin-linkage.md) | Self-publish CAP alerts and link them to their source bulletin (supersedes 0007) | Accepted; decisions 1–2 superseded by 0023 |
| [0014](0014-barrels-platform-core-direction.md) | Evolve the FastAPI modular monolith into Barrels Core | Proposed (tenancy accepted in 0022) |
| [0015](0015-retire-hono-python-backend.md) | Retire the Hono API; backend logic is Python (CMS excepted) | Accepted |
| [0016](0016-app-scoped-accounts-and-sessions.md) | App-scoped accounts and sessions: shared accounts, per-app sign-in, cookie and access | Accepted, amended by 0017 and 2026-10-21 (app tokens on organisation routes) |
| [0017](0017-single-sign-on-handoff.md) | Single sign-on handoff between app-scoped sessions | Built, awaiting owner check |
| [0018](0018-modular-access-and-onboarding.md) | Modular access and administrator-mediated staff onboarding | Accepted direction |
| [0019](0019-workspace-toolchain-baseline.md) | Workspace toolchain baseline | Accepted |
| [0020](0020-feature-flags-with-success-metrics.md) | Feature flags with success metrics (`src/feature_flags`, PF7, admin Flags page) | Accepted, built |
| [0021](0021-timed-recovery-drill.md) | Monthly timed recovery drill | Accepted, built (not yet run) |
| [0022](0022-platform-organisations-and-memberships.md) | Platform organisations and memberships (bridge A, workspaces deferred) | Accepted |
| [0023](0023-cap-approval-before-publish.md) | CAP needs approval by a different person before publish; audited emergency publish for the duty supervisor (supersedes ADR-0013 decisions 1-2) | Accepted |
| [0024](0024-bookings-domain.md) | Barrels Bookings, a shared organisation-scoped appointments domain (clean-room port of Easy!Appointments' model; deposits via the payment adapter) | Accepted; decision 6 superseded by 0027 |
| [0025](0025-api-conventions.md) | API conventions — frontend-agnostic, audience zones (`public`/`me`/`org`/`admin`), unique schema names, shared helpers; enforced by `test_api_conventions.py` | Accepted |
| [0026](0026-platform-reliability-primitives.md) | Shared `Idempotency-Key` helper and one outbox runner for every domain (PF2) | Built, awaiting acceptance |
| [0027](0027-payments-core-and-providers.md) | Payments core (intents, append-only ledger, refunds) with provider adapters; Barrels is merchant of record via Stripe Connect | Accepted (test mode; live money gated) |
| [0028](0028-organisation-contacts.md) | Party/role contacts: `contacts` holds personal data; bookings and other domains link by `contact_id` | Accepted, implementation pending |
| [0029](0029-organisation-api-keys-and-webhooks.md) | Organisation API keys with permission scopes and signed outbound webhooks (PF5, PF6) | Built, awaiting acceptance |
| [0030](0030-rewards-earn-sources-and-gamification.md) | Generic rewards earn sources, Passport, achievements, check-in streaks; opt-in leaderboards, challenges and gated stamp gifting (PF8–PF11) | Accepted, built (API) |
| [0031](0031-self-registering-api-domains.md) | Per-domain manifests and one ordered list replace edits to four shared API files | Approved, not built |
| [0032](0032-canonical-observation-store-and-publish-gate.md) | Canonical observation store in the eregister database, with a per-station-hour WIS2 publish gate | Accepted, not built |
| [0033](0033-data-ownership.md) | Barrels Grenada owns the data on its platforms | Accepted |
| [0034](0034-go-live-checklist.md) | A simple go-live checklist: backups with a verified restore, and monitoring | Accepted |
| [0035](0035-secrets-management.md) | Secrets: one source per environment, restricted payment keys, yearly rotation, named owners | Accepted |
| [0036](0036-hosting-split.md) | Static client sites on Vercel; everything with sign-in or data on the droplets | Accepted |
| [0037](0037-monitoring-vendors.md) | Monitoring vendors receive technical data and internal IDs, never personal data | Accepted |
| [0038](0038-background-jobs.md) | ARQ on Redis is the only background-job runner | Accepted |
| [0039](0039-gaa-staff-platform.md) | GAA staff platform (replaces 0009) | Accepted |
| [0040](0040-staff-attendance.md) | Staff attendance: terminal punches and supervisor-approved phone punches | Accepted; partly built |
| [0041](0041-agent-autonomy.md) | What unattended AI agents may and may not do | Accepted, amended by 0042 |
| [0042](0042-agents-merge-into-dev.md) | Agents merge their own green, reviewed PRs into dev; the owner keeps staging, main and the files that limit agents | Accepted |
| [0043](0043-hostnames-tenancy-and-port-allocation.md) | Hostnames, tenancy and port allocation: one brand domain, single-level hosts, tenants as organisation-slug paths, port ranges by category | Proposed |

## Template

```markdown
# ADR-XXXX: Title

## Status

Accepted | Proposed | Superseded

## Context

What forces or constraints led to this decision?

## Evidence

- **Facts:** verifiable observations, each with a source (file, PR, metric, doc link).
- **Interpretation:** what the facts mean here, labelled best practice / heuristic / speculation.
- **Uncertainty:** what we do not know yet, and what would change the decision.

Mark confidence on each point: high · medium · low.

## Options considered

At least two options, compared on correctness, complexity, maintainability,
performance, cost and operational risk.

## Decision

What did we choose?

## Consequences

What does this make easier, harder, or forbidden?
```

Existing ADRs keep their format; use the Evidence and Options sections for new
ones.

