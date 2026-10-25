# Agent workflow rules

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-19

Detail behind the short rules in the root `AGENTS.md`. Read the matching section
before parallel work, integrating or pushing, a cross-layer change, or editing
agent instructions. Nothing here relaxes a root rule.

## Parallel agents and worktrees

- Several agents often run at once: give each its own git worktree and branch
  (Claude: `claude --worktree <topic>`, which creates `.claude/worktrees/<topic>`
  from the current `dev` HEAD; Codex: its worktree mode).
- A new worktree needs `pnpm install --frozen-lockfile`; API work also needs
  `uv sync --frozen --package fast-back --package gms-ingest`, and web
  type-checks need `pnpm turbo run build --filter=@barrelsgd/api-client`.
- A worktree has no gitignored API `.env.local` (only the main checkout does), so API
  tests fail at import with a `Settings` validation error. Prefix API commands with
  `scripts/agents/api-env.sh` (local-development placeholders; values already in
  your environment win; it never writes an env file), for example
  `scripts/agents/api-env.sh uv run --frozen --package fast-back pytest tests/hr -q`.
- If a worktree shows ` T .agents/skills`, that worktree was created by a tool that
  cannot make symlinks (`git worktree add` run inside WSL makes it correctly).
  Run `git restore .agents/skills` there instead of staging or committing the
  typechange; `git rebase` refuses to start while it is dirty.
- Commit in the worktree, validate, push the task branch and open a PR into
  `dev`; the agent merges it once CI is green on its head and a fresh-context
  review has no open blocking finding (`AGENTS.md` → Git, parallel agents and
  handoff). Never push `dev`. Dev servers stay on the host in the main checkout.
- Never hand-merge `openapi.json` or `packages/api-client/src/gen/`: take either
  side and regenerate (openapi command in `AGENTS.md` → `pnpm generate:api-client`
  → `pnpm check:drift`).
- **Shared stashes:** git stashes are shared across worktrees. Record and apply
  the exact stash SHA; never use an implicit latest stash during parallel work.
- **Worktree cleanup:** a clean worktree may still back another live session.
  Confirm session ownership and preserve ignored local files before removal;
  keep uncertain worktrees and never remove another session's working directory.

## Git and GitHub workflow

**Attended sessions** (a person is directing the agent):

- Finish the task on its branch and integrate current `origin/dev`; run
  `pnpm fix:changed`, `pnpm type-check`, affected tests, staged guardrails and
  the blast-radius review. Then push the task branch and open a PR into `dev`
  (`gh pr create --base dev`) with the `/commit` step 7 recap as its body. The
  agent merges its own PR into `dev` once CI is green on the PR head and a
  fresh-context review has no open blocking finding
  (`gh pr merge <num> --merge --match-head-commit <sha>`); agents never push
  `dev`. Before merging, run `gh pr checks <num> --watch --fail-fast` until it
  exits 0 on that head, and leave the fresh-context review as a PR comment that
  names the reviewer. A `risk:high` PR also gets a `security-reviewer` pass with
  no open finding first. Unattended routines do the same from their own branch.
  A PR that changes owner-only files listed in `AGENTS.md` is merged by the
  owner; the hook refuses an agent merge. Other factory-control changes require
  independent code and security review with no open blocking finding before an
  agent merges into dev. If `origin/dev` advances, integrate it and revalidate.
- Standing authorization: once PRs are merged into `dev`,
  create or update the `dev → staging` PR with a recap, review the promotion diff
  and verify `dev` has not advanced. The owner reviews and merges into `staging`;
  agents do not arm auto-merge. GitHub merges only after the staging ruleset's
  required checks pass; `CI Success` and `Build Web Apps` aggregate every API and
  web job. If `dev` advances, update the recap and tell the owner.
- Monitor the staging deployment and report actionable failures or readiness for
  acceptance. Reuse an open promotion PR. Production (`staging → main`), releases
  and deploys need separate explicit authorization. Do not promote unrelated or
  unfinished work.

