# Quality Score

Grades each app and shared package. Updated as work progresses.
Scale: A (solid), B (good, minor gaps), C (functional, needs work), D (stub or incomplete).

Last updated: 2026-08-16 (inventory refreshed; existing grades not fully re-audited)

## Web Apps

| App | Tests | Types | Lint | Auth | Docs | Design System | Grade |
|---|---|---|---|---|---|---|---|
| gaa-admin | B (Vitest + Playwright) | A | A | A | B | B (in progress) | B+ |
| auth | C (Playwright only) | A | A | A | B | C | B |
| docs | D (none) | A | A | B | B | C | C+ |
| gms | D (none) | A | A | B | C | C | C |
| mbia | B (Vitest — content + flight data) | A | A | — (public) | C | App-specific | B |
| events | D (one component test) | A | A | — (prototype) | B | B | D+ |
| signal | B (Vitest — lib + component) | A | A | — (no auth) | B | B | B |

## Shared Packages

| Package | Tests | Types | Docs | Grade |
|---|---|---|---|---|
| `@barrelsgd/gms` | D (none) | A | C | C |
| `@barrelsgd/ui` | D (none) | A | B | C+ |
| `@barrelsgd/auth` | B (Vitest) | A | A | B+ |
| `@barrelsgd/api-client` | — (generated) | A | B | A |
| `@barrelsgd/tsconfig` | — (config only) | — | B | A |

## Agent Harness

| Area | Status | Grade |
|---|---|---|
| `AGENTS.md` | Written, commands-first | A |
| `CLAUDE.md` | Active repository guardrails and context routing | A |
| `docs/` system of record | Three-view portfolio system plus specialist references | A- |
| Exec plans | Active plan tracked | B |
| CI enforcement of docs | Local file and heading links enforced | B |
| Design-system CI enforcement | Generated blocks and warning contrast enforced | A |
| Dependency direction lints | Not yet implemented | D |

## Priority gaps

1. Test coverage — 2 of 7 apps have no tests at all (`docs`, `gms`)
2. Design system — brand-neutral UI and GMS package separation is in progress
3. Dependency direction lints — package and app import boundaries are not mechanically enforced
