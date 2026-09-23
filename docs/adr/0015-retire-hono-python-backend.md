# ADR-0015: Retire the Hono API; Backend Logic Is Python

## Status

Accepted (2026-09-23). Supersedes the "Hono is deferred" note in
[ADR-0003](0003-domain-databases.md) and the planned Hono BFF role in the
repository delivery map.

## Context

`apps/api/honoapi` was a TypeScript (Hono) service that served only
`GET /health`. No web app consumed it, but it was built, deployed to
`hapi.<domain>`, and health-checked on every release. It also kept a second
backend language and runtime in the dependency, security-scan, and CI surface.

The owner's standing rule is that backend logic is Python (FastAPI). The only
TypeScript backend is the Payload CMS (`apps/web/cms`). Drizzle was removed
from gaa-admin in the same change set, so no web app now has an ORM or direct
database access.

## Decision

1. Delete `apps/api/honoapi` and remove it from the workspace, Dockerfiles,
   deploy Compose, release scope, CI health checks, production smoke checks,
   Dependabot, the labeler, and the devcontainer volumes.
2. All backend logic, data access, and delivery (email, webhooks, jobs) belong
   in FastAPI. Next.js route handlers may only validate input, proxy to
   FastAPI, or render (e.g. React Email HTML for FastAPI).
3. Port range `4000–4099` stays reserved; nothing listens there.

## Consequences

- One backend runtime to secure, scan, and operate.
- A future browser-facing proxy would need a new ADR, and must still keep
  logic in FastAPI.
- **Operational follow-up (manual):** the running `api-hono` containers on
  staging and production become Compose orphans after the next deploy. Remove
  them and the `hapi` route with the retirement procedure in
  `docs/deployment.md`. The wildcard DNS record needs no change.
