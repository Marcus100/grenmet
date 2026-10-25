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

The worker publishes `Factory review` and `Factory security review` through a
dedicated GitHub App with only `statuses:write` permission on this repository.
`Protect dev` must pin both contexts to that App's integration ID. The worker
fails closed if the contexts are unpinned, use different App IDs, or the local
App ID does not match the ruleset. A human GitHub token is never passed to the
status publisher. The worker verifies the App's bot login using a signed App
JWT and matches App-authored statuses to that identity, not the human CLI login.

`Factory review` always represents a completed independent review. The
`risk:high` label, high-risk files and factory-control files require an
independent security review.
For other paths the security context records a deterministic `not-required`
decision. Statuses are attached to the exact commit and PR merge-base. Cached
results must match the verified App bot login and merge-base. The worker
rechecks the PR head, merge-base, changed-file overlap, CI and statuses before
merging. `Protect dev` currently requires an up-to-date branch. The worker syncs one stale
PR and waits for fresh CI and review before another merge can proceed. That
server-side requirement closes the race where `dev` could change after the
worker's final scope check and before GitHub merges the PR. The worker's
loose-policy support remains covered by tests, but is not active for `dev`.

The current `Protect dev` ruleset requires zero pull-request approvals and does
not require code-owner review. Owner-only merge paths are therefore a procedural
rule: the worker and local merge hook refuse to merge them, but GitHub does not
stop another collaborator with merge access from merging them through the UI
after required statuses pass.

## Local scheduling

Install the reviewed runner commit as a dedicated detached checkout at
`~/.local/share/grenmet-factory/runner`. It needs the existing Node, Codex and
GitHub CLIs; its review scripts use built-in Node modules, so no dependency
installation is needed for the worker. Never run the trusted dispatcher from
an unreviewed PR checkout or automatically pull arbitrary new runner code.

Before enabling the service, create a GitHub App for `Marcus100/grenmet` with
only **Commit statuses: Read and write**, install it only on this repository,
and generate its private key. Save the key outside the repository at
`~/.config/grenmet-factory/review-status-app.pem` and restrict it to the owner:

```bash
install -d -m 700 ~/.config/grenmet-factory
chmod 600 ~/.config/grenmet-factory/review-status-app.pem
```

Create `~/.config/grenmet-factory/review-status-app.conf` with the App ID, its
installation ID, and the absolute key path:

```text
GRENMET_REVIEW_STATUS_APP_ID=<app-id>
GRENMET_REVIEW_STATUS_INSTALLATION_ID=<installation-id>
GRENMET_REVIEW_STATUS_APP_PRIVATE_KEY_FILE=/home/<user>/.config/grenmet-factory/review-status-app.pem
```

Set the config file to mode `600`. Before enabling the updated worker, set both
review status contexts in GitHub's `Protect dev` ruleset to this App's
integration ID and refresh `infra/github/rulesets.json`. The App ID is the
integration ID; the installation ID is only used to mint short-lived status
tokens. The worker verifies the App's slug using its signed App JWT, then
matches App-authored statuses to that bot login. It refuses real queue work
until the snapshot and App ID agree.

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

The two review statuses are trusted only when GitHub pins them to the dedicated
status App and their creator matches the App's verified bot login; a writer's user
token cannot satisfy those required contexts. Keep
the App private key on the runner host, outside every worktree. `Protect dev`
also requires current branches at merge time, so a `dev` advance between the
worker's last scope check and merge blocks the merge. The status App cannot
merge PRs; the worker uses its separate GitHub CLI identity for PR operations.
Staging and production remain owner-approved.
