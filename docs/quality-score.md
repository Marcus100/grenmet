# Quality Score

**Status:** Active reference — test evidence refreshed 2026-10-18 (coverage); other grades not re-audited  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-18

Tracks code and platform quality for each app, package and API domain.

Test evidence is recorded in two forms, kept apart on purpose:

- **Inventory:** how many test files exist and what they exercise. It is a map, not a measure; never grade from file or line counts.
- **Measured coverage:** a number only where someone ran a coverage tool, with the command and date. Anything else says "not measured".

Types, lint, auth, docs and design-system grades use A (solid), B (good, minor gaps), C (functional, needs work), D (stub or incomplete). They were last reviewed on 2026-08-16 and have not been re-audited since. A dash means not graded yet.

## Web apps

Counts are Vitest and Playwright files, counted 2026-10-16.

| App | Test inventory | Where the tests are | Measured coverage | Types | Lint | Auth | Docs | Design system |
|---|---|---|---|---|---|---|---|---|
| gaa-admin | 146 files + Playwright smoke | Module pages, forms, shared layout | Floor only: 64.8 / 63.7 (lines / branches); not re-measured 2026-10-18 | A | A | A | B | B (in progress) |
| auth | 36 files + Playwright smoke | Components, security pages, app hand-off, lib | 79.9 / 71.7 (lines / branches), `vitest run --coverage`, 2026-10-18; floor 79 / 71 | A | A | A | B | C |
| gms | 45 files + Playwright smoke | Lib (16), components, home | 90.3 / 79.4 (lines / branches), `vitest run --coverage`, 2026-10-18; floor 90 / 79 | A | A | B | C | C |
| elections | 37 files | Data loaders (17), routes, learn pages | Not measured | — | — | — | — | — |
| cms | 22 files | Lib, collections, fields, globals, logout-all | Not measured | — | — | — | — | — |
| events | 22 files | Data, community and dashboard components, sign-in | Not measured | A | A | — (app-scoped sessions, ADR-0016; not graded) | B | B |
| signal | 12 files | Lib, components, subscribe route | 64.3 / 55.3 (lines / branches), `vitest run --coverage`, 2026-10-18; floor 64 / 55 | A | A | — (no auth) | B | B |
| mbia | 7 files | Content and flight data, routes | 23.5 / 38.3 (lines / branches), `vitest run --coverage`, 2026-10-18; floor 23 / 38 | A | A | — (public) | C | App-specific |
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

Tests live in `apps/api/fastapi/tests/<domain>/`; each domain's `AGENTS.md` lists its test files. The whole API is measured in CI (below); per-domain figures exist only for events.

| Domain | Covered behaviours | Known gaps | Measured coverage |
|---|---|---|---|
| events | Listings and `when` windows (`[start, end)` on Grenada days), RSVP, save and follow, the connection lifecycle, blocks, DM gating, group membership and chat access, the organiser workspace and moderation through the real permission checks | Length of the `month` window is undecided (API 31 days, web "Next 30 days"); profile handle collisions | 91% (statements and branches), `pytest tests/events --cov=src/events`, 2026-10-16; was 78% |
| All others | See the domain's `AGENTS.md` → Tests | Not reviewed | Not measured per domain; included in the whole-API figure below |

Whole API (all domains, `src/`): 89.6% lines and 74.5% branches from the CI `Run Tests` job on dev, run 39089748804 (2026-10-18), where the floor check printed `ok api lines 89.6% (floor 87.6%)`. Floors are now 89 / 74 (see [testing](testing.md#coverage-floors)).

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
2. Coverage floors are enforced in CI for the whole API. Web floors (auth, gaa-admin, gms, mbia, signal) are checked only when `vitest run --coverage` runs locally: web CI runs tests without coverage, and the cost of adding it is unmeasured (a local gaa-admin coverage run took about 41 minutes). Issue #363 stays open for web CI enforcement. Events, cms, elections, docs and the shared packages have no floor.
3. Dependency-direction lints: package and app import boundaries are enforced only by convention.
4. Design system: brand-neutral UI and GMS package separation is in progress.
