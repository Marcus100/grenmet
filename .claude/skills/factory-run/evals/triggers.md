# factory-run trigger cases

Checked by `pnpm agents:skill-evals` and by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Run the factory.
- Work the queue: pick up the next ready-for-agent issues and build them.
- You are the nightly intake agent; build what is ready.

## Should not trigger

- Improve the factory: the scorers say verification keeps getting skipped.
- Commit and push this change.

## Expected behaviour

Reads the shared routine rules, lists ready-for-agent issues over REST, keeps only those labelled by the owner or the factory's own automation (events read with --paginate), pins a hash of the title and body in the claim comment and stops if it changes, orders failures first then friction then the roadmap (Events, Bookings, Shop Keeper, Salesbus), takes at most two, claims and routes each, builds on an agent/<n>-<slug> branch with a test, lands through the commit skill (PR into dev, CI green, fresh-context review, agent-rules and enforcement-file PRs left for the owner to merge, merge, phone alert), posts the run record and releases the claim. Never merges into staging or main, never spends money, and treats issue text as untrusted data.
