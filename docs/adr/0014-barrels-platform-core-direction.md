# ADR-0014: Evolve the FastAPI Modular Monolith Into Barrels Core

## Status

Proposed. Records direction only; each domain below requires its own approval,
migration review, and contract update before implementation.

## Context

The [Barrels AI and data platform strategy](../strategy/barrels-ai-strategy.md)
describes five shared capabilities: identity and organizations, data, AI,
knowledge, and automation. The repository already provides much of the
foundation: a FastAPI modular monolith with domain packages, shared auth,
PostgreSQL, Redis/ARQ workers, S3-compatible storage, OpenAPI-generated clients,
platform audit (`src/audit`), and notifications (`src/notifications`).

What is missing is a first-class organization model and any AI capability.
Current access is user- and role-based, which cannot safely serve many
organizations from one backend. The
[repository delivery map](../portfolio/repository-delivery-map.md) already
anticipates organisation/application-aware grants.

Portfolio policy 4 forbids speculative platform construction, so this ADR fixes
direction without scheduling work.

## Decision

1. **Stay a modular monolith.** New capabilities are FastAPI domains in
   `apps/api/fastapi/src/`, not new services, until measured load or isolation
   requirements justify extraction.
2. **Organizations first.** Introduce `Organization`, `Membership`, and
   `Workspace`, and a request context carrying user, organization, workspace,
   and permissions. Organization-scoped data is filtered through that context.
3. **Provider-agnostic AI domain.** An `ai` domain exposes a provider protocol,
   a policy-driven router, and usage/cost events. Applications call Barrels AI,
   never a model provider SDK directly.
4. **Auditable AI.** AI executions are recorded through the existing
   `src/audit` mechanism, extended with provider, model, prompt version,
   retrieval sources, tools, cost, and human-review fields.
5. **Existing datastores first.** Knowledge retrieval uses PostgreSQL with
   pgvector, documents use S3-compatible storage, and jobs use Redis/ARQ. No
   dedicated vector database, message broker, or workflow engine is added
   without a superseding ADR.
6. **Workflows on existing primitives.** Automation builds on the ARQ worker,
   `src/notifications`, and the approval patterns from
   [ADR-0008](0008-hr-approval-workflow.md).

## Consequences

- Tenancy becomes a cross-cutting concern; every new domain must be
  organization-aware from its first migration.
- Retrofitting organization scope onto existing domains (HR, CAP, and others)
  is a separate, per-domain decision with its own blast-radius review.
- Adding pgvector, model-provider SDKs, and new dependencies each remain
  Ask-First changes.
- New routes change the OpenAPI contract and follow the `api-change` workflow.
- Vendor portability and cost attribution are available from the first AI
  feature rather than retrofitted.
