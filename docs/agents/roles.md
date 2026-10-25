# Agent roles and automated gates

Factory-control changes may be implemented and merged into dev by agents after
independent code and security review with no open blocking finding and all checks
passing. Staging and production merges remain owner approved. Use existing
subscriptions first with $0 extra spending by default; prefer local execution
and use cloud as fallback. Extra API spending requires owner approval.

The subscription-backed worker runs with
`node scripts/agents/review-worker.mjs --once --merge` and only takes dev PRs
labelled `factory-review` in this repository. It publishes `Factory review` and
`Factory security review` statuses for the exact PR head and current base tip.
Factory-control changes and high risk changes receive security review; other
changes receive an explicit not-required result. A changed head or base needs
new review. Status trust rests on the authenticated GitHub identity running the
worker; it is not cryptographic proof of a reviewer distinct from the author.

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-20

Specialist roles are defined once, as Markdown briefs in `.claude/agents/`. Each
has the tools its job needs and nothing more, and reads the nested `AGENTS.md`
for the code it touches. Both tools use them through the shared `team-roles`
skill (`.claude/skills/team-roles`, which Codex reads as `.agents/skills`):

- **Claude Code** also loads the briefs as native subagents, so it can delegate by name.
- **Codex** uses a fresh native subagent when available, otherwise an isolated
  CLI review session. Capability discovery happens at runtime.

## The team

| Role | Does | Edits files | Model |
| --- | --- | --- | --- |
| `planner` | Product manager and analyst: spec, acceptance criteria, thin slices, open questions | No | opus |
| `architect` | Design options, trade-offs, blast radius, ADR advice | No | opus |
| `api-engineer` | FastAPI routes, services, migrations, OpenAPI and client sync, with tests | Yes | sonnet |
| `web-engineer` | Next.js pages and components against the design lane spec and generated client | Yes | sonnet |
| `qa-engineer` | Failing tests first, edge cases, regression and contract tests | Test files only | sonnet |
| `code-reviewer` | Fresh-context review of a diff: correctness, contract, tests, rules | No | opus |
| `security-reviewer` | Auth, permissions, data exposure, supply chain, migrations | No | opus |

The model column is a cost and quality preference, not a benchmark result.
Planning and review use the stronger model because a wrong plan or a missed
defect costs more than the tokens. Change it in the agent file's frontmatter.

## Handoffs

```text
request → planner (spec, slices)
        → architect (only if schema, API contract or several layers change)
        → qa-engineer (failing tests from the acceptance criteria)
        → api-engineer / web-engineer (make them pass, API first)
        → code-reviewer (+ security-reviewer for auth, access, CI, dependencies)
        → /commit (gates) → PR → subscription-backed review + CI
        → agent merges into dev → dev → staging PR → owner merges into staging
```

Use it for work that spans roles. A small fix needs one role or none. Name the
role ("use the planner", "get a code review") or let the `team-roles` skill
select it. A role sees only the brief you give it, so name the files, the
acceptance criteria and what is out of scope.

Mixing tools is encouraged: a diff written in Codex gets its fresh-context
review in Claude Code, and the reverse. The review worker provides a bounded
subscription-backed bridge when a manual tool switch is unnecessary.

### Which tool for what

Different jobs for each tool, so they do not re-read and redo each other's work.
This covers interactive and review work; unattended routines are routed by area
in [routines.md](routines.md) (`docs/agents/routing.json`).

| Job | Tool | Why |
| --- | --- | --- |
| Plan, spec, orchestrate roles, feature implementation | Claude Code | Owns the branch and the role subagents |
| Fresh-context review of Claude's diff | Codex, read-only | A different model is less likely to wave through its own family's mistakes |
| Fresh-context review of Codex's diff | Claude `code-reviewer` / `security-reviewer` | Same reason, reversed |
| Unattended `area:api` routines | Codex | Cheap tier, owner preference; the Claude routine also takes `area:api` until a Codex task exists ([routines.md](routines.md)) |
| Needs Sentry, PostHog, Cloudflare or the owner's browser | Claude Code | Codex has none of these |
| CI, infra, security changes | Unattended: human writes. Attended: the agent may write, with a `security-reviewer` pass | The owner merges the ones `AGENTS.md` reserves to the owner |

