# Agent run records

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-13

Every agent run, from Claude Code or Codex, leaves one structured comment so the
factory can be measured instead of guessed at. `scripts/agents/run-record.mjs`
builds and validates the comment; `scripts/agents/run-report.mjs` reads them.

## Three kinds of record

| Kind | Posted by | When | Key fields |
| --- | --- | --- | --- |
| `run` | the agent | at the end of every task | `agent`, `model`, `task`, `outcome`, `verify`, `retries`, `wall_minutes`, `tier`, `friction`; optional `pr`, `benchmark` |
| `review` | you | when you merge or close an agent PR | `pr`, `accepted`, `review_minutes` |
| `usage` | you | once a week | `agent`, `week` (like `2026-W42`), `percent` of the plan allowance used |

`outcome` is `success`, `flawed` (shipped but needed rework or left gaps), `blocked`
(missing credential, service or decision) or `manual` (deliberately left for a
human). `verify` is the result of `pnpm verify:changed`: `pass`, `fail` or `skipped`.
`tier` comes from `node scripts/guardrails/risk-tier.mjs --base origin/dev`.
`retries` counts repair attempts after the first try. Use `friction: none` when
there was nothing to report.

## Posting a record

```bash
node scripts/agents/run-record.mjs --kind run --agent claude --model claude-sonnet-5-5 \
  --task "#366" --outcome success --verify pass --retries 0 --wall-minutes 12 \
  --tier standard --pr 371 --post 366
```

Without `--post <number>` the comment body is printed instead, so it can be
reviewed or piped. A review and a weekly usage record look like this:

```bash
node scripts/agents/run-record.mjs --kind review --pr 371 --accepted true --review-minutes 6 --post 371
node scripts/agents/run-record.mjs --kind usage --agent codex --week 2026-W42 --percent 35 --post 1
```

Never put secrets, client data or issue text in a record: it is a public comment.

## Reading the numbers

```bash
node scripts/agents/run-report.mjs                    # everything, read through gh
node scripts/agents/run-report.mjs --only benchmark   # only benchmark runs
node scripts/agents/run-report.mjs --only live        # only real work
node scripts/agents/run-report.mjs --file records.json
```

The report shows runs, success rate, first-pass rate (checks pass with no retry),
accepted-PR rate, mean retries and wall time, review minutes, and plan usage,
split by agent, model and risk tier. A PR counts as accepted when your review
record says so, otherwise when it merged; open PRs are left out of the rate.

Dollar cost is not measured because runs use plan allowances, so compare agents
on accepted-PR rate, first-pass rate, retries, review minutes and plan usage.