**Unattended routines** follow [routines.md](routines.md): they push only
their own `agent/<n>-<slug>` branch, open a PR to `dev`, and never push `dev`,
`staging` or `main`. They merge reviewed PRs into dev under the same checks as
attended sessions, except the owner merges PRs that touch owner-only files.

**Rulesets.** `infra/github/rulesets.json` is the committed copy of the branch
rulesets, which are what make "PR required" and "required checks" true.
`pnpm guardrails:rulesets` compares it with GitHub, and
`.github/workflows/rulesets-drift.yml` does the same on every PR into a
long-lived branch and weekly. Today `main` and `staging` each require a PR and
six checks with no bypass actors. `Protect dev` adds the factory code/security
review contexts to those checks, currently allows PR branches to lag behind
`dev`, and blocks force updates and deletion. When dev advances, the review
worker keeps a receipt only for the same merge-base and a disjoint changed-file
set; overlapping changes trigger branch sync and fresh CI. No bypass actors are
configured. Status publishing trusts the worker's GitHub credential; it is not
an independent signing service.
After changing a ruleset, run `node scripts/guardrails/github-rulesets.mjs
--snapshot` and commit the result.

## Blast-radius gate

A change is not done when the named file passes `pnpm fix` and `pnpm type-check`.
Run `pnpm guardrails:staged` (FastAPI route or schema changes must be paired with
`openapi.json`; CI runs the same check), then grep for every remaining consumer of
the symbols you touched and verify each affected layer. The script covers one
case, not the general one. The gate finds impact; it does not override explicit
file limits or authorize unrelated work.

| If you change… | Also verify… |
| --- | --- |
| A FastAPI route or schema | regen `openapi.json` → `pnpm generate:api-client` → `pnpm check:drift`; `docs/api/contracts.md`; every web consumer of the generated hook or type |
| A SQLAlchemy model | Alembic revision for the right database (main or `src/<domain>/alembic.ini`); seeds; `openapi.json` if it surfaces in a schema |
| A permission key | `src/auth/permissions.py` catalogue (enforced by `tests/auth/test_permission_registry.py`); UI gating in gaa-admin |
| Auth behaviour (`packages/auth`) | every app using it plus delegating apps (docs, gms via `AUTH_API_URL`) |
| A domain baseline (`src/<domain>/migrations/drizzle-history.json`) | never edit it: it verifies adopted production history; new schema work is a new Alembic revision |
| A consolidated admin route | the other folded modules in gaa-admin |
| A `@barrelsgd/ui` primitive | every app importing it |

## Session handoff

Claude Code and Codex share one working tree on a host or devcontainer; separate
cloud environments do not, so there the owner relays handoffs
(`pnpm agents:handoff` prints the block; see [roles.md](roles.md)). A
`SessionStart` hook tails `SESSION_LOG.md` (main checkout root, gitignored,
shared by every worktree) into context; read it before assuming a task is
untouched. After a meaningful chunk of work, append one entry: timestamp, tool,
summary, files, friction issues, next step, newest at the bottom. A read-only
reviewer appends nothing; the author records the review outcome (`AGENTS.md`).
If you worked around anything, run the `file-friction` skill. For tool switches,
follow [tool-usage.md](tool-usage.md).

### Context reset

Long sessions get slower, dearer and forgetful: auto-compaction is lossy, and
practitioner guides put the quality drop-off well before the window fills (about
60%; a heuristic, not a measured limit). So:

- **One session, one task.** Start a fresh session after each merged PR and
  whenever the work changes area. Do not carry a finished task into the next one.
- **Reset at about 60% context**, or when you notice the signs: forgetting a
  decision made earlier, contradicting yourself, or rewriting code already
  validated. Do not start a multi-file change in a session that is already long.
- **Before resetting, write the handoff** to `SESSION_LOG.md`: at most 10 lines
  covering state (branch, head SHA, PR), what is done, what is next, and open
  decisions. Put detail in the PR body or an issue, not the log. The next session
  reads the tail of the log and the PR, not the old transcript.
