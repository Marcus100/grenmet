# Agent workflow rules

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-21

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
- **Local API test selection:** `pnpm verify:changed` runs only the pytest folders
  of the API domains the diff touches (`src/<domain>` maps to `tests/<domain>`).
  `src/auth` and `src/main.py` (shared by every request) run the full suite, and a
  domain with no tests of its own does too. CI runs the full API suite for any code
  change and skips it only for docs-only diffs (see Job scope in `docs/testing.md`).
  Use `pnpm verify:changed --full` before a risky merge. The rules are in
  `scripts/verification/README.md`.
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
  (`gh pr merge <num> --repo Marcus100/grenmet --merge --match-head-commit <full head sha>`); agents never push
  `dev`. Before merging, run `gh pr checks <num> --watch --fail-fast` until it
  exits 0 on that head, and leave the fresh-context review as a PR comment that
  names the reviewer. A `risk:high` PR also gets a `security-reviewer` pass with
  no open finding first. Unattended routines do the same from their own branch.
  A PR that changes an agent-rules or enforcement file follows [Merging into dev](#merging-into-dev)
  below. If `origin/dev` advances, integrate it and revalidate.
  With `CI_PATH_SELECTION=on`, a skipped job on a `dev` PR is intended when the
  path map did not select it (`scripts/ci/select-checks.mjs`); the `ci:full` label runs every check.
- Promotion to staging: the owner decides when a `dev → staging` PR is opened
  (owner, 14 Nov 2026). Agents keep landing work on `dev` and do not open the
  promotion PR on their own after merges. When the owner asks,
  create or update the `dev → staging` PR with a recap, review the promotion diff
  and verify `dev` has not advanced. The owner reviews and merges into `staging`;
  agents do not arm auto-merge. `promote-staging.yml` can open and merge the
  staging PR daily, but it is off unless the owner sets the repository variable
  `PROMOTE_STAGING_ENABLED` to `true` (see
  `docs/operations/staging-promotion-automation.md`); the owner decides, and
  while it is on agents leave the staging PR alone. GitHub merges only after the staging ruleset's
  required checks pass; `CI Success` and `Build Web Apps` aggregate every API and
  web job. The recap flags each contract migration in the promotion diff as
  `⚠ deletes or renames data` (`docs/api/development.md`). If `dev` advances,
  update the recap and tell the owner.
- Monitor the staging deployment and report actionable failures or readiness for
  acceptance. Reuse an open promotion PR. Production (`staging → main`), releases
  and deploys need separate explicit authorization. Do not promote unrelated or
  unfinished work.

**Unattended routines** follow [routines.md](routines.md): they push only
their own `agent/<n>-<slug>` branch, open a PR to `dev`, and never push `dev`,
`staging` or `main`. They merge reviewed PRs into dev under the same checks as
attended sessions, the agent-rules and enforcement-file rules included.

### Merging into dev

The owner's decision of 21 Nov 2026: agents (Claude Code and Codex) automate
the whole process through the merge into `dev`. The owner's first approval is
the `dev → staging` merge; the owner also keeps `main`, releases, production,
secrets, money and deletions.

Every PR, in this order:

1. CI is green on the PR head.
2. A fresh-context review of that head has no open blocking finding, posted as
   a PR comment that names the reviewer. A `risk:high` PR also has a clean
   `security-reviewer` pass, named in the PR body.
3. Merge, pinned to the reviewed head:
   `gh pr merge <num> --repo Marcus100/grenmet --merge --match-head-commit <full head sha>`. In a cloud session
   `gh pr` is blocked, so use the REST form, which the hook checks the same way:
   `gh api -X PUT repos/Marcus100/grenmet/pulls/<num>/merge -f sha=<full head sha> -f merge_method=merge`.
   The other REST forms are in [tool-usage.md](tool-usage.md) → Cloud sessions.
4. Send the owner a phone alert: the PR number, title and link.

The merge command names the repository (`--repo Marcus100/grenmet`), pins the
full 40-character sha of the PR's current head, and runs alone: no other git or
gh command in the same command line.

Files fall into three groups:

| Group | Files | Who merges |
| --- | --- | --- |
| Ordinary | everything not listed below | the agent, under steps 1 to 4 |
| Agent rules | skills, role briefs and anything else under `.claude/` or `.agents/` not listed as enforcement, `docs/agents/`, the root `AGENTS.md`, guardrail tests (`scripts/guardrails/*.test.mjs`) | the agent, after both reviews below |
| Enforcement | `.claude/hooks/`, `.claude/settings.json`, `.codex/`, `.agents/` settings, `.github/` (workflows, dependabot, CODEOWNERS), `infra/github/`, any `CODEOWNERS`, `.husky/`, `.devcontainer/`, `.vscode/`, `.mcp.json`, `.gitleaks.toml`, `skills-lock.json`, the root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `pnpm-lock.yaml`, `scripts/agents/`, `scripts/ci/`, `scripts/production/`, `scripts/ops/`, `scripts/monitoring/`, `scripts/verification/`, the guardrail scripts that are not tests | the owner, always; the hook refuses an agent merge whatever the PR body says |

The lockfile and workspace files are owner-merge on their own, so dependency
bumps, Dependabot's included, go to the owner.
Agents do not edit the hooks, `.claude/settings.json`, `.codex/` or
`scripts/agents/settings/` at all: `protect-files.mjs` refuses it, so the owner
makes those edits by hand. An agent may still prepare the change as a written
proposal or a patch file for the owner.

A PR that changes an **agent rules** file needs both of these first, for the
exact head being merged, as two lines in the PR body, each alone on its line:

```text
Security review: no open findings (<reviewer>, <full 40-character head sha>)
Codex review: no blocking findings (<full 40-character head sha>)
```

- Add the first line only after a Claude `security-reviewer` pass on that head
  reported no open finding.
- Add the second line only after reading Codex's GitHub review of that exact
  head (its review comment names the commit) and finding no blocking finding in
  it. No Codex review of that head means no line and no merge.
- A new push changes the head, so both reviews run again and both lines are
  rewritten with the new sha. The hook compares each line's sha with the merge
  command's sha, and GitHub refuses the merge when that sha is not the head.
- After the merge, send the owner a **separate** phone alert that names the PR
  and lists the agent-rules files it changed.

**Phone alert.** Use the session's push-notification tool when it has one
(Claude Code: `PushNotification`). Where there is none, post the same text as a
comment on the open issue labelled `factory-landed`, which the owner watches in
the GitHub mobile app: write the text to a file and run
`gh api repos/Marcus100/grenmet/issues/<n>/comments -F body=@<file>`.

The body lines are the agent's own record that the reviews happened, which the
hook can check; they are not proof. The backstop is GitHub's branch rulesets,
which agents cannot edit: required CI on `dev`, and `staging` and `main`
protected so only the owner's merge reaches them.

**Rulesets.** `infra/github/rulesets.json` is the committed copy of the branch
rulesets, which are what make "PR required" and "required checks" true.
`pnpm guardrails:rulesets` compares it with GitHub, and
`.github/workflows/rulesets-drift.yml` does the same on every PR into a
long-lived branch and weekly. Today `dev`, `staging` and `main` each require a
PR and the same six checks, with no bypass actors. The review worker's
`Factory review` statuses are advisory: the snapshot does not list them as
required checks, so the reviews in [Merging into dev](#merging-into-dev) are
the agent's duty and the hook's check, not a server rule. If review contexts
are added later they must be pinned to the dedicated status App's integration
ID in both GitHub and the snapshot; do not treat user-created review statuses
as trusted.
After changing a ruleset, run `node scripts/guardrails/github-rulesets.mjs
--snapshot` and commit the result.

## Blast-radius gate

A change is not done when the named file passes `pnpm fix` and `pnpm type-check`.
Run `pnpm guardrails:staged` (FastAPI route or schema changes must be paired with
`openapi.json`; CI runs the same check), then grep for every remaining consumer of
the symbols you touched and verify each affected layer. The script covers one
case, not the general one. The gate finds impact; it does not override explicit
file limits or authorize unrelated work.

Two FastAPI changes need no companions. Startup plumbing in `src/main.py`
(imports, `lifespan`, middleware and exception-handler definitions,
`app.add_middleware` lines) is exempt automatically. A route refactor whose
regenerated `openapi.json` has no diff is declared with the commit trailer
`API-Contract: unchanged` on every commit that touches a route or schema file.
That works in the CI range check only, and CI's OpenAPI regeneration check
still fails the PR if the declaration is wrong. The trailer covers the OpenAPI
contract only: a change in documented behaviour (permissions, status meanings)
still updates `docs/api/contracts.md`.

| If you change… | Also verify… |
| --- | --- |
| A FastAPI route or schema | regen `openapi.json` → `pnpm generate:api-client` → `pnpm check:drift` → `pnpm generate:api-routes`; `docs/api/contracts.md` only for a removed, public, webhook or re-secured route, a breaking change, or a route it already describes (the check names the reason); every web consumer of the generated hook or type |
| A SQLAlchemy model | Alembic revision for the right database (main or `src/<domain>/alembic.ini`); seeds; `openapi.json` if it surfaces in a schema |
| A permission key | `src/auth/permissions.py` catalogue (enforced by `tests/auth/test_permission_registry.py`); UI gating in gaa-admin |
| Auth behaviour (`packages/auth`) | every app using it plus delegating apps (docs, gms via `AUTH_API_URL`) |
| A domain baseline (`src/<domain>/migrations/drizzle-history.json`) | never edit it: it verifies adopted production history; new schema work is a new Alembic revision |
| A consolidated admin route | the other folded modules in gaa-admin |
| A `@barrelsgd/ui` primitive | every app importing it |

## Session handoff

Claude Code and Codex share one working tree on a host or devcontainer; separate
cloud environments do not, so there the handoff travels on the PR: the author
posts the block `pnpm agents:handoff` prints as a PR comment (see
[roles.md](roles.md)). A
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
switches and worktree removals. Input it cannot parse is refused (exit 2),
not waved through. It refuses a `git push` to `dev`, `staging` or
`main` in any form (`origin dev`, `HEAD:dev`, `-u origin main`,
`x:refs/heads/staging`, or a push with no branch named while one of them is
checked out), a tag push (`--tags`, `--follow-tags`, `--mirror`, `refs/tags/`,
`tag <name>`), a remote delete (`--delete`, `-d`, `--prune`, `:branch`),
`--all`, and a destination it cannot read (a variable, a wildcard or a command
substitution); task-branch pushes pass. It reads `git push --repo`, refuses
`git -c alias.*` on any command, `-c` keys that reroute a push, `git config`
writes of alias, push and remote keys, and a bare push while a push refspec or
`push.default matching` is configured. A git push or gh command inside an
inline interpreter script (`python -c`, `node -e`, `perl -e`), `find -exec`,
`xargs`, `parallel`, `su -c` or `docker exec` is refused because the hook cannot
read it. `gh api` writes to a PR's endpoints, refs, tags, file contents or
branch settings are refused (creating a PR and commenting are not), and
`gh pr edit --base` is refused unless it targets `dev`. It also scans
commands inside `bash -c`, `sh -c` and `eval`, with combined or long flags
before `-c` (`bash -lc`, `bash --login -c`). `gh pr merge` is allowed only in
one exact shape, read the way the shell reads it (quotes and line continuations
removed, so `gh pr "merge"` is still a merge; wrappers such as `xargs`, `env`,
`sudo`, `timeout`, `nice` and `heavy`, `if`, `!`, subshells and `-R` before `merge` are
looked through): `gh pr merge <number|url> --repo Marcus100/grenmet [--merge]
[--delete-branch] --match-head-commit <full head sha>`, alone in its command. Anything else blocks: `--admin`,
`--auto`, `--squash`, `--body`, another repository (`-R`, `--repo`, a PR URL,
`GH_REPO`), a chained `gh pr edit --base`, a `cd`, a PR not named in the
command, no `--repo`, or no pinned head. The PR's base must be `dev` and its
current head must equal the pinned sha (base, head and body come from one REST
call); an unknown base, head, file list or PR body blocks, and `staging` and
`main` always block. A PR that changes an enforcement file always blocks; one
that changes an agent-rules file needs both review lines for the head in its
body (see [Merging into dev](#merging-into-dev)). The
REST merge is accepted in one shape only, under the same rules:
`gh api -X PUT repos/Marcus100/grenmet/pulls/<number>/merge -f sha=<full head sha> -f merge_method=merge`
(plus `--jq`, `--silent` or a redirect). `gh alias`, GraphQL merge mutations,
`gh api …/merges` and any other call to a merge endpoint block. Known gaps: a
tag pushed by its bare name (`git push origin v1.2.3`), a bare push after `cd`
into another checkout, a push built by code the hook does not recognise as a
runner (a script file, an obfuscated interpreter call), and edits to the
enforcement files through tools other than Write, Edit, apply_patch and shell
redirects (`cp`, `sed -i`, a script). This is a best-effort filter, not a sandbox: the real controls are
the rulesets, the owner's merge into `staging`, and the permission rules in
`.claude/settings.json` and the Codex command rules
(`scripts/agents/settings/`), which a parity test keeps in step.
`protect-files.mjs` blocks `.env*` writes and edits to the generated API client.
Claude Code also enforces `permissions.deny` in `.claude/settings.json`, which a
hook cannot override. In Codex these hooks sit alongside its own sandbox and
approval policy.
`session-handoff.mjs` prints the newest `SESSION_LOG.md` entries first, capped
under both clients' preview limits. `audit-log.mjs` logs every Bash command to
the main checkout's `.agents-bash-audit.log`, redacting credentials and rotating
at 5 MB.
`verify-before-stop.mjs` (Stop, both clients) sends an agent back once when its
changes since `origin/dev` are neither committed and pushed (GitHub CI then checks
them) nor match the receipt a passing `pnpm verify:changed` writes to the
worktree's git dir; the agent pushes, runs the checks, or says in one line why it
is stopping first. It reads only and never runs a check itself.

For UI work, `pnpm ui:screenshots --app <app> --path <route>` renders a running
dev server at 375 and 1280 px in light and dark mode into `.ui-review/` and flags
horizontal overflow, console errors and failed requests. `/ui-check` feeds the
PNGs to a fresh-context reviewer and repairs at most two rounds per finding.
Codex has a second, per-machine hook for heavy commands; see
[tool-usage.md](tool-usage.md) → Heavy commands.
To extend the git blocklist, edit `DANGEROUS_PATTERNS` in
`block-dangerous-git.mjs` and add a blocking case (and, for phrases that can appear
in quoted text, a non-blocking case) to
`scripts/guardrails/agent-hook-behavior.test.mjs`.
