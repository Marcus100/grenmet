# factory-improve trigger cases

Checked by `pnpm agents:skill-evals` and by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Run the weekly factory review.
- What keeps going wrong in our agent sessions? Fix the instructions.
- The scorers say verification keeps getting skipped, improve the factory.

## Should not trigger

- File the friction we hit with the slow Docker gate.

## Expected behaviour

Runs agents:flow, agents:score and agents:improve, picks the most repeated problem with a repository cause, makes one small change to a skill, AGENTS.md rule, scorer or check with a regression case, passes guardrails, uses subscriptions first with $0 extra spending by default, and lands through the factory merge into dev (a safety-file PR needs a clean security-reviewer pass and a clean Codex review of its head) without pasting session evidence. Extra API spending and staging/production merges require owner approval.
