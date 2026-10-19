# release trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Promote today's dev work to staging.
- /release
- Let's cut the next production release.

## Should not trigger

- What changed in the last release?

## Expected behaviour

Pre-flights dev, creates or reuses the staging PR, arms auto-merge on the reviewed head, monitors the staging pipeline, and stops for the owner before the main merge and the production release.
