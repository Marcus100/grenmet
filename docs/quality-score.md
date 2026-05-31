# Quality Score

Grades each app and shared package. Updated as work progresses.
Scale: A (solid), B (good, minor gaps), C (functional, needs work), D (stub or incomplete).

Last updated: 2026-05-31

## Web Apps

| App | Tests | Types | Lint | Auth | Docs | Design System | Grade |
|---|---|---|---|---|---|---|---|
| admin-gms | B (Vitest + Playwright) | A | A | A | B | B (in progress) | B+ |
| auth | C (Playwright only) | A | A | A | B | C | B |
| wxwatch | D (none) | A | A | B | B | C | C+ |
| hurricaneplan | D (none) | A | A | B | B | C | C+ |
| spicewx | D (none) | A | A | B | C | C | C |
| wxproducts | C (Vitest config, no tests) | A | A | — | B | C | C+ |
| hr | D (none) | A | A | B | B | C | C |
| salesbus | C (Vitest config, no tests) | A | A | D (not wired) | C | C | D+ |

## Shared Packages

| Package | Tests | Types | Docs | Grade |
|---|---|---|---|---|
| `@grenmet/ui` | D (none) | A | B | C+ |
| `@grenmet/auth` | B (Vitest) | A | A | B+ |
| `@grenmet/api-client` | — (generated) | A | B | A |
| `@grenmet/tsconfig` | — (config only) | — | B | A |

## Agent Harness

| Area | Status | Grade |
|---|---|---|
| `AGENTS.md` | Written, commands-first | A |
| `CLAUDE.md` | Trimmed to 105 lines | A |
| `docs/` system of record | Partially built | B |
| Exec plans | Active plan tracked | B |
| CI enforcement of docs | Not yet implemented | D |
| Dependency direction lints | Not yet implemented | D |

## Priority gaps

1. Test coverage — 5 of 8 apps have no tests at all
2. `salesbus` auth — not wired, intentional for now pending product decision
3. Design system — migration to `@grenmet/ui` in progress, not complete
4. CI docs enforcement — no mechanical check that docs stay current
