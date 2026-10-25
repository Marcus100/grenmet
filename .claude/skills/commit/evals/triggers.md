# commit trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- The HR roster fix is done and tests pass; ship it.
- Commit this and push it to dev.
- (Routine) The issue's checks pass; run the commit gates and open the PR to dev.

## Should not trigger

- Write me a commit message for this diff, but don't commit anything.

## Expected behaviour

Runs pnpm verify:changed and the risk-tier review, commits with a conventional message, pushes the task branch and opens a PR into dev, merges it once CI is green on its head and the fresh-context review is clean (factory-control changes also require independent security review; PRs touching owner-only paths listed in AGENTS.md are left for the owner to merge), then creates or updates the dev to staging PR without arming auto-merge (a routine does the same from its own branch); ends with the Changed/Gates/Outcome/Friction recap.
