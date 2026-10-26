# Subscription review worker

**Status:** Active reference
**Owner:** Barrels Grenada engineering
**Last updated:** 2026-10-25

The scheduled worker runs in advisory mode: it reviews every open, non-draft,
same-repository PR into `dev`, `staging`, or `main`, regardless of label, CI
state, or whether the branch is up to date. It posts findings as a PR comment
whose header records the exact reviewed head SHA and merge-base. Advisory mode
never publishes commit statuses, merges PRs, or syncs branches. It uses the
existing Codex wrapper with ChatGPT login and claims each PR through the shared
lock-ref mechanism so local and cloud workers cannot both take it. Stale claims
are not automatically taken over. Each invocation still starts at most one new
model review.

## Run and recover

```bash
node scripts/agents/review-worker.mjs --once --dry-run
node scripts/agents/review-worker.mjs --once --advisory
node scripts/agents/review-worker.mjs --pr 588 --include-draft --dry-run
node scripts/agents/review-worker.mjs --pr 588 --retry
```

Advisory mode is observation-only. The scheduled unit invokes
`--once --advisory`; it will not merge or update a branch, and the CLI rejects
`--advisory --merge`. Reviews remain scoped to the verified same-repository PR
head and complete pinned diff. The reviewer's PR comment records the exact head
SHA and merge-base; no status App identity, required-context pin, or CI result is
needed in this mode. Security review remains required for high-risk labels,
high-risk files, and factory-control files. A private local cache in the runner's
Git metadata records completed code and security comments by PR, head SHA, and
review role. Base advances do not invalidate an exact-head advisory comment.
Incomplete reviews and errors are not cached; cache updates are written only
after all required review comments are complete. `--retry` bypasses the cache.

The legacy `--merge` mode remains available for manual use and retains its
status-App, required-CI, up-to-date branch, and owner-only merge safeguards.
Draft review must be explicitly selected with `--include-draft`. Legacy merge
mode skips a failed head through its trusted status. API-key login is refused
and inherited API keys are stripped. No additional API spending is enabled.

The Codex model process runs through systemd-run --user in a transient Linux
filesystem namespace. Its home and Windows-mounted files are hidden; only the
per-review workspace and temporary Codex home are writable, while the pinned
source checkout and Node toolchain are read-only. Private temp/devices and a
private user namespace are enabled, and available Docker/DBus sockets are
hidden. GitHub CLI credentials and the status App key are not passed to the
model unit. The temporary Codex home contains only the copied ChatGPT login and
the strict named permission profile. The unit starts Codex through `env -i` with
an explicit environment allowlist; it does not inherit variables from the
systemd user manager. If systemd isolation cannot start, the review fails
closed. Raw model findings are not written to the service log.

The legacy merge mode publishes `Factory review` and `Factory security review`
through the dedicated GitHub App with only `statuses:write` permission on this
repository. In that mode, `Protect dev` must pin both contexts to that App's
integration ID. The worker fails closed if the contexts are unpinned, use different
App IDs, or the local App ID does not match the ruleset. A human GitHub token is
never passed to the status publisher. The worker verifies the App's bot login
using a signed App JWT and matches App-authored statuses to that identity, not the
human CLI login. Advisory mode skips status publishing and the related ruleset
checks.

Branch-sync conflicts are stored locally beside the review receipt in the
runner's Git metadata, keyed by PR head and dev base. The worker skips retries
until either revision changes and continues through other queued PRs after a
conflict while preserving the one-sync-per-run limit.

In legacy merge mode, `Factory review` always represents a completed
independent review. The `risk:high` label, high-risk files and factory-control
files require an independent security review. For other paths the security
context records a deterministic `not-required` decision. Statuses are attached
to the exact commit and PR merge-base. Cached results must match the verified App
bot login and merge-base. The worker rechecks the PR head, merge-base, changed-file
overlap, CI and statuses before merging. `Protect dev` requires current
branches at merge time; the worker syncs one stale PR and waits for fresh CI and
review before another merge can proceed. That
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

For advisory scheduling, the status App and its key are optional and are not
read. If you separately use legacy merge mode, create a GitHub App for
`Marcus100/grenmet` with only **Commit statuses: Read and write**, install it
only on this repository, and generate its private key. Save the key outside the
repository at
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

Set the config file to mode `600`. For legacy merge mode, set both review
status contexts in GitHub's `Protect dev` ruleset to this App's integration ID
and refresh `infra/github/rulesets.json`. The App ID is the integration ID; the
installation ID is only used to mint short-lived status tokens. The worker
verifies the App's slug using its signed App JWT, then matches App-authored
statuses to that bot login. Legacy merge work refuses to proceed until the
snapshot and App ID agree.

The advisory cache is stored at
`<git-common-dir>/agent-review-state/advisory-review-cache.json`, with a private
directory and owner-only file permissions. Keep it with the runner checkout;
deleting it causes completed PR heads to be reviewed again.

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

Legacy merge mode trusts the two review statuses only when GitHub pins them
to the dedicated status App and their creator matches the App's verified bot
login. Keep the App private key on the runner host, outside every worktree. The
status App cannot merge PRs; the worker uses its separate GitHub CLI identity
for PR operations.
Staging and production remain owner-approved.
