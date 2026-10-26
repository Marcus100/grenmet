# Agent tool usage

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-19

- When the user wants to inspect a file, return full contents — not a summary.
- Before investigating a CI or build failure, list the top hypotheses with the
  fastest falsification command for each; test cheapest first and report after each.
- For multi-file changes, trace impact across types, config, and related files first.
- When delegating to a sub-agent, include the Blast-Radius Gate and the relevant
  nested `AGENTS.md` paths in its brief — it starts cold.

## Browsers, MCP servers and plugins

Pick the cheapest tool that answers the question, in this order:

| Need | Tool | Notes |
| --- | --- | --- |
| Render pages and catch overflow, console errors and failed requests | `pnpm ui:screenshots` | Local: `--app <app>` (dev server on the host). Staging: `--url https://<app>.staging.barrels.gd`. Both agents. |
| Click through a public flow (forms, menus, multi-step pages) | Playwright MCP (`playwright`) | User-scope, pinned `@playwright/mcp@0.0.83`, headless and `--isolated`. Configured in `~/.claude.json` and `~/.codex/config.toml`; reuses the repo's Chromium build via `--executable-path`. Both agents. |
| Check a page that needs the owner's sign-in (gaa-admin, admin, account pages) | Claude in Chrome | Claude only. Uses the owner's signed-in browser. Never type passwords, codes or keys; if a login is needed, stop and ask the owner to sign in. |
| Production and staging errors | Sentry plugin | Read first; change alerts or settings only on request. |
| Analytics, flags, session replays | PostHog plugin | Read-only by default. Never copy personal data into the repo or logs. |
| DNS, Email Routing, Access, CAA, DMARC | Cloudflare plugin | Show each change and get approval before applying. |
| Babydoll and other Vercel-hosted sites | Vercel connector | Deploys go through it (the Vercel team has no GitHub integration). |
| Private context | Bishop MCP (`bishop`) | Read-only; never copy results into commits (see below). |

`ui:screenshots` dark captures force the `dark` class onto `<html>`. Apps
without a theme switch (`docs`) are light-only for real visitors, so ignore
their dark captures instead of "fixing" them.

Codex has Playwright and Bishop but not Claude in Chrome or the claude.ai
plugins (Sentry, PostHog, Cloudflare); a Codex session that needs those hands
the step to the owner or to a Claude session.

## Cloud sessions

Claude Code cloud containers ship a toolchain older than the repo's pins. `scripts/agents/cloud-bootstrap.sh` runs as a `SessionStart` hook for cloud sessions (`CLAUDE_CODE_REMOTE=true`), is idempotent, never edits tracked files and always exits 0. Run it by hand with `--dry-run` to list the steps. It:

| Problem in the image | What the script does |
| --- | --- |
| uv cannot install the pinned Python (`.python-version`) | upgrades uv through pip and shadows the old one on `PATH` |
| Node is older than `engines.node` | downloads the matching Node release into `~/.cache/barrels-bootstrap` |
| `pnpm` re-execs into a placeholder tool shim (turbo fails with `Exec format error`) and rewrites `pnpm-lock.yaml` | installs the pinned `@pnpm/exe` and exports `npm_config_manage_package_manager_versions=false` |
| `uv sync --package fast-back` misses `gms-ingest` | syncs both packages |
| no Postgres or Redis for API tests | starts both on `localhost`, creates the `app` role and database; Redis runs with `--dir /tmp --save ""` so no `dump.rdb` lands in the repo |

Hooks still run (never bypass them): with the bootstrap done, `git push` runs lint, type-check and the changed packages' tests. If `pnpm-lock.yaml` shows as modified after a gate, the bootstrap did not run in that shell; restore it with `git checkout -- pnpm-lock.yaml` before committing and do not commit it.

## Switching between Codex and Claude Code

Before a handoff, append the current task, checkout path, branch, changed files,
checks and their results, friction issues filed, outstanding decisions, and exact next action to the
main checkout's `SESSION_LOG.md`. Read the latest file before appending; preserve
other entries. Update durable knowledge in Bishop when it belongs there and the
workspace is accessible; keep private context out of this public repository.
Where the `bishop` MCP server is configured, agents may search Bishop read-only
and use the results in conversation, never in commits. The pre-commit hook runs
`pnpm guardrails:private`, which rejects staged Bishop vault content (Obsidian
wikilinks, vault note frontmatter, vault folder layout); a test scans the whole
tracked tree for the same markers.

The receiving agent reads that entry, applicable AGENTS files and the current
Git status/diff before continuing. Use the same checkout for sequential work;
use separate worktrees for simultaneous edits. Confirm which worktree contains
uncommitted changes before switching. Never infer completed work from a handoff
without checking the files. If the handoff is missing, reconstruct what can be
verified and ask only about unresolved intent.

The SessionStart hooks read recent log entries; they do not create the handoff
or share hidden chat history. Claude also reloads the log after compaction and
forking. Runtime hook trust and client permissions remain separate checks.

## Worktree sessions

A Claude Code session started in a git worktree refuses some shell forms it cannot
verify stay inside the worktree ("too complex to verify"). Those are heredocs, `;`
or `&&` chains, `for` loops, process substitution (`<(...)`), and `gh` commands with a
long quoted `--body`. In a worktree session:

- Put long text in a file (scratchpad, or the Write tool) and pass it with
  `--body-file` (`gh issue comment`, `gh issue create`, `gh pr create`).
- Run one plain command per Bash call.
- Edit files with Edit or Write, not `cat <<EOF`.

The skills that show inline `--body "$(cat <<'EOF' ...)"` examples need the same
change; they live under `.claude/`, so that edit goes through the owner.

## Keeping the session log short

`SESSION_LOG.md` is shared by every checkout and grows by about 10 KB a day.
`pnpm session-log:archive` lists the entries older than 7 days that it would
move; add `--write` to move them to `SESSION_LOG.archive/<YYYY-MM>.md` (also
gitignored, next to the log in the main checkout). `--days <n>` changes the
window. Nothing is deleted, reruns are safe, and it retries if another agent
appends while it runs. Run it only when no other agent is mid-handoff.
