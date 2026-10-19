# release trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- /release
- $release (Codex)
- /release — promote today's dev work.

## Should not trigger

- What changed in the last release? (a question, not a promotion)

## Expected behaviour

Pre-flights dev, creates or reuses the staging PR, arms auto-merge on the reviewed head, monitors the staging pipeline, and stops for the owner at main and production.
