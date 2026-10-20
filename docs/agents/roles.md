# Agent roles and automated gates

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-20

Specialist roles are defined once, as Markdown briefs in `.claude/agents/`. Each
has the tools its job needs and nothing more, and reads the nested `AGENTS.md`
for the code it touches. Both tools use them through the shared `team-roles`
skill (`.claude/skills/team-roles`, which Codex reads as `.agents/skills`):

- **Claude Code** also loads the briefs as native subagents, so it can delegate by name.
- **Codex** has no native subagent step in this setup. The skill tells it to open a
  new task, read the role's brief and follow it, which gives the same clean context.

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
        → /commit (gates) → PR → AI review comment + CI → human merge
```

Use it for work that spans roles. A small fix needs one role or none. Name the
role ("use the planner", "get a code review") or let the `team-roles` skill
select it. A role sees only the brief you give it, so name the files, the
acceptance criteria and what is out of scope.

Mixing tools is encouraged: a diff written in Codex gets its fresh-context
review in Claude Code, and the reverse. The automatic AI review below adds a
third, tool-independent pass.

### Working with Codex on GitHub

Claude Code and Codex do not talk to each other. The owner relays every handoff
between them, so each handoff must stand alone.

1. **Roles.** Claude owns feature implementation and fixes on its assigned
   branches. Codex reviews read-only and reports findings. It does not edit,
   commit, push, merge or deploy unless the owner explicitly changes its role.
2. **Integration.** Follow `AGENTS.md` and [workflow.md](workflow.md). Push a
   feature branch for cross-agent review only when the owner explicitly requests
   that workflow; otherwise completed work merges into local `dev` as usual.
3. **Review handoff.** Every request includes:
   - the task and its acceptance criteria;
   - the branch or PR URL;
   - the exact head SHA and base SHA;
   - the changed files;
   - the test commands, their results and known limitations.
4. **Review.** Codex reviews those exact commits and reports actionable findings
   ranked by severity with `file:line` citations. Claude fixes them and supplies
   the new head SHA. A review applies only to the SHA it reviewed; any new commit
   needs a new review.
5. **Session log.** `SESSION_LOG.md` is local and gitignored. It helps sessions
   that share a filesystem and does not reach another cloud environment. Across
   separate environments the owner relays the handoff, or explicitly authorizes a
   GitHub comment. Never commit the local log to synchronize agents.
6. **Staging and production.** A review of a deployed environment identifies the
   deployed version where available, and states plainly when it cannot be
   verified. Fixes follow the normal integration and promotion workflow.
   Production changes require the owner's explicit authorization.

If a reviewer cannot see a branch, run `git ls-remote origin <branch>` before
changing access settings: the branch may not have been pushed.

## Gates that do not depend on the author

| Gate | Where | Behaviour |
| --- | --- | --- |
| AI review | `.github/workflows/ai-review.yml`, `scripts/ci/ai-review.mjs` | Posts one updated comment on PRs into `dev`. Advisory, never fails the PR. Skips drafts, forks and Dependabot. |
| API breaking changes | `.github/workflows/api-breaking-changes.yml`, `scripts/api/check-api-breaking.mjs` | Fails a PR into `dev` that removes a route or method, adds required input, or removes or retypes output. The `breaking-change` label accepts an intended break. |

**AI review setup.** Add the repository secret `ANTHROPIC_API_KEY`. Without it the
job logs a skip and passes. Set the repository variable `AI_REVIEW_MODEL` to
change the model (default `claude-sonnet-5-5`). The workflow uses
`pull_request_target`, which GitHub runs from the default branch (`main`), so it
never executes PR code; keep it that way. It only starts reviewing PRs once it
has reached `main` through the normal promotion.

**Limits.** The reviewer sees the diff and the `AGENTS.md` rules, not the running
system, and it can be wrong; treat findings as claims to check. The breaking
check reads the OpenAPI spec only: it covers removed or changed routes, inputs and
outputs, not behaviour changes behind the same schema, and it is not the full
oasdiff rule set. Neither gate is a required check yet; make them required in
branch protection once you trust their signal.

## Changing a role

Keep each agent file under 40 lines with an explicit tool list.
`scripts/guardrails/agent-roles.test.mjs` checks the set of roles, the
frontmatter, that read-only roles have no edit tools, and that every path an
agent names exists.
