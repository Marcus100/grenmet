# Agent tool usage

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-27

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
| Static sites (Barrels homepage, Babydoll, Elections, Commit) | Cloudflare plugin or the Pages dashboard | Cloudflare Pages builds them from GitHub (`main` is production). The old Vercel projects no longer serve traffic. |
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

### GitHub from a cloud session

`gh pr` and `gh issue` are blocked in the cloud sandbox (they use GraphQL);
`gh api` over REST works. Use these forms, one command per call, with long text
in a file:

| Job | Command |
| --- | --- |
| Open a PR into `dev` | `gh api repos/Marcus100/grenmet/pulls -f title="<title>" -f head=<branch> -f base=dev -F body=@<file>` |
| Read a PR | `gh api repos/Marcus100/grenmet/pulls/<n>` |
| List the checks on a head | `gh api repos/Marcus100/grenmet/commits/<sha>/check-runs --jq '.check_runs[] \| "\(.name) \(.status) \(.conclusion)"'` |
| Read a failed run's log | `gh run view <run id> --log-failed` |
| Comment on a PR or an issue | `gh api repos/Marcus100/grenmet/issues/<n>/comments -F body=@<file>` |
| Merge into `dev` | `gh api -X PUT repos/Marcus100/grenmet/pulls/<n>/merge -f sha=<full head sha> -f merge_method=merge` (alone in its command) |
| List issues by label | `gh api "repos/Marcus100/grenmet/issues?labels=<label>&state=open&per_page=100"` |
| Search open issues | `gh api "search/issues?q=repo:Marcus100/grenmet+is:issue+is:open+<terms>"` |
| File an issue | `gh api repos/Marcus100/grenmet/issues -f title="<title>" -F body=@<file> -f "labels[]=<label>"` |
| Add a label | `gh api repos/Marcus100/grenmet/issues/<n>/labels -f "labels[]=<label>"` |
| Who applied a label | `gh api repos/Marcus100/grenmet/issues/<n>/events` (the `labeled` events name the actor) |

The merge form is the only REST merge the hook accepts, and it meets the same
rules as `gh pr merge` ([workflow.md](workflow.md) → Merging into dev). Other
`gh api` writes to a PR (`PATCH pulls/<n>`, reviews), to refs, tags, file
contents or branch settings are refused. Read issue events with `--paginate`.

### Fast cloud starts: the environment setup script

Paste `scripts/agents/cloud-setup.sh` into the cloud environment's **Setup script** (claude.ai → environment settings), or load the file there. The cloud runs it once, as root, then snapshots the filesystem and starts every later session from that snapshot; it rebuilds the snapshot about every seven days or when the script changes ([cloud environments](https://code.claude.com/docs/en/cloud-environments#environment-caching)). The script makes a shallow copy of the public repo beside the cache (`~/.cache/barrels-bootstrap`), runs `cloud-bootstrap.sh` once to fill the caches (the uv Python and uv cache, Node and pnpm when the image's are too old), keeps the filled pnpm store at `~/.cache/barrels-bootstrap/pnpm-store`, stops the Postgres and Redis it started so the snapshot holds them shut down cleanly, deletes the copy and always exits 0. The clone has a 60 s limit and the whole script a 270 s budget, so it stays under the platform's five-minute snapshot limit. The `SessionStart` hook still runs the bootstrap every session: it hard-links the cached store's package files into the checkout's `.pnpm-store` (where `pnpm-workspace.yaml` keeps it) and gives the checkout its own copy of pnpm's index (`index.db`, which pnpm edits in place) before `pnpm install`, so installs link instead of downloading, and it starts Postgres and Redis, since running servers are not snapshotted. Measured in a clean container: setup 198 s once; a session's bootstrap 14 s with the snapshot, 136 s without.

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

## Heavy commands on the shared WSL machine

Several agents share one WSL machine with limited memory, and parallel test runs or
builds have restarted it before. The rule is one heavy job at a time,
machine-wide. Two small scripts in `~/.local/bin` (outside the repository, set
up per machine) guard against that:

- `heavy <command>` runs the command only when the slot is free and memory is
  available, otherwise it waits. Tests, builds, installs, type-checks, commits
  and pushes go through it: `~/.local/bin/heavy pnpm verify:changed`. One heavy
  command runs at a time (`HEAVY_SLOTS`, default 1), and it waits while available
  memory is below `HEAVY_MIN_MB` (default 3000). Locks live in `HEAVY_LOCK_DIR`
  (default `/tmp/heavy-slots`).
- `memwatch` is an emergency brake that runs in the background. When available memory
  falls under about 1200 MB it pauses the largest test or build process (vitest,
  pytest, next build, tsc, biome, turbo) for 20 seconds and logs it to
  `/tmp/memwatch.log`.

The hooks enforce it, differently in each tool. Claude Code's user hook
(`~/.claude/hooks/auto-heavy.mjs`) wraps a heavy command automatically. Codex's
user hook (`~/.codex/hooks/require-heavy.mjs`) refuses a bare heavy command and
prints the `heavy` form to run instead. Skills and role briefs therefore show
plain commands; on this machine they run through `heavy` either way.

Set `PYTEST_WORKERS=1` for FastAPI tests and pass `--maxWorkers=1` to vitest. If
`heavy` is not on the machine (a cloud session), the repository does not depend
on it; the rule is the same, just not enforced.

### Setting up a machine

`uv run scripts/agents/settings/apply.py` (add `--dry-run` to preview) installs
the Codex command rules (`~/.codex/rules/default.rules`), the Codex heavy hook,
the Codex sandbox settings and the matching Claude Code user settings. It is
safe to run again and backs up every file it changes; see
`scripts/agents/settings/README.md`. A parity test
(`scripts/guardrails/agent-settings-parity.test.mjs`) fails when the Codex rules
and the deny list in `.claude/settings.json` disagree on a dangerous command.

## Waiting for a long job

A wait that reports nothing is the expensive kind of failure: the job looks fine
until it is hours late. Each of these cost an agent real time on 27 November 2026.

- **A watch is not evidence until it has emitted something.** Before reading a
  monitor's silence as "no failures yet", confirm it has produced at least one
  line: a progress monitor piped into `jq` printed `command not found` every 45
  seconds for half an hour, delivered nothing, and the silence was taken for good
  news. Filter for the failure signatures too, not only the success marker — a
  monitor grepping for `passed` alone stays quiet through a crash, a hang and an
  out-of-memory kill, and all three look exactly like "still running".
- **Never poll with a `pgrep` pattern that can match your own command line.**
  `until ! pgrep -f "<command>"` in a shell whose own command line contains that
  string waits for itself forever; one such loop held the single `heavy` slot and
  stalled every job on the machine for twenty-five minutes, and only the owner
  could clear it. Run the gate in the foreground, or poll a log file with a plain
  `sleep` and a bounded number of attempts.
- **`jq` is not installed on this machine.** `gh --jq` works because that is gh's
  own embedded jq; a bare `jq` in a pipeline fails. Use `gh --jq`, or `python3 -c`
  for JSON.

## Worktree sessions

A Claude Code session started in a git worktree refuses some shell forms it cannot
verify stay inside the worktree ("too complex to verify"). Those are heredocs, `;`
or `&&` chains, `for` loops, process substitution (`<(...)`), and `gh` commands with a
long quoted `--body`. In a worktree session:

- Put long text in a file (scratchpad, or the Write tool) and pass it with
  `--body-file` (`gh issue comment`, `gh issue create`, `gh pr create`).
- Run one plain command per Bash call.
- Edit files with Edit or Write, not `cat <<EOF`.

The repo-owned skills follow the same rule: they write the text to a file and
pass `--body-file`, one command per call.

## Keeping the session log short

`SESSION_LOG.md` is shared by every checkout and grows by about 10 KB a day.
`pnpm session-log:archive` lists the entries older than 7 days that it would
move; add `--write` to move them to `SESSION_LOG.archive/<YYYY-MM>.md` (also
gitignored, next to the log in the main checkout). `--days <n>` changes the
window. Nothing is deleted, reruns are safe, and it retries if another agent
appends while it runs. Run it only when no other agent is mid-handoff.