Rules: one author per branch at a time; the author never counts its own review
as the fresh-context one; and a review request carries the handoff block, not the
author's conclusion, so the reviewer is not anchored on it.

**Automating the Codex review.** `pnpm agents:codex-review -- --task "..." --criteria "..."`
builds the handoff block from git and runs `codex exec` in a detached checkout
of that exact head, with a read-only sandbox, an ephemeral session and user
config ignored (so the private Bishop and Playwright MCP servers are not
loaded). Read-only stops shell writes, not reads: the reviewer can still read the
whole disk, which is why `--post` refuses to comment unless the head is pushed,
the PR's head SHA is the reviewed head (a mistyped PR number cannot receive it),
and the findings pass the private-content, vault-path and secret-shape checks.
Those checks fail closed, so a finding that merely mentions a word like "token"
in a `token: value` form is also held back; read it and post it by hand. It prints the
findings; add `--post <pr>` to leave them as a PR comment, and `--dry-run` to see
the command and prompt. It is opt-in per PR because it spends Codex tokens, and
its comment counts as the fresh-context review only when it reports no blocking
finding for the head SHA it names. Running it (with `--post`) is the relay the
section below describes for that one review; every other handoff is still relayed
by the owner. There is no live link between the tools: the script runs one
review and exits.

The runner requires a ChatGPT CLI login and strips inherited API-key variables;
it refuses API-key login rather than enabling extra billing. Results must match
the review JSON schema. An incomplete review, requested changes, malformed
output or a failed CLI exits nonzero. Each attempt first invalidates the previous
local review receipt, so a failed retry cannot leave an earlier approval active.
Completed results are stored in the worktree's Git directory, outside commits.
An exclusive worktree lock prevents overlapping attempts, and a review in
progress cannot satisfy `--check`. If a runner crashes and leaves
`agent-review-receipt.json.lock` in that Git directory, confirm the runner has
stopped before removing the lock and retrying; there is no automatic takeover.

After pushing the reviewed head, run `pnpm agents:codex-review -- --check`.
This spends no model tokens. It requires a completed approval for the exact
head, base tip and merge-base, an integrated remote base, a clean worktree,
the current head verified on the remote, and a passing `verify:changed` receipt.
Any changed commit or base requires a new review. Check GitHub CI separately
before merging; a green advisory AI-review job does not establish that a review
completed. The local receipt is evidence from a trusted runner, not a signed
attestation or a server-enforced merge rule. Do not accept arbitrary uploaded
receipt files or comments as proof of independent review.

### Working with Codex on GitHub

Claude Code and Codex do not share hidden chat state. Automated review uses the
worker; other handoffs remain explicit and self-contained. If the two disagree, the
disagreement first names its evidence and the applicable rule; anything still
unresolved goes to the owner.

1. **Roles.** Claude is the owner's primary interactive agent: it owns feature
   implementation and fixes on its assigned branches. Codex is used for
   automation: unattended routines under [routines.md](routines.md), and review
   when the owner assigns it. In the review role a tool is read-only: it reports
   findings, does not edit, commit, push, merge or deploy, and writes no files,
   including `SESSION_LOG.md`. The tools may swap author and reviewer per task when
   the owner says so.
2. **Integration.** Both tools land work the same way: finish on the assigned
   branch, verify, push that branch and open a PR into `dev`. The agent merges
   its own PR into `dev` once CI is green on the PR head and a fresh-context
   review (the other tool, or a `code-reviewer` subagent) has no open blocking
   finding; no agent pushes `dev`. The author never counts its own review as the
   fresh-context one. This is the attended-session rule in `AGENTS.md` and
   [workflow.md](workflow.md). The `Protect dev` ruleset requires CI and the
   worker's review contexts; the worker also verifies exact base freshness.
3. **Promotion.** Under standing authorization, an agent creates or updates the
   `dev → staging` PR, with a recap of what changed. The owner reviews and merges
   into `staging`; agents do not arm auto-merge, and GitHub merges only once the
   staging ruleset's required checks pass. `staging → main`, releases and
   production deploys need the owner's explicit authorization each time. The
   agent hook allows `gh pr merge` only when the base is `dev`, only in this
   repository, with a pinned head. Factory-control changes require independent
   code and security review and may then merge under the same policy.
