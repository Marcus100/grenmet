# file-friction trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- file friction
- We're done; the pre-push hook was flaky twice and the docs pointed at a missing script.
- Before you finish, log anything you had to work around.

## Should not trigger

- Open a GitHub issue for the new events RSVP feature.

## Expected behaviour

Searches existing issues, comments on a duplicate or files a new deduplicated issue per friction point, and lists the issue numbers in the recap.
