---
name: factory-improve
description: "Runs the factory's self-improvement loop: scores recent agent sessions with the LLM-judge scorers, groups repeated failures, skill-trigger misses and friction into a brief, and proposes the smallest change to a skill, AGENTS.md rule, scorer or check that would stop the top problem recurring. Use when the user asks to improve the factory or the agents, review agent quality, act on scorer results, or runs the weekly factory review."
---

# Factory improve

Fix the factory, not the symptom: one repeated failure becomes one small,
reviewed change to the instructions or checks every later session reads.

## 1. Measure

Run exactly, from the repository root:

```bash
pnpm agents:flow --days 14
pnpm agents:score report --days 30
pnpm agents:improve --days 30 --min 3
```

Use stored scorer verdicts by default. Run `agents:score run` only through an
existing subscription or after explicit approval for extra API spending.
If `agents:score run` reports `Failed to authenticate`, tell the user to log the
WSL `claude` CLI in again (`claude auth login` in a terminal), and continue with
the brief from the verdicts already stored. Done when you have the brief.

## 2. Pick one problem

From the brief take the problem with the most occurrences that has a cause in
the repository. Skip it when the evidence shows the human asked for the
behaviour, the scorer misread the session, or the fix is outside this repo.
A misreading scorer is itself the problem: fix its rubric in
`scripts/agents/scorers/`. If nothing repeats at least three times, report the
numbers and stop. Done when you can name the problem and its cause in one
sentence.

## 3. Choose the layer

Use `docs/agents/skill-standard.md` → "Choose the right layer":

| Cause | Change |
| --- | --- |
| A rule exists but agents miss it | Make it a check (guardrail test, hook) or move it earlier and shorter in `AGENTS.md` |
| A rule is missing | Add one line to the nearest `AGENTS.md` that owns the path |
| A skill fires wrongly or is ignored | Its `description` trigger phrases, plus a case in `evals/triggers.md` |
| A skill's steps lead agents astray | The step in that `SKILL.md` |
| A scorer is noisy | Its rubric |

Agents may implement factory scripts, hooks, skills, agent configuration and CI.
Factory-control changes (factory scripts, hooks, skills, agent configuration and CI) require independent code and security review with no open blocking finding before agents merge into dev. Done when one file (or
one file plus its test) is chosen.

## 4. Change and verify

1. Work in a worktree on `factory/<short-problem-slug>` from current `origin/dev`.
2. Make the smallest edit. Add the failing case to the relevant
   `evals/triggers.md` or test, so the problem has a regression check.
3. Run `pnpm test:guardrails` and `pnpm docs:check-style`; fix until both pass.

Done when both commands pass.

## 5. Hand over

- Write the commit message and recap from the brief's counts and your own
  paraphrase. Session evidence quotes private context: never paste it, session
  text or client details into a commit, PR or issue — the repository is public.
- Attended and unattended: use `/commit`, open a PR to `dev` labelled
  `risk:high` and `factory`, obtain independent code and security review,
  and merge the reviewed head only after all checks pass. Staging and
  production merges remain owner approved.
- After it lands, the next `agents:score report` shows whether the pass rate
  for that scorer moved. Mention that check in the recap.

Execution uses existing subscriptions first with $0 extra spending by default.
Prefer local execution; use cloud as fallback. Extra API spending requires owner
approval, including scorer, benchmark and skill-eval runs that incur charges.