4. **Review handoff.** Every request includes the block `pnpm agents:handoff`
   prints (`scripts/agents/review-handoff.mjs`), completed by the author:
   - the task and its acceptance criteria;
   - the branch or PR URL;
   - the exact head SHA and base SHA;
   - the changed files;
   - the test commands, their results and known limitations.
5. **Review.** The reviewer examines exactly that head and base and reports
   actionable findings ranked by severity with `file:line` citations. A review
   applies only to the SHAs it examined. After fixes, the author sends the new
   head SHA, the base SHA and the new test results for re-review.
6. **Session log.** `SESSION_LOG.md` is local and gitignored, so it does not
   synchronize separate cloud environments or machines. The owner relays
   handoffs, or explicitly authorizes a GitHub comment. The reviewer does not
   write to it, an exception that `AGENTS.md` states and that overrides the
   logging requirement there and in [workflow.md](workflow.md); the author records
   the review outcome in its own local log. Never commit the log to synchronize
   agents.
7. **Staging and production.** A review of a deployed environment identifies the
   deployed version where available, and states plainly when it cannot be
   verified. Fixes follow the normal integration and promotion workflow, subject
   to item 3. Production changes require the owner's explicit authorization.

**Configured is not verified.** The hooks in `.claude/settings.json` and
`.codex/config.toml` share scripts in `.claude/hooks/`. That shows they are
configured, not that each client loaded and executed them. Confirm enforcement
per client by triggering a blocked action in a safe context. Likewise, a workflow
file in `.github/workflows/` is not a required merge check until branch
protection or the ruleset lists it; check the ruleset, not the file.

**Automatic Codex PR review is separate.** This manual loop does not depend on
it. Whether the Codex GitHub integration reviews pull requests automatically on
this repository has not been verified; treat it as unavailable until confirmed in
the GitHub and Codex settings.

If a reviewer cannot see a branch, run `git ls-remote origin <branch>` before
changing access settings: the branch may not have been pushed.

## Gates that do not depend on the author

| Gate | Where | Behaviour |
| --- | --- | --- |
| AI review | `scripts/agents/review-worker.mjs` | Subscription-backed review for `factory-review` PRs into `dev`; exact-head code and security statuses, with security review for high risk and factory-control changes. |
| API breaking changes | `.github/workflows/api-breaking-changes.yml`, `scripts/api/check-api-breaking.mjs` | Fails a PR into `dev` that removes a route or method, adds required input, or removes or retypes output. The `breaking-change` label accepts an intended break. |
| Rulesets drift | `.github/workflows/rulesets-drift.yml`, `scripts/guardrails/github-rulesets.mjs` | Fails when GitHub's branch rulesets differ from `infra/github/rulesets.json`. Runs on PRs into `dev`, `staging` and `main`, and weekly. |
| CodeQL | `.github/workflows/codeql.yml` | Static analysis of TypeScript and Python on PRs and `dev` pushes; results go to the Security tab. |
| Secret scan | `.github/workflows/secret-scan.yml` | gitleaks over only the commits a PR or `dev` push adds. |

**Review setup.** Sign the local Codex CLI into ChatGPT and authenticate `gh`.
See [the worker runbook](review-worker.md) for scheduling and recovery.
Run the worker from a reviewed checkout and label eligible PRs `factory-review`.
The legacy API workflow is disabled and its replacement is only a manual
retirement notice. A key alone cannot enable the legacy script: it requires a
separately approved positive API budget. Do not enable extra spending implicitly.
Worker statuses use the local GitHub credential; anyone holding a repository
write credential can publish statuses. A dedicated GitHub App can isolate that
authority later. Never describe these statuses as cryptographic proof.

**Limits.** The reviewer sees the diff and the `AGENTS.md` rules, not the running
system, and it can be wrong; treat findings as claims to check. The breaking
check reads the OpenAPI spec only: it covers removed or changed routes, inputs and
outputs, not behaviour changes behind the same schema, and it is not the full
oasdiff rule set. `infra/github/rulesets.json` lists the checks GitHub
requires, including the factory review contexts on `dev`. Refresh the snapshot
after changing a ruleset.

## Changing a role

Keep each agent file under 40 lines with an explicit tool list.
`scripts/guardrails/agent-roles.test.mjs` checks the set of roles, the
frontmatter, that read-only roles have no edit tools, and that every path an
agent names exists.
