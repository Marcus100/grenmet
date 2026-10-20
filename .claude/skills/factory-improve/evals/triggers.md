# factory-improve trigger cases

Checked by `pnpm agents:skill-evals` and by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Run the weekly factory review.
- What keeps going wrong in our agent sessions? Fix the instructions.
- The scorers say verification keeps getting skipped, improve the factory.

## Should not trigger

- File the friction we hit with the slow Docker gate.

## Expected behaviour

Runs agents:flow, agents:score and agents:improve, picks the most repeated problem with a repository cause, makes one small change to a skill, AGENTS.md rule, scorer or check with a regression case, passes guardrails, and hands it over for human review without pasting session evidence.
