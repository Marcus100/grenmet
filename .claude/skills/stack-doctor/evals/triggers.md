# stack-doctor trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Postgres won't start and port 5432 says it's in use.
- Something is wrong with my dev stack; containers keep restarting.
- Check my environment before I start on the Docker work.

## Should not trigger

- Write a migration that adds a column to hr.department_policy.

## Expected behaviour

Runs the read-only check script, reports daemon identity, port collisions against docs/ports.md, toolchain versions and container health, and changes nothing.
