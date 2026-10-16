# Quality Score

**Status:** Active reference — test evidence refreshed 2026-10-16; other grades not re-audited  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-16

Tracks code and platform quality for each app, package and API domain.

Test evidence is recorded in two forms, kept apart on purpose:

- **Inventory:** how many test files exist and what they exercise. It is a map, not a measure; never grade from file or line counts.
- **Measured coverage:** a number only where someone ran a coverage tool, with the command and date. Anything else says "not measured".

Types, lint, auth, docs and design-system grades use A (solid), B (good, minor gaps), C (functional, needs work), D (stub or incomplete). They were last reviewed on 2026-08-16 and have not been re-audited since. A dash means not graded yet.

## Web apps

Counts are Vitest and Playwright files, counted 2026-10-16.

| App | Test inventory | Where the tests are | Measured coverage | Types | Lint | Auth | Docs | Design system |
|---|---|---|---|---|---|---|---|---|
| gaa-admin | 146 files + Playwright smoke | Module pages, forms, shared layout | Not measured | A | A | A | B | B (in progress) |
| auth | 36 files + Playwright smoke | Components, security pages, app hand-off, lib | Not measured | A | A | A | B | C |
| gms | 45 files + Playwright smoke | Lib (16), components, home | Not measured | A | A | B | C | C |
| elections | 37 files | Data loaders (17), routes, learn pages | Not measured | — | — | — | — | — |
| cms | 22 files | Lib, collections, fields, globals, logout-all | Not measured | — | — | — | — | — |
| events | 22 files | Data, community and dashboard components, sign-in | Not measured | A | A | — (app-scoped sessions, ADR-0016; not graded) | B | B |
| signal | 12 files | Lib, components, subscribe route | Not measured | A | A | — (no auth) | B | B |
| mbia | 7 files | Content and flight data, routes | Not measured | A | A | — (public) | C | App-specific |
| docs | None | — | — | A | A | B | B | C |
| barrels | None (static homepage) | — | — | — | — | — | — | — |

## Shared packages

| Package | Test inventory | Measured coverage | Types | Docs |
|---|---|---|---|---|
| `@barrelsgd/auth` | 4 files (`src/server/__tests__`) | Not measured | A | A |
| `@barrelsgd/api-client` | 2 handwritten files in `tests/`; `src/gen/` is generated and drift-checked in CI | Not measured | A | B |
| `@barrelsgd/ui` | None; every app depends on it | — | A | B |
| `@barrelsgd/gms` | None | — | A | C |
| `@barrelsgd/theme` | None | — | — | — |
| `@barrelsgd/email-templates` | None | — | — | — |
| `@barrelsgd/tsconfig` | — (config only) | — | — | B |

## FastAPI domains

Tests live in `apps/api/fastapi/tests/<domain>/`; each domain's `AGENTS.md` lists its test files. Only events has a measured figure so far.

| Domain | Covered behaviours | Known gaps | Measured coverage |
|---|---|---|---|
| events | Listings and `when` windows (`[start, end)` on Grenada days), RSVP, save and follow, the connection lifecycle, blocks, DM gating, group membership and chat access, the organiser workspace and moderation through the real permission checks | Length of the `month` window is undecided (API 31 days, web "Next 30 days"); profile handle collisions | 91% (statements and branches), `pytest tests/events --cov=src/events`, 2026-10-16; was 78% |
| All others | See the domain's `AGENTS.md` → Tests | Not reviewed | Not measured |

## Agent harness

| Area | Status | Grade |
|---|---|---|
| `AGENTS.md` | Commands-first guardrails and context routing for every supported agent | A |
| `docs/` system of record | Three-view portfolio system plus specialist references | A- |
| Exec plans | Active plan tracked | B |
| CI enforcement of docs | Local file and heading links enforced | B |
| Design-system CI enforcement | Generated blocks and warning contrast enforced | A |
| Dependency direction lints | Not yet implemented | D |

## Priority gaps

1. Shared UI has no tests. `@barrelsgd/ui` feeds every app, so a regression there spreads furthest. `gms`, `theme` and `email-templates` have none either.
2. Coverage is unmeasured outside the events API, and CI has no coverage floor (issue #363).
3. Dependency-direction lints: package and app import boundaries are enforced only by convention.
4. Design system: brand-neutral UI and GMS package separation is in progress.