- Anything that must survive every reset goes in `AGENTS.md`, a hook or a test,
  not in the conversation.

## Editing agent instructions

- Keep the root `AGENTS.md` a short map (about 10 KB): commands, hard rules,
  the instruction map and links. Research on repository context files found that
  extra requirements lower agent success and raise cost, so add a root rule only
  when an agent got it wrong without it and the code cannot show it.
- Put directory rules in nested `AGENTS.md` files and update the instruction map;
  put operational detail in a doc under `docs/` and link it.
- A rule that must hold every time belongs in a hook or a test, not in prose.
- Codex reads the root file and each nested file down to the working directory up
  to `project_doc_max_bytes` in `.codex/config.toml`;
  `scripts/guardrails/check-agent-config.test.mjs` checks every chain fits.
- Record durable domain rules in domain docs and durable agent conventions in the
  relevant `AGENTS.md`; ask only when the lasting rule or its scope is ambiguous.

## Hooks

Hook scripts live in `.claude/hooks/` and are wired in `.claude/settings.json`
(Claude Code) and `.codex/config.toml` (Codex), so one script serves both tools.
`block-dangerous-git.mjs` blocks force pushes (`--force`, `-f`, `+ref`),
`git reset --hard`, `git clean -f`, forced branch deletes, `git checkout .`,
`git restore .` (unstaging with `--staged` is allowed), `git stash clear`, forced
switches and worktree removals, and merges through `gh api`. It also scans
commands inside `bash -c`, `sh -c` and `eval`. `gh pr merge` is allowed only in
one exact shape, read the way the shell reads it (quotes and line continuations
removed, so `gh pr "merge"` is still a merge; wrappers such as `xargs`, `env`,
`sudo`, `timeout` and `nice`, `if`, `!`, subshells and `-R` before `merge` are
looked through): `gh pr merge <number|url> [--repo Marcus100/grenmet] [--merge]
[--delete-branch] --match-head-commit <sha>`. Anything else blocks: `--admin`,
`--auto`, `--squash`, `--body`, another repository (`-R`, `--repo`, a PR URL,
`GH_REPO`), a chained `gh pr edit --base`, a `cd`, a PR not named in the
command, or no pinned head. The PR's base must be `dev`; a PR that changes
owner-only paths listed in `AGENTS.md`, an unknown base or file list blocks,
and `staging` and `main` always block. `gh alias`, GraphQL
merge mutations, `gh api …/merges` and the REST merge endpoint block too. This
is a best-effort filter, not a sandbox: the real controls are the rulesets, the
owner's merge into `staging`, and the permission rule in the user's settings.
`protect-files.mjs` blocks `.env*` writes and edits to the generated API client.
Claude Code also enforces `permissions.deny` in `.claude/settings.json`, which a
hook cannot override. In Codex these hooks sit alongside its own sandbox and
approval policy.
`session-handoff.mjs` prints the newest `SESSION_LOG.md` entries first, capped
under both clients' preview limits. `audit-log.mjs` logs every Bash command to
the main checkout's `.agents-bash-audit.log`, redacting credentials and rotating
at 5 MB.
`verify-before-stop.mjs` (Stop, both clients) sends an agent back once when its
changes since `origin/dev` don't match the receipt a passing `pnpm verify:changed`
writes to the worktree's git dir; the agent runs the checks or says in one line
why it is stopping first. It reads only and never runs a check itself.

For UI work, `pnpm ui:screenshots --app <app> --path <route>` renders a running
dev server at 375 and 1280 px in light and dark mode into `.ui-review/` and flags
horizontal overflow, console errors and failed requests. `/ui-check` feeds the
PNGs to a fresh-context reviewer and repairs at most two rounds per finding.
To extend the git blocklist, edit `DANGEROUS_PATTERNS` in
`block-dangerous-git.mjs` and add a blocking case (and, for phrases that can appear
in quoted text, a non-blocking case) to
`scripts/guardrails/agent-hook-behavior.test.mjs`.
