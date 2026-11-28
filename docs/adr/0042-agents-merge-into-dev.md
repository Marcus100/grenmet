# ADR-0042: Agents merge their own PRs into dev

## Status

Accepted (owner decision, 2026-10-20). Amends [ADR-0041](0041-agent-autonomy.md). Implemented by PR #461.

Amended by owner decision, 21 Nov 2026 (noted 24 Nov 2026): decisions 3 and 6 are narrower now. The owner still merges any PR that changes an enforcement file: hooks, settings, `.codex/`, `.github/`, `infra/github/`, `.husky/`, the root `package.json`, the lockfile, the guardrail scripts and the CI, production and operations scripts. Agent-rule files (skills and role briefs under `.claude/` and `.agents/`, `docs/agents/`, the root `AGENTS.md` and the guardrail tests) may be merged into `dev` by an agent when the PR body carries `Security review: no open findings (<reviewer>, <sha>)` and `Codex review: no blocking findings (<sha>)` for the exact head. Per-area `AGENTS.md` files and the auth permissions module are ordinary code. The lists live in `OWNER_ONLY_PATHS` and `SAFETY_PATHS` in `.claude/hooks/block-dangerous-git.mjs`.

Amended again, 27 Nov 2026 (#1991): agent-rule files are **owner-merge**. The Codex GitHub connector is not connected to this repository, so `Codex review: no blocking findings (<sha>)` can never be obtained and every agent-rules PR was silently unmergeable by an agent (#1853 sat green and stuck for two days). The agent still gets CI green, gets the fresh-context review and records `Security review: no open findings (<reviewer>, <sha>)` for the exact head; the owner is the second reviewer and merges. The point of the second line was a *different* model, since two Claude reviewers share most of their blind spots — connecting the Codex app and reverting this amendment restores that bar. The hook is unchanged: it already refuses an agent merge without both lines.

## Context

The software factory is only useful if every agent starts from the latest `origin/dev`. Until now each agent opened a PR into `dev` and waited for the owner to merge it ([ADR-0041](0041-agent-autonomy.md), decisions 1 and 2). That made the owner a bottleneck for every small change and left the factory working from stale code overnight.

The owner's human gate is the merge into `staging`, which is where real users and deployments begin. ADR-0041 itself says loosening a rule needs a new ADR and a matching hook change made by a human; this is that ADR.

## Decision

1. **Agents merge their own PR into `dev`.** Only when `gh pr checks <num> --watch --fail-fast` exits 0 on the PR head and a fresh-context review (a different agent or tool, named in a PR comment) has no open blocking finding. A `risk:high` PR also needs a `security-reviewer` pass with no open finding. Agents still never push `dev`.
2. **One exact command.** The agent hook accepts only `gh pr merge <number|url> [--repo Marcus100/grenmet] [--merge] [--delete-branch] --match-head-commit <sha>`, for a PR whose base is `dev`. Quoting, wrappers (`xargs`, `timeout`, `if`, subshells), `--auto`, `--squash`, `--admin`, another repository and unreadable GraphQL or REST merge calls are all refused.
3. **The owner merges these**, and the hook refuses an agent's merge of any PR that changes them: `.claude/`, `.codex/`, `.agents/`, `.husky/`, `.github/`, `infra/github/`, `scripts/guardrails/`, `scripts/verification/`, any `AGENTS.md`, the root `package.json`, `docs/agents/routines.md` and the auth permissions module. A PR that renames a file out of one of these paths still counts.
4. **`staging`, `main` and production stay with the owner.** Agents create and update the `dev → staging` PR with a recap and stop. They do not arm auto-merge. `production` already requires the owner's approval to deploy; `staging` should too (GitHub environment setting).
5. **Unattended routines follow the same rule** from their own `agent/<n>-<slug>` branch, and leave any PR labelled `factory` for the owner.
6. **Agents may propose changes to their own rules, never merge them.** Decision 4 of ADR-0041 stands.

## Enforcement and its limits

- The hook is a best-effort filter, not a sandbox. A determined agent could still find a route it does not read, such as a script that merges. The real controls are the GitHub rulesets, the owner's merge into `staging`, and the deployment approval.
- `dev` has no GitHub ruleset today, so nothing but the skill and hook makes an agent wait for CI. `docs/operations/dev-ruleset.md` (added by PR #461) proposes one that requires the same checks as `staging`; the owner applies it. Until then, `git push origin dev` is not blocked by the hook.
- Four review rounds (code and security) shaped the hook; the closed bypasses have tests in `scripts/guardrails/agent-hook-behavior.test.mjs`.

## Consequences

- `origin/dev` always carries the latest reviewed work, so agents stop building on stale code.
- A bad change can now reach `dev` without a human reading it; it still cannot reach `staging` or production without one. The cost of a bad merge into `dev` is a revert.
- The owner's review effort moves to the staging PR, where the recap lists every change by area.
- Changes to the agents' own limits remain a human decision.
