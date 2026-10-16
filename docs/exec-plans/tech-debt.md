# Tech Debt Tracker

**Status:** Working plan  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-15

Known debt, tracked continuously. Each item includes why it exists and
what unblocks resolution.

## Open

| Item | Area | Why deferred | Unblocked by |
|---|---|---|---|
| `@barrelsgd/ui` and other shared packages have no tests | `packages/ui`, `gms`, `theme`, `email-templates` | Not yet prioritised | Component test harness for `packages/ui` |
| Import boundaries are not enforced | `apps/*`, `packages/*` | Not yet prioritised | Dependency-direction lint (see `docs/quality-score.md`) |

## Resolved

| Item | Resolved | How |
|---|---|---|
| Hono API was a stub | 2026-09-23 | Retired; FastAPI is the backend ([ADR-0015](../adr/0015-retire-hono-python-backend.md)) |
| `salesbus` auth not wired | 2026-06 | App decommissioned — folded into `gaa-admin` during the consolidation |
| `AGENTS.md` was empty | 2026-05-31 | Written — 78 lines, commands-first, self-contained for Codex |
| `CLAUDE.md` too long (286 lines) | 2026-05-31 | Trimmed to 105 lines, content moved to `docs/` |
| `docs/web/` stubs were empty | 2026-05-31 | Filled — development, deployment, testing docs written |
