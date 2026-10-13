# Factory journal

**Status:** Active log  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-13

What each phase of the software-factory plan actually taught, written down while
it is fresh. Newest at the bottom. Facts only: what happened, what it means.

## Phase 0-2: foundation, safety, measurement (2026-10-13)

- **The guardrails apply to the agent that built them.** The suppression ratchet
  failed my own commits twice (an added `type: ignore`, then a `biome-ignore-all`
  header). Both were fixed at the cause instead of raising the baseline. A gate
  that agents cannot talk past is worth more than a rule they are asked to follow.
- **Dogfooding finds the tool's gaps.** `verify:changed` ignored deleted files and
  ran API lint without the collector package CI installs, so mypy failed locally and
  passed in CI. Both surfaced only when the tool was used on real changes.
- **Cached state lies.** A stale `.mypy_cache` kept an old "module not found" after
  the module was installed. When a local failure disagrees with CI, suspect caches
  before code.
- **Check exit codes, not intent.** `git push --delete` on a missing ref exits 0, so
  "released" could not be told from "nothing to release". The tests caught it; the
  fix was to look first.
- **Test order is an input.** A logging test passed alone and failed after tests that
  bootstrap the database, because Alembic's `fileConfig` disables existing loggers.
- **Atomicity comes from the remote.** Claiming works because each claim pushes an
  unrelated root commit, so the git server rejects every claimant but one. A
  check-then-set label cannot do that. Stale locks are recovered with a
  compare-and-swap against the exact old SHA.
- **Git history is free ground truth.** The benchmark's thirteen real tasks use a
  commit's parent as the start, the commit as the answer and its tests as the hidden
  tests, so no answer key had to be invented.
- **Measure cost without dollars.** On plan limits there is no per-run price, so the
  report uses accepted-PR rate, first-pass rate, retries, review minutes and weekly
  plan usage instead.
