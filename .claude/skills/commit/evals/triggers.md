# commit trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- The HR roster fix is done and tests pass; ship it.
- Commit this and push it to dev.
- (Routine) The issue's checks pass; run the commit gates and open the PR to dev.

## Should not trigger

- Write me a commit message for this diff, but don't commit anything.

## Expected behaviour

Runs the targeted tests of what changed and the risk-tier review, commits with a conventional message, pushes the task branch and opens a PR into dev, merges it once CI is green on its head and the fresh-context review is clean (a PR that changes a safety file first needs a clean security-reviewer pass and a clean Codex review of its head, both recorded as lines in the PR body), sends the owner a phone alert, and stops there: the dev to staging PR is opened only when the owner asks (a routine does the same from its own branch); ends with the Changed/Gates/Outcome/Friction recap.
