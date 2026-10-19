# commit trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- /commit
- $commit (Codex)
- /commit — the HR roster fix is done.

## Should not trigger

- Write me a commit message for this diff (no /commit): the agent should draft the message only and must not push or promote.

## Expected behaviour

Runs pnpm verify:changed and the risk-tier review, commits with a conventional message, merges into local dev, pushes dev and arms the staging promotion; ends with the Changed/Gates/Outcome/Friction recap.
