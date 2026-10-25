# Subscription review worker

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-25

The trusted worker reviews same-repository PRs into `dev` carrying the
`factory-review` label. Each invocation may merge cached approvals, then starts
at most one new PR review or branch sync. It requires green CI before spending
subscription allowance, uses the existing Codex wrapper with ChatGPT login, and
claims the PR through the shared lock-ref mechanism so local and cloud workers
cannot both take it. Stale claims are not automatically taken over.

## Run and recover

```bash
node scripts/agents/review-worker.mjs --once --dry-run
node scripts/agents/review-worker.mjs --once --merge
node scripts/agents/review-worker.mjs --pr 588 --include-draft --dry-run
node scripts/agents/review-worker.mjs --pr 588 --retry
```

Only `--merge` permits worker merging, and only an open, non-draft PR into `dev`
with green CI and current code/security review statuses can merge. The worker
applies the same owner-only path policy as the merge hook: those PRs are reviewed
but left for the owner to merge. Draft review must be explicitly selected and
never merges the draft. A failed review is not
automatically repeated for the same head/merge-base: push a fix or use an explicit
`--pr` and `--retry`. An unavailable login, malformed result or requested change
cannot publish approval. API-key login is refused and inherited API keys are
stripped. No additional API spending is enabled.

`Factory review` always represents a completed independent review. The
`risk:high` label, high-risk files and factory-control files require an
independent security review.
For other paths the security context records a deterministic `not-required`
decision. Statuses are attached to the exact commit and PR merge-base. Cached
results must match the current authenticated issuer and merge-base. The worker
rechecks the PR head, merge-base, changed-file overlap, CI and statuses before
merging. `Protect dev` currently requires an up-to-date branch. The worker syncs one stale
PR and waits for fresh CI and review before another merge can proceed. That
server-side requirement closes the race where `dev` could change after the
worker's final scope check and before GitHub merges the PR. The worker's
loose-policy support remains covered by tests, but is not active for `dev`.

## Local scheduling

Install the reviewed runner commit as a dedicated detached checkout at
`~/.local/share/grenmet-factory/runner`. It needs the existing Node, Codex and
GitHub CLIs; its review scripts use built-in Node modules, so no dependency
installation is needed for the worker. Never run the trusted dispatcher from
an unreviewed PR checkout or automatically pull arbitrary new runner code.

Copy `scripts/agents/systemd/grenmet-review.service` and
`scripts/agents/systemd/grenmet-review.timer` to `~/.config/systemd/user/`, then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now grenmet-review.timer
systemctl --user status grenmet-review.timer
journalctl --user -u grenmet-review.service -n 40 --no-pager
```

The timer runs while WSL is available, checks again two minutes after a run
finishes, and does not overlap an active service. There are no automatic repair
loops. Confirm a crashed worker has stopped before releasing a remaining PR
claim or deleting its local worker/review lock. Do not delete another live
runner's lock. Logs and credentials stay on the runner host.

## Cloud and trust boundaries

The same dispatcher can run on a separately authenticated, approved cloud
runner and shares the PR claim with local execution. Cloud scheduler setup,
subscription authentication and host availability must be verified before
claiming cloud fallback works. Do not upload a local credential file to create
that fallback. Local scheduling alone does not keep running when the computer
is off.

The GitHub statuses trust the runner's authenticated GitHub identity. Repository
writers can also publish commit statuses; this is not a separate signing
service. GitHub's `Protect dev` ruleset requires the review contexts and CI.
Its up-to-date-branch policy is read from the committed ruleset snapshot; the
worker uses the same policy and checks the issuer, merge-base and changed-file
overlap.
Staging and production remain owner-approved. A dedicated GitHub App can later
isolate status publishing without changing the review contract.
