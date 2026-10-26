# Standing advisory auditor

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-26

The auditor helps Claude find errors. It never merges, synchronizes pull request
branches, changes rulesets, repairs applications, or makes its results required.
Only the six required automated checks govern development merges. The separate
review worker posts comments at the exact reviewed commit, even when checks are
red or a branch is behind. Slow reviews do not hold merges.

## Schedule

Four systemd user timers run while this host and its Linux distribution are
available. Times are universal time, with up to one minute of jitter.

| Timer | Schedule | Scope |
| --- | --- | --- |
| grenmet-audit-hourly | Every hour at :10 | Current development workflow failures, persistent pull request problems, security alerts |
| grenmet-audit-sixhourly | 00:30, 06:30, 12:30, 18:30 | Clean pinned development checkout, type checks, lint, each app test script, backend tests, all migration chains, client drift, dependency audit |
| grenmet-audit-daily | 05:30 | Read-only staging and production health, readiness, certificates, operational aggregate reports |
| grenmet-audit-weekly | Sunday 07:30 | Suppression baseline, oversized source modules, unfinished-work markers, dead-code reports |

Persistent timers catch up after downtime. They cannot run while the host sleeps.
Kernel locks prevent two runs of the same mode. A separate publication lock serializes issue reconciliation across every mode. Observation timestamps prevent older runs from overwriting newer results. Separate services keep hourly
metadata checks independent of long test runs. Heavy commands run sequentially
with low scheduling priority and bounded runtimes. Backend tests use the
repository's disposable verification databases, not the application databases.

Each failed command runs at most once more. A passing retry is reported as
intermittent; it is not silently treated as healthy. A failed dependency install
makes dependent checks unavailable. Every discovered Alembic configuration must
report exactly one head. No migration upgrades run against live services.

## Running and installation

Preview the timer schedule without running checks:

```bash
node scripts/agents/audit-worker.mjs --mode hourly --plan
```

Run a read-only check and preview issue changes, without writing to GitHub:

```bash
node scripts/agents/audit-worker.mjs --mode hourly
```

Add `--publish` to create or update advisory issues. Six-hourly and weekly runs
create their own detached worktree of a fetched, pinned `origin/dev`. Source
checkouts and environments are never shared with another agent. Normal Git
removal cleans only the checkout created by that run; unexpected changes retain
the checkout for inspection. Never force-remove retained worktrees.

Install reviewed source as a detached checkout at
`~/.local/share/grenmet-factory/audit-runner`, then copy the eight
`scripts/agents/systemd/grenmet-audit-*` units into
`~/.config/systemd/user/`. Reload the user manager and enable those four timers.
The runner needs Node, pnpm, uv, GitHub command-line authentication, Docker and
network access. It must not receive application credentials for test commands.

## Operational coverage and private configuration

Place a protected configuration file at
`~/.config/grenmet-factory/audit.json` (mode 0600). The example at
`scripts/agents/audit-config.example.json` contains no credentials. Direct probes
accept credential-free HTTPS endpoints and do not follow redirects or store
response bodies. The default endpoints check the main application database and
its migration state; they do not prove separate database health.

Operational collectors supply private aggregate reports, not raw records.
Each report must be a mode-0600 regular file, at most 64 kilobytes, and fresh
within 26 hours. Example shape:

```json
{
  "source": "sentry",
  "via": "sentry-mcp",
  "observedAt": "2026-10-26T05:00:00Z",
  "complete": true,
  "environments": {
    "staging": { "failures": 0 },
    "production": { "failures": 0 }
  }
}
```

Sentry collection must use the Sentry connector and count new issues, regressions
and top recurring errors without copying titles, event bodies, identities or
request data. This host currently has no Sentry connector configured; that is an
explicit owner coverage issue, not a successful check. A connector-backed
collector must refresh the report before the daily audit.

The remaining sources are `eregister-sends`, `wis2-sends`, `worker-jobs`,
`notification-sweeps`, `secrets` and `backups`. Counts must cover both
environments. Delivery collectors query only aggregate failed and overdue
queued counts. Job and sweep collectors must check freshness as well as failures;
empty telemetry is unknown, not zero. Backup collectors validate off-host
completion markers and coverage. Secret collectors use expiry metadata only;
never export secret values. Missing, partial or stale reports create a monitoring
coverage issue for the owner.

## Reporting and privacy

Issues carry `codex-audit`, a severity (blocker, high, normal or low), a suggested
owner (Claude or the owner), the evidence command, safe structured output and
the development commit. A stable root-cause marker finds existing issues,
including closed ones. A recurrence reopens the existing issue; a confirming
successful probe closes it. Unknown or unobserved checks never close issues.
Claude fixes findings; the auditor does not implement automatic repairs.

The command output and detailed reports stay under
`~/.local/state/grenmet-factory/audit/runs/` with private permissions.
Each command log is capped at one megabyte plus a bounded final tail. Recognized owned run evidence is retained for 14 days or the newest 100 runs; unfamiliar files are preserved. New issues are limited to ten per run, with severe findings first; deferred findings remain private and are reconsidered next run. Existing updates and closures still run. Public issue bodies never contain raw logs, event details, secrets or personal
data. Blockers also go to the main checkout's `SESSION_LOG.md`.

The publisher verifies the authenticated GitHub identity and modifies only generated issues authored by that identity. Public marker text alone is not trusted. Dependency advisories and repeated code-scanning locations are grouped into root-cause keys. If investigation
shows two check failures share one underlying defect, consolidate them into one
issue and map their check keys through the protected rootCauses configuration object before adding further monitors.
Report-only dead-code scans require human assessment before a cleanup proposal.

## Execution isolation and operational adapters

Source commands run in a systemd filesystem sandbox. The host home, Windows
mounts and runtime sockets are hidden, the resolver is bound back read-only,
and only the owned checkout is writable. Node and Python tools are bound
read-only. Tests receive a fresh home and no application or GitHub credentials.
The reviewed host verifier creates disposable backend services; only its test
command runs inside the sandbox.

The included `audit-operations.py` collector supports fixed read-only send
aggregates, existing backup freshness checks and expiry metadata. Configure
`operationsConfig` with the path of a protected local operations file to refresh
those receipts before daily checks. Its `environments` object has `staging` and
`production`, each with `databaseUrl` for a read-only database role,
`telemetryRedisUrl` for read-only telemetry, `backupKinds` (core, weather,
objects or sutron), and a `secrets` list containing expiry dates only.
Database values are passed through the subprocess environment, never arguments.
Backup read credentials remain in the protected service environment. No
credential values belong in the example, issues or repository.

Existing telemetry currently declares only partial coverage, so job and sweep
collectors deliberately emit no complete receipt. Missing Sentry connectivity,
operational access and incomplete telemetry are owner coverage findings.