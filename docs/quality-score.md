# Quality Score

**Status:** Active reference — grades partially re-audited  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-15

Grades each app and shared package. Updated as work progresses.
Scale: A (solid), B (good, minor gaps), C (functional, needs work), D (stub or incomplete).

Test counts below were recounted on 2026-10-15 (`*.test.ts[x]` files for
Vitest, `*.spec.ts[x]` for Playwright). Grades other than **Tests** were not
re-audited at that time; rows marked "not graded" have no audit yet.

## Web Apps

| App | Tests | Types | Lint | Auth | Docs | Design System | Grade |
|---|---|---|---|---|---|---|---|
| gaa-admin | A (145 Vitest + Playwright) | A | A | A | B | B (in progress) | B+ |
| auth | B (35 Vitest + Playwright) | A | A | A | B | C | B |
| gms | B (44 Vitest + Playwright) | A | A | B | C | C | B- |
| elections | B (37 Vitest) | A | A | Not graded | Not graded | Not graded | Not graded |
| cms | B (22 Vitest) | A | A | Payload | Not graded | Not graded | Not graded |
| events | B (22 Vitest) | A | A | App-scoped (ADR-0016) | B | B | C+ |
| signal | B (12 Vitest — lib + component) | A | A | — (no auth) | B | B | B |
| mbia | C (7 Vitest — content + flight data) | A | A | — (public) | C | App-specific | B |
| docs | D (none) | A | A | B | B | C | C+ |
| barrels | — (static homepage) | — | — | — (public) | Not graded | Not graded | Not graded |

## Shared Packages

| Package | Tests | Types | Docs | Grade |
|---|---|---|---|---|
| `@barrelsgd/ui` | D (none, 70 source files) | A | B | C+ |
| `@barrelsgd/gms` | D (none) | A | C | C |
| `@barrelsgd/theme` | D (none) | A | Not graded | Not graded |
| `@barrelsgd/email-templates` | D (none) | A | Not graded | Not graded |
| `@barrelsgd/auth` | B (4 Vitest files) | A | A | B+ |
| `@barrelsgd/api-client` | — (generated; 2 Vitest files) | A | B | A |
| `@barrelsgd/tsconfig` | — (config only) | — | B | A |
| `@barrelsgd/cms-migrations` | — (migrations only) | — | Not graded | Not graded |

## Agent Harness

| Area | Status | Grade |
|---|---|---|
| `AGENTS.md` | Written, commands-first | A |
| `AGENTS.md` | Active repository guardrails and context routing for supported agents | A |
| `docs/` system of record | Three-view portfolio system plus specialist references | A- |
| Exec plans | Active plan tracked | B |
| CI enforcement of docs | Local file and heading links enforced | B |
| Design-system CI enforcement | Generated blocks and warning contrast enforced | A |
| Dependency direction lints | `check-boundaries.mjs`: app/package direction, Sentry, brand-neutral UI, DB clients in route handlers | B |

## Priority gaps

1. Shared-package tests — `@barrelsgd/ui`, `gms`, `theme` and `email-templates`
   have none, and every web app depends on `ui`
2. `docs` app has no tests
3. Design system — brand-neutral UI and GMS package separation is in progress
