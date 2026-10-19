# pre-merge trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Is this branch ready to merge?
- Run the pre-merge checks before I promote to staging.
- Check types, lint, env drift and Actions pinning on this branch.

## Should not trigger

- Merge the staging PR now.

## Expected behaviour

Runs every check read-only, prints the ✅/❌/⚠️ summary with exact fix commands, and edits nothing.
