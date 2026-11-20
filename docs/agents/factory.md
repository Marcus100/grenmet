# The software factory

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-19

How agent work in this repository is defined, run, measured and improved. Each
layer is a file or a command in this repository, so the factory itself is
versioned, reviewed and testable like any other code.

## Layers

| Layer | What it is here | Where |
| --- | --- | --- |
| Definition | Rules, role agents (with their models), skills, hooks, mirrored for Codex | `AGENTS.md`, `.claude/agents/`, `.claude/skills/`, `.claude/settings.json`, `.codex/config.toml` |
| Intake | GitHub issues with `ready-for-agent` and one `area:` label, claimed with a lock ref | [triage-labels.md](triage-labels.md), `scripts/agents/claim-issue.mjs` |
| Orchestration | Stage skills (triage → spec → implement → review → verify → ship) and role briefs | [roles.md](roles.md), `team-roles`, `commit`, `release` skills, `verify:changed` + Stop hook |
| Compute | Local worktrees, the agent devcontainer, cloud routines | [workflow.md](workflow.md), [routines.md](routines.md), `.devcontainer/` |
| Routing | Which agent and model takes which area, from benchmark results | [routines.md](routines.md) → routing, `docs/agents/routing.json` |
| Data | Session transcripts both tools already keep on this machine | `pnpm agents:sessions` |
| Metrics | Changes merged, reverts, lead time, tokens and human prompts per change; merge into `dev` → live on production, releases per week, failed deploys | `pnpm agents:flow`, `pnpm agents:delivery`, `pnpm agents:report` |
| Scoring | LLM-as-judge verdicts on sampled past sessions, one rubric per scorer | `pnpm agents:score`, `scripts/agents/scorers/*.md` |
| Skill evals | Does each skill fire on the prompts it should, and not on near-misses | `pnpm agents:skill-evals` |
| Benchmarks | 25 fixed tasks graded by hidden tests, per agent and model | [benchmarks/](benchmarks/README.md) |
| Self-improvement | Repeated failures become one reviewed change to the factory | `pnpm agents:improve`, `factory-improve` skill |

## Local reporting and judge inputs

The flow report reads repository transcripts from the workstation and computes
its metrics locally. The delivery report uses Git history and GitHub release and
workflow metadata. The score report reads stored verdicts. Transcript content
stays on the workstation during these report commands.

`scripts/agents/sessions.mjs` reads transcripts from:

- Claude Code at `~/.claude/projects/<repo path slug>*/*.jsonl`, including
  worktrees and subagents.
- Codex under `$CODEX_HOME`, `~/.codex/sessions/` and, in WSL, the desktop
  app's `/mnt/c/Users/*/.codex/sessions/`.

Generating a new verdict with `pnpm agents:score run` sends a bounded digest
to the selected judge command. With the configured Claude Code or Codex judge,
its model provider receives that input. A digest can contain human prompts,
shell commands, file paths and final replies. Treat it as session data when
deciding which provider may receive it. The `--dry-run` option lists work
without invoking a judge. See the [session digest](../../scripts/agents/sessions.mjs)
and [scoring command](../../scripts/agents/score-sessions.mjs).

By default, verdicts go to `~/.cache/grenmet-factory/scores.jsonl` and skill-evaluation
results go to `~/.cache/grenmet-skill-evals/results.jsonl`. Verdict records
can include evidence or suggestions based on session content. The repository
keeps derived numbers and paraphrased lessons. Vendor-hosted sessions stay with
their vendor and are outside the local transcript totals. Their PRs and run
records still count where those sources are used.

## Measures

`pnpm agents:flow --days 14` counts a **change** as one merge (or direct
commit) on `origin/dev`'s first-parent history: each merged PR is one merge
commit, and older history also holds branches merged locally and direct
commits. It reports:

- changes merged, reverts and revert rate;
- lead time from a branch's first commit to its merge;
- per merged change: agent tokens, human prompts and active agent hours (window
  totals divided by changes), plus a weekly trend and tokens by model.

Tokens are the cost unit because runs use plan allowances; the benchmark
reports API-equivalent dollars where the CLI provides them. Per-change
attribution follows the branch a session recorded, so work done on `dev` itself
shows in the totals but not against a branch.

`pnpm agents:delivery --days 30` picks up where `agents:flow` stops: for each
production release it counts the pull requests merged into `dev` since the
previous release tag and reports how long they took from merge to live on
production (the `pipeline-prod.yml` finish time), plus publish → live, releases
per week, failed or cancelled production deploys, and follow-up releases within
a day (a rough sign of a fix-up; planned back-to-back releases count too).
A change is any pull request merge between two release tags, so a hotfix merged
straight into `staging` or `main` counts too; promotion merges from `dev`,
`staging` or `main` do not. A re-run deploy uses the latest run's finish time.
It reads `gh release list`, `gh run list` and git tags, and runs
`git fetch --tags` first.

## Scorers

A scorer is a Markdown file in `scripts/agents/scorers/` with `name`,
`description`, `sample` (share of sessions to judge, 0–1) and `min_tools`
(skip smaller sessions), then a rubric with **Pass**, **Fail** and
**Not applicable** rules. Editing a rubric gives it a new version, so old
verdicts never mix with new ones. To add one, copy an existing file, keep the
three rules concrete, and run `node --test scripts/agents/score-sessions.test.mjs`.

```bash
pnpm agents:score run --days 7 --limit 10      # sample and judge (Haiku by default)
pnpm agents:score run --dry-run                # list what would be judged
pnpm agents:score report --days 30             # pass rate per scorer and week
```

The built-in judges use a temporary empty working directory and scrub API
keys from the environment. The Claude command disables tools, provides an
empty MCP configuration, skips normal setting sources and disables session
persistence. The Codex command requests an ephemeral, read-only session.
Codex can still read its normal local configuration.

If Claude reports `Failed to authenticate`, log the WSL CLI in again with
`claude auth login`. `CLAUDE_BIN` overrides the binary.

## The weekly loop

Once a week, in an attended session:

1. Run the `factory-improve` skill (`/factory-improve`). It reads flow and
   stored verdicts with `agents:score report`, then uses `pnpm agents:improve`
   to group failing verdicts, skill-trigger misses and open friction issues
   that repeat at least three times.
2. It picks the top problem with a cause in the repository and makes one small
   change to a skill, an `AGENTS.md` rule, a scorer or a check, with a
   regression case.
3. Agents may implement and merge factory-control changes into dev after
   independent code and security review and all checks pass, except for the
   owner-only paths listed in `AGENTS.md`; only the owner merges those. Staging
   and production merges remain owner approved.
4. Next week's `agents:score report` shows whether that scorer's pass rate
   moved.

Benchmarks and skill evals require approval for extra API spending; rerun them when a model, skill or
`AGENTS.md` changes a lot, then `pnpm agents:routing write` to refresh routing.

Execution uses existing subscriptions first with $0 extra spending by default.
Prefer local execution; use cloud as fallback. Extra API spending requires owner
approval, including scorer, benchmark and skill-eval runs that incur charges.
