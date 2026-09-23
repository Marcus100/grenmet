# Barrels and Client IP Boundary

**Status:** Draft, pending legal review  
**Recorded:** 2026-09-23  
**Owner:** Barrels Grenada

## Purpose

This draft proposes how repository assets divide between Barrels Grenada
intellectual property and client (GAA/GMS) intellectual property and data. It
exists to support the commercial and legal gate recorded in the
[Barrels Portfolio Implementation Plan](../portfolio/barrels-portfolio-implementation-plan.md):
GAA and GMS data ownership, software rights, residency, support, and exit terms
remain unresolved until formally agreed.

This draft has no legal effect. It does not change `README.md`, any licence
notice, or any existing agreement.

## The problem

`README.md` describes the repository as the primary software repository for
Barrels Grenada products and related client delivery, but its licence line
reads "Proprietary — Grenada Airports Authority (GAA) / Grenada Meteorological
Service (GMS)". If that line reflects the actual rights position, Barrels may
not be able to reuse or sell shared platform capabilities (see the
[AI and data platform strategy](barrels-ai-strategy.md)) to other
organizations.

## Proposed classification

| Class | Candidate assets | Proposed position |
| --- | --- | --- |
| Barrels platform IP | `packages/ui`, `packages/theme`, `packages/auth`, `packages/email-templates`, `packages/tsconfig`, API-client generation tooling; FastAPI `auth`, `audit`, `notifications`, `storage`, `billing`, `worker`; deployment and engineering tooling | Owned by Barrels; licensed to clients for their use |
| Barrels product IP | `apps/web/events`, `apps/web/signal`, `apps/web/auth`, future Barrels Core domains | Owned by Barrels |
| Client IP and data | GAA/GMS operational data and records; official products, warnings, and content; `packages/gms` brand assets; CMS content; client configuration and confidential material | Owned by the client |
| Client-commissioned software | GMS-specific domains (`cap`, `wxproducts`, `wxwatch`, `eregister`) and client applications (`apps/web/gms`, `apps/web/gaa-admin`, `apps/web/mbia`, `apps/web/docs`, `apps/web/cms`) | To be determined by agreement |
| To be determined | GAA staff-platform core (`hr`, roster, workflow), `janitorial`, `transport`, `baseline` | Depends on the rights agreement and the reusable-workforce productization decision |

Vendored stacks (`surface/`, `wis2box/`) keep their upstream licences; see
`VENDORED.md`.

## Open questions for the commercial agreement

1. Does Barrels retain ownership of generic capabilities developed during client
   work, with a perpetual licence to the client?
2. How are derived works handled when client-commissioned features are
   generalized into Barrels products?
3. What data-residency, confidentiality, and access terms apply to client data
   in Barrels-operated infrastructure?
4. What exit terms apply: data export format, source escrow, transition
   support?
5. Which licence notice should `README.md` carry once agreed, and does the
   repository need per-directory notices?

## Next step

Legal review of this classification, then a formal agreement. Only after that
should `README.md` and any licence notices change.
