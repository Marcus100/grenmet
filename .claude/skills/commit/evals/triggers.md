# commit trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- The HR roster fix is done and tests pass; ship it.
- Commit this and push it to dev.
- (Routine) The issue's checks pass; run the commit gates and open the PR to dev.

## Should not trigger

- Write me a commit message for this diff, but don't commit anything.

## Expected behaviour

Runs pnpm verify:changed and the risk-tier review, commits with a conventional message, merges into local dev, pushes dev and arms the staging promotion (a routine instead pushes its own branch and opens a PR to dev); ends with the Changed/Gates/Outcome/Friction recap.
