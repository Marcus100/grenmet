# Architecture Decision Records

This directory records durable architecture decisions for Barrels Grenada. ADRs should describe choices that affect code structure, deployment, data ownership, security, or operational behavior.

## Index

| ADR | Decision |
| --- | --- |
| [0001](0001-monorepo.md) | Use a pnpm/Turborepo monorepo |
| [0002](0002-shared-auth-session.md) | Use shared auth with opaque browser sessions |
| [0003](0003-domain-databases.md) | Keep separate domain databases on shared PostgreSQL |
| [0004](0004-generated-api-client.md) | Generate the TypeScript API client from FastAPI OpenAPI |
| [0005](0005-compose-traefik-deployment.md) | Deploy with Docker Compose and Traefik on dedicated droplets |
| [0006](0006-design-system-governance.md) | Govern shared UI through Barrels design-system tokens and packages |
| [0007](0007-cap-warning-lifecycle.md) | Model warning operations with a CAP-aware lifecycle |
| [0008](0008-hr-approval-workflow.md) | Route HR forms through a named-approver approval workflow |
| [0009](0009-gaa-staff-platform.md) | Build a GAA-wide staff platform, piloted in Meteorology |
| [0010](0010-wis2-publishing-via-surface-builtin.md) | Publish observations to WIS2 via SURFACE's built-in publisher |
| [0011](0011-brand-neutral-design-tokens.md) | Separate brand palettes from shared UI primitives (supersedes 0006) |
| [0012](0012-decouple-design-tooling-from-figma.md) | Decouple design tooling from Figma (supersedes the Figma coupling in 0006/0011) |
| [0013](0013-cap-alert-self-publish-and-bulletin-linkage.md) | Self-publish CAP alerts and link them to their source bulletin (supersedes 0007) |
| [0014](0014-barrels-platform-core-direction.md) | Evolve the FastAPI modular monolith into Barrels Core (proposed) |
| [0015](0015-retire-hono-python-backend.md) | Retire the Hono API; backend logic is Python (CMS excepted) |
| [0016](0016-app-scoped-accounts-and-sessions.md) | App-scoped accounts and sessions: shared accounts, per-app sign-in, cookie and access |
| [0017](0017-single-sign-on-handoff.md) | Proposed: single sign-on handoff between app-scoped sessions |
| [0018](0018-modular-access-and-onboarding.md) | Modular access and administrator-mediated staff onboarding |
| [0019](0019-workspace-toolchain-baseline.md) | Workspace toolchain baseline |
| [0020](0020-feature-flags-with-success-metrics.md) | Accepted: feature flags with success metrics (built on the API as `src/feature_flags`, PF7; admin UI pending) |
| [0021](0021-timed-recovery-drill.md) | Accepted: monthly timed recovery drill (built, not yet run; API start phase pending) |
| [0022](0022-platform-organisations-and-memberships.md) | Accepted: platform organisations and memberships (bridge A, workspaces deferred) |
| [0023](0023-cap-approval-before-publish.md) | Accepted: CAP needs approval by a different person before publish; audited emergency publish for the duty supervisor (supersedes ADR-0013 decisions 1-2) |
| [0024](0024-bookings-domain.md) | Accepted: Barrels Bookings, a shared organisation-scoped appointments domain (clean-room port of Easy!Appointments' model; deposits via the payment adapter) |
| [0025](0025-api-conventions.md) | Accepted: API conventions — frontend-agnostic, audience zones (`public`/`me`/`org`/`admin`), unique schema names, shared helpers; enforced by `test_api_conventions.py` |
| [0026](0026-platform-reliability-primitives.md) | Built, awaiting owner acceptance: shared `Idempotency-Key` helper and one outbox runner for every domain (PF2) |
| [0027](0027-payments-core-and-providers.md) | Accepted for the test-mode core: payments core (intents, append-only ledger, refunds) with `manual` and Stripe test-mode adapters; funds on Barrels' merchant account; live rail gated (PF4) |
| [0028](0028-organisation-contacts.md) | Accepted: organisation-scoped contacts with consent, replacing per-domain customer tables (PF3) |
| [0029](0029-organisation-api-keys-and-webhooks.md) | Built, awaiting owner acceptance: organisation API keys with permission scopes and signed outbound webhooks (PF5, PF6) |
| [0030](0030-rewards-earn-sources-and-gamification.md) | Built (API), awaiting owner acceptance: generic rewards earn sources, Passport, achievements, check-in streaks; opt-in leaderboards, challenges and gated stamp gifting (PF8–PF11) |
| [0031](0031-self-registering-api-domains.md) | Proposed: per-domain manifests and one ordered list replace edits to four shared API files |

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

