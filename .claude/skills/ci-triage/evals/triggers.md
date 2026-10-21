# ci-triage trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- CI is red on the dev → staging PR, can you find out why?
- The Type Check job failed on my last push.
- Why did pipeline-staging.yml fail last night?
- Some checks are failing on the open PR, what broke?

## Should not trigger

- Add a new GitHub Actions job that builds the docs app.

## Expected behaviour

Lists failing checks, states hypotheses with the fastest falsifying command before investigating, confirms a root cause from logs, applies the smallest fix and reruns the same command CI uses.
