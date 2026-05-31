# Tech Debt Tracker

Known debt, tracked continuously. Each item includes why it exists and
what unblocks resolution.

## Open

| Item | Area | Why deferred | Unblocked by |
|---|---|---|---|
| Hono API is a stub | `apps/api/honoapi` | No consumer yet | First feature requiring a BFF |
| `salesbus` auth not wired | `apps/web/salesbus` | App still in early design | Product decision on auth model |

## Resolved

| Item | Resolved | How |
|---|---|---|
| `AGENTS.md` was empty | 2026-05-31 | Written — 78 lines, commands-first, self-contained for Codex |
| `CLAUDE.md` too long (286 lines) | 2026-05-31 | Trimmed to 105 lines, content moved to `docs/` |
| `docs/web/` stubs were empty | 2026-05-31 | Filled — development, deployment, testing docs written |
