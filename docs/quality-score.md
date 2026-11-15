# Quality Score

**Status:** Active reference — test evidence refreshed 2026-10-18 (coverage); design grades for bookings, babydoll and `@barrelsgd/bookings-web` audited 2026-11-15; other grades not re-audited  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-15

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
| `@barrelsgd/bookings-web` | 5 files (`src/lib`, `src/components`) | Not measured | A | B |
| `@barrelsgd/email-templates` | None | — | — | — |
| `@barrelsgd/tsconfig` | — (config only) | — | — | B |
| `@barrelsgd/cms-migrations` | — (migrations only) | — | — | — |

## Design audit grades

Grades come from a read-only design audit, not from tests or counts. Each surface is judged against its own lane spec in [`docs/design/`](design/) and the design skills' rules (accessibility, mobile feel, interface craft, hierarchy), never against another app. Saved reference flows (Fresha booking and agenda, GoDaddy date and time) are used for ideas only. Scale: A solid, B good with minor gaps, C functional and needs work, D stub or incomplete. The findings behind each grade are in the audit documents.

| Surface | Design grade | Audited | How it was graded | Audit |
|---|---|---|---|---|
| bookings (public booking pages and Studio) | B | 2026-11-15 | Code read against `docs/design/bookings.md`; staging screenshots at 390 px and 1280 px (light, plus dark to confirm the light-only rule); the Studio signed-in on staging where reachable, otherwise code only. Strong on accessibility, forms and states; gaps in step layout, repeated content and a customer dead end for reaching the business. | [bookings audit](design/audits/bookings-2026-11.md) |
| babydoll (Babydoll Beauty Bar site) | B | 2026-11-15 | Code read against `docs/design/babydoll.md`; one visit per page to the public production site at 390 px and 1280 px. Strong brand craft; gaps in the service tabs (all panels show at once), touch targets, small text, one low-contrast control and missing photography. | [babydoll audit](design/audits/babydoll-2026-11.md) |
| `@barrelsgd/bookings-web` | B | 2026-11-15 | Component code read against the package contract and the bookings lane spec, and seen through the bookings app's stylesheet. Strong semantics and error handling; gaps in stale error text, the contact contract and unused class names. | [bookings audit](design/audits/bookings-2026-11.md) |

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
| Dependency direction lints | `check-boundaries.mjs`: app/package direction, Sentry, brand-neutral UI, DB clients in route handlers | B |

## Priority gaps

1. Shared UI has no tests. `@barrelsgd/ui` feeds every app, so a regression there spreads furthest. `gms`, `theme` and `email-templates` have none either.
2. Coverage floors are enforced in CI for the whole API and for web apps admin, auth, bookings, cap, events, gms, gmsdash, mbia and signal (`web-coverage` job in `ci-web.yml`). gaa-admin's floor is checked only locally: a full run takes about 41 minutes, so it is not in CI yet. Events, cms, elections, docs and the shared packages have no floor.
3. Design system: brand-neutral UI and GMS package separation is in progress.
