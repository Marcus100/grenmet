# Agent roles and automated gates

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-19

Claude Code can delegate to specialist agents defined in `.claude/agents/`. Each
has the tools its job needs and nothing more, and reads the nested `AGENTS.md`
for the code it touches. Codex does not read this folder; it uses the skills in
`.agents/skills` and the same `AGENTS.md` files.

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

Use it for work that spans roles. A small fix needs one agent or none. Ask
Claude Code to "use the planner agent" or name the role; subagents see only
the brief you give them, so name the files, the acceptance criteria and what
is out of scope.

## Gates that do not depend on the author

| Gate | Where | Behaviour |
| --- | --- | --- |
| AI review | `.github/workflows/ai-review.yml`, `scripts/ci/ai-review.mjs` | Posts one updated comment on PRs into `dev`. Advisory, never fails the PR. Skips drafts, forks and Dependabot. |
| API breaking changes | `.github/workflows/api-breaking-changes.yml`, `scripts/api/check-api-breaking.mjs` | Fails a PR into `dev` that removes a route or method, adds required input, or removes or retypes output. The `breaking-change` label accepts an intended break. |

**AI review setup.** Add the repository secret `ANTHROPIC_API_KEY`. Without it the
job logs a skip and passes. Set the repository variable `AI_REVIEW_MODEL` to
change the model (default `claude-sonnet-5-5`). The workflow uses
`pull_request_target` so it runs from the base branch and never executes PR
code; keep it that way. It only starts reviewing PRs once it is on `dev`.

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
