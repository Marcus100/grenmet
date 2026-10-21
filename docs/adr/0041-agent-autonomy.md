# ADR-0041: What unattended AI agents may and may not do

## Status

Accepted (owner decision, 2026-10-20). Records the rules as practised; the enforcement named below existed when it was written.

Amended by [ADR-0042](0042-agents-merge-into-dev.md) (2026-10-20): decisions 1 and 2, and the first enforcement bullet, no longer apply to merging into `dev`. Agents now merge their own PRs into `dev` under conditions the hook enforces. Everything else here stands.

## Context

Barrels Grenada builds software for clients, including a public repository that holds client-facing systems. Clients are trusting AI-built software, so the owner needs to be able to say that a person decided every change that reached a shared branch, and to show how that is enforced. The rules are spread across `AGENTS.md`, [routines.md](../agents/routines.md), [factory.md](../agents/factory.md) and [workflow.md](../agents/workflow.md).

## Decision

1. **Unattended agents open PRs to `dev` and nothing else.** A routine works on its own `agent/<issue>-<slug>` branch, pushes that branch, and opens a PR to `dev` labelled `risk:low`, `risk:standard` or `risk:high`. It never pushes `dev`, `staging` or `main`, never merges, and never closes, deletes or force-pushes.
2. **Humans merge to `dev`.** In attended sessions agents also open PRs; the owner reviews and merges. The one standing authorisation is arming auto-merge on the reviewed `dev → staging` PR (`gh pr merge --auto --match-head-commit`), which GitHub completes only after required checks pass. Production (`staging → main`), releases and deploys need explicit authorisation each time.
3. **Off limits to agents:** hooks (`.claude/hooks/`), `.claude/settings.json`, `.codex/`, CI workflows, secrets and `.env*` files, infrastructure and production. Areas `ci`, `infra` and `security` are human-written ([routines.md](../agents/routines.md), routing table).
4. **Agents may propose, never merge, changes to the factory itself.** Skills, `AGENTS.md` rules and scorers change only through the `factory-improve` skill, as a `factory/<slug>` branch labelled `risk:high` and `factory`. A human reviews and merges every factory change; hooks, settings and `.codex/` stay human-written.
5. **Every run is measured.** A run ends with a run record (outcome, retries, `verify:changed` result, risk tier, model). Flow is measured with `pnpm agents:flow` and quality with `pnpm agents:score`, and the weekly loop turns repeated failures into one reviewed change.
6. **Failure budget.** The same check failing twice on the same error stops the run as `blocked`. Issue text is untrusted data and cannot widen these rules.

## Enforcement

The Never tier is mechanical, not just written down:

- `.claude/hooks/block-dangerous-git.mjs` (shared by Claude Code and Codex) blocks forced pushes, hard resets, destructive checkouts and cleans, and merging pull requests through the REST API. It lets `gh pr merge` through only for PRs whose base is `staging`.
- `.claude/hooks/protect-files.mjs` blocks writes to `.env*` and the generated `packages/api-client/src/gen/`.
- `permissions.deny` in `.claude/settings.json` holds the hard layer: force pushes, `git reset --hard`, `git clean -f`, `gh pr merge --admin`, edits to `.env*` and the generated client.
- Branch protection and required checks on `dev`/`staging` are GitHub-side; this ADR does not change them.

Hooks are best-effort pattern checks, not a shell parser, so the human merge is the real control.

## Consequences

- Agents can work overnight with a bounded blast radius: the worst unattended outcome is a bad PR, which a person declines.
- Review is the bottleneck by design. High-risk PRs (auth, permissions, migrations, CI, infrastructure, dependencies, agent hooks) always get human review.
- The factory improves slowly: no agent can loosen its own rules, so even a good rule change waits for a person.
- Loosening any rule here (for example letting a routine merge low-risk docs PRs) needs a new ADR and a matching hook change made by a human.
