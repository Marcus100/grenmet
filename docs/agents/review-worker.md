# Subscription review worker

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-24

The trusted worker reviews same-repository PRs into `dev` carrying the
`factory-review` label. Each invocation handles at most one review task. It
requires green CI before spending subscription allowance, uses the existing
Codex wrapper with ChatGPT login, and claims the PR through the shared lock-ref
mechanism so local and cloud workers cannot both take it. Stale claims are not
automatically taken over.

## Run and recover

```bash
node scripts/agents/review-worker.mjs --once --dry-run
node scripts/agents/review-worker.mjs --once --merge
node scripts/agents/review-worker.mjs --pr 588 --include-draft --dry-run
node scripts/agents/review-worker.mjs --pr 588 --retry
```

Only `--merge` permits merging, and only an open, non-draft PR into `dev` with
green CI and current code/security review statuses can merge. Draft review must
be explicitly selected and never merges the draft. A failed review is not
automatically repeated for the same head/base: push a fix or use an explicit
`--pr` and `--retry`. An unavailable login, malformed result or requested change
cannot publish approval. API-key login is refused and inherited API keys are
stripped. No additional API spending is enabled.

`Factory review` always represents a completed independent review. High-risk
and factory-control files additionally require an independent security review.
For other paths the security context records a deterministic `not-required`
decision. Statuses are attached to the exact commit and include the complete
reviewed base SHA. Cached results must match the current authenticated issuer
and base. The worker rechecks PR identity, base, CI and statuses before merging.

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

The timer runs while WSL is available, checks again ten minutes after a run
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
service. GitHub's `Protect dev` ruleset requires the review contexts and CI,
with an up-to-date branch, while the worker checks issuer and exact base.
Staging and production remain owner-approved. A dedicated GitHub App can later
isolate status publishing without changing the review contract.
