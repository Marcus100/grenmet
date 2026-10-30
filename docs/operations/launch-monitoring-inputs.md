# Launch monitoring inputs (operator checklist)

**Status:** Active checklist; every item below is open until the owner ticks it  
**Owner:** Barrels Grenada engineering (operator: repository owner)  
**Last updated:** 2026-10-30

Planned launch: about 10 November 2026. The five daily monitoring issues
([#644](https://github.com/Marcus100/grenmet/issues/644) sentry,
[#645](https://github.com/Marcus100/grenmet/issues/645) eregister-sends,
[#646](https://github.com/Marcus100/grenmet/issues/646) worker-jobs,
[#647](https://github.com/Marcus100/grenmet/issues/647) secrets,
[#648](https://github.com/Marcus100/grenmet/issues/648) backups) all say the same
thing: no fresh, complete aggregate observation exists, so configure a read-only
collector. This page lists, per monitor, what only the owner can supply.

This page holds names and procedures only. Never put a value, token, URL with a
key, database address, email address or screenshot of a secret in this
repository, an issue or a pull request.

## How these issues are produced (read this first)

The issues are not opened by a GitHub Actions workflow. They come from the local
advisory auditor described in [advisory audit](../agents/advisory-audit.md): a
daily systemd service on the owner's WSL host
(`scripts/agents/systemd/grenmet-audit-daily.service`) runs
`scripts/agents/audit-worker.mjs`, which runs `scripts/agents/audit-operations.py`
once per source and publishes the result as an issue labelled `codex-audit`.
A receipt must be a private, mode-0600 JSON file under 64 kilobytes and fresher
than 26 hours; anything missing, partial or stale becomes a "needs configuration"
issue, and an unknown result never closes an issue.

The auditor reads three private, local-only inputs that do not exist in the
repository and are the root of all five issues:

| Local input | Mode | Purpose |
| --- | --- | --- |
| `~/.config/grenmet-factory/audit.json` | 0600 | Main auditor config. Shape: `scripts/agents/audit-config.example.json`. Needs `operationsConfig` (path of the next file) and, for Sentry only, `receipts.sentry`. |
| The operations config file named by `operationsConfig` | 0600 | Per-environment (`staging`, `production`) read-only database URL, telemetry Redis URL, `backupKinds`, and `secrets` expiry dates. |
| `~/.config/grenmet-factory/audit-operations.conf` | 0600 | systemd `EnvironmentFile`. Carries the backup read credentials the backup check needs (`DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`). |

On 2026-10-30 none of the three files exists on the audit host, which explains
why every source fails. Creating them (mode 0600, outside any repository) is
step 0 below.

## How an alert reaches the owner

Two separate paths, and they are not the same thing:

1. **Audit issues (this page's subject).** A failing or unconfigured source opens
   or updates a GitHub issue in this repository, labelled `codex-audit`.
   Reach the owner through normal GitHub issue notification. Blockers are also
   written to the main checkout's `SESSION_LOG.md`. This path is daily and only
   as reliable as the WSL host being awake at audit time. It is advisory and is
   **not** a paging system.
2. **Live alerts.** Better Stack monitors and heartbeats, Sentry alert rules and
   DigitalOcean droplet alerts email the owner-authorised address (see
   [analytics and monitoring](analytics-monitoring.md)). These detect an outage
   in minutes; the audit issues only report that a daily receipt is missing or
   bad.

Neither path pages anyone out of hours. Decide before launch whether email is
enough, and who watches the inbox; see
[incident runbook](incident-runbook.md#who-to-contact).

## Step 0: shared auditor setup (unblocks all five)

| Item | Detail |
| --- | --- |
| Who | Owner (the host and all credentials are the owner's). |
| Do | Create the three local files above, each mode 0600. Follow [advisory audit](../agents/advisory-audit.md#operational-coverage-and-private-configuration) for the shapes. Set `operationsConfig` to the operations file path. |
| Read-only role | Create a read-only PostgreSQL role for each environment that may only `SELECT` from `public.eregister_send`. The collector wraps its query in `BEGIN READ ONLY` with a 3 second timeout; the role should still be unable to write. |
| Confirm | Run the daily service once by hand: `systemctl --user start grenmet-audit-daily.service` (or the unit's real scope on the host), then open the five issues. Each source that passes closes its own issue on the next successful run. |

## Per-monitor inputs

### #644 sentry

| Field | Detail |
| --- | --- |
| Missing | No Sentry collector exists. The auditor expects a receipt at `receipts.sentry` written by a Sentry-connector-backed job, and the host has no Sentry connector configured. `audit-operations.py` does not collect Sentry. |
| Setting names | `receipts.sentry` in `audit.json` (a path). Sentry access: a read-only organisation token or connector grant with `event:read`, `project:read` and `org:read` only; do not reuse the deploy token `SENTRY_AUTH_TOKEN`, which is a release-writing token. |
| Who provides | Owner creates the read-only Sentry credential. Engineering then needs a task to build the collector that writes the receipt (counts of new issues, regressions and top recurring errors per environment, no titles, events, identities or request data). Until that task lands, #644 cannot pass. |
| Where it goes | Credential: the protected host environment file, never GitHub. Receipt: the path in `receipts.sentry`, refreshed daily before the audit. |
| Also needed for the live path | Sentry projects `grenmet-staging` and `grenmet-production`; production secret `SENTRY_DSN_PRODUCTION`; the five alert rules in [analytics and monitoring](analytics-monitoring.md#sentry-releases-crons-and-alert-rules); organisation hardening from [Sentry hardening](sentry-hardening.md). |
| Confirm passing | The receipt has `"complete": true`, `observedAt` within 26 hours and `staging` and `production` entries; the daily run closes #644. Separately, trigger a test error in staging and see the alert email. |
| Alert to owner | Sentry issue and metric alert rules by email; #644 itself as a GitHub issue. |

### #645 eregister-sends

The evidence command covers two sources, `eregister-sends` (email) and
`wis2-sends`, both read from the `eregister_send` table.

| Field | Detail |
| --- | --- |
| Missing | Operations config entries for both environments. |
| Setting names | `environments.<staging|production>.databaseUrl` in the operations file (a read-only database role URL). |
| Who provides | Owner creates the read-only role and its URL; engineering does not need the value. |
| Where it goes | The operations file only (mode 0600). The collector passes it to `psql` through the subprocess environment, never as an argument. |
| Confirm passing | Counts of `failed` plus `queued` older than 15 minutes are both zero for each environment, for both targets, with a fresh receipt. Non-zero is a real delivery problem, not a configuration problem: follow [WIS2 publishing runbook](wis2-publishing-runbook.md). |
| Alert to owner | #645 as a GitHub issue. There is no live email alert for a stuck send; eRegister staff see failed sends in the app. |

### #646 worker-jobs

The evidence command covers `worker-jobs` and `notification-sweeps`.

| Field | Detail |
| --- | --- |
| Missing | Redis telemetry for both environments, and a complete telemetry report. The collector deliberately refuses a partial report (`completeness` must be `complete`), and `src/metrics_report` currently emits partial coverage. Configuration alone will not clear this issue; an engineering task must make the report complete first. |
| Setting names | In the operations file: `environments.<env>.telemetryRedisUrl`. On the deployed services: variable `TELEMETRY_ENABLED=true` (GitHub environment variable, read by `deploy.yml`), and the worker heartbeat secret `WORKER_HEARTBEAT_URL`. |
| Who provides | Owner sets `TELEMETRY_ENABLED=true` for staging and production and supplies a read-only Redis URL; engineering completes the report. |
| Where it goes | Variable: GitHub environments `staging` and `production` (Settings, Environments). Secret: same environments. Redis URL: operations file. |
| Confirm passing | For every tracked job (`process_cap_jobs`, `ingest_cap_feeds`, `send_notification_emails`, `run_notification_sweeps`) the one-day report has a completed or failed count, and failed is zero. The worker heartbeat in Better Stack shows Up. |
| Alert to owner | Better Stack worker heartbeat (1 minute period, 2 minute grace) by email; Sentry cron monitors if `SENTRY_CRONS_ENABLED=true` reaches the worker; #646 as a GitHub issue. |

### #647 secrets

| Field | Detail |
| --- | --- |
| Missing | The `secrets` list in the operations file for both environments. |
| Setting names | `environments.<env>.secrets`: a non-empty list whose items contain only `expiresAt` (an ISO timestamp with a timezone). Nothing else is allowed in an item. |
| Who provides | Owner. List the real expiry date of every credential that expires (provider API keys, tokens, certificates, signing material). Do not include names or values; the check counts how many expire within 21 days. |
| Where it goes | The operations file only. |
| Confirm passing | Zero entries expire within 21 days in each environment. Add a calendar reminder for rotation so the issue is never the first warning. |
| Alert to owner | #647 as a GitHub issue. Better Stack also alerts 14 days before TLS certificate expiry. Rotation procedure for the authenticator key: [privileged MFA](privileged-mfa.md#encryption-key-rotation). |

### #648 backups

| Field | Detail |
| --- | --- |
| Missing | `backupKinds` in the operations file and the Spaces read credentials in the systemd environment file. `scripts/production/check-backup-age.py` reads the `latest-success.json` marker per kind and requires it under 24 hours old with full coverage. |
| Setting names | Operations file: `environments.<env>.backupKinds` (any of `core`, `weather`, `objects`, `sutron`; list only what is genuinely being backed up, or the check fails). Environment file: `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`. Use the **read-only** key (the same one the restore drill uses), never the backup job's write key. |
| Production backup workflow inputs | Environment `production-backup` already holds `DO_SPACES_*` and `POSTGRES_USER`. Still unset on 2026-10-30: variable `BACKUP_MARKERS_ENABLED`, and variables `WEATHER_BACKUP_ENABLED` and `SUTRON_BACKUP_ENABLED` if those backups are wanted. Variable `CMS_BACKUP_ENABLED` exists. |
| Maintenance workflow inputs | `monitoring-maintenance.yml` (scheduled backup and weekly restore test) is off until variables `MONITORING_MAINTENANCE_ENABLED`, `MONITORING_REVISION` (a full approved commit SHA that matches the installed monitoring revision) and `MONITORING_STORAGE_VERIFIED=true` are set, and secret `BACKUP_HEARTBEAT_URL` exists in the production environment. Staging already has the secret; production does not. |
| Who provides | Owner creates the Spaces read-only key and the Better Stack heartbeat, and sets the variables. |
| Confirm passing | `python3 scripts/production/check-backup-age.py production core` (with the read credentials in the environment) prints "complete core backup is within 24 hours" and exits 0; the daily audit closes #648; the backup heartbeat in Better Stack shows Up. |
| Alert to owner | Better Stack backup heartbeat (24 hour period, 2 hour grace) by email; #648 as a GitHub issue. |

## Provider settings that back the live alerts

These are not read by the five audit issues but they are what actually tells the
owner something is down. Status on 2026-10-30 is from `gh secret list` and
`gh variable list` names only.

| Environment | Name | Kind | State |
| --- | --- | --- | --- |
| production | `BETTERSTACK_API_TOKEN` | secret | missing (staging has it) |
| production | `PROBE_HEARTBEAT_URL` | secret | missing |
| production | `BACKUP_HEARTBEAT_URL` | secret | missing |
| production | `WORKER_HEARTBEAT_URL` | secret | missing |
| production | `TELEMETRY_ENABLED` | variable | missing |
| production | `MONITORING_DEPLOY_ENABLED` | variable | missing |
| production | `SENTRY_CRONS_ENABLED` | variable (reaches the worker) | missing; check plan limits first |
| production | `AUTH_TOTP_ENCRYPTION_KEYS`, `AUTH_PRIVILEGED_MFA_MODE` | secret, variable | missing; see [launch checklist](launch-checklist.md) |
| production | `SENTRY_AUTH_TOKEN`, `SENTRY_DSN_PRODUCTION` | secrets | present |

Better Stack apply order, from [analytics and monitoring](analytics-monitoring.md#production-monitoring-as-code-2026-10-20):
verify the plan allowance, set `limitsVerified` in `scripts/monitoring/betterstack.json`,
dispatch **Monitoring provider configuration** from a production release tag with
`operation=preview` then `apply`, copy the three heartbeat URLs into the secrets
above, then unpause. Prove delivery with `operation=test-alert` and
`resolve-test-alert`, and confirm both the open and recovery emails arrive (the
recovery email is not yet evidenced).

## Order of work

1. Step 0 files and read-only roles (unblocks #645, #647 and the shape of the rest).
2. Spaces read key and environment file, then `backupKinds` (clears #648 quickly).
3. Operations-file `secrets` expiry list (clears #647).
4. Better Stack production apply, heartbeats and test alert (live alerting).
5. Telemetry variables (#646) and the engineering tasks for a complete telemetry report and a Sentry collector (#644, #646).

## Unknowns to settle with the owner

- Whether the audit host (WSL) is always on at audit time, or needs a second watcher.
- Whether email to one inbox is acceptable out of hours, or a phone-reaching channel is needed.
- Which backup kinds are genuinely in production use (`weather`, `objects`, `sutron`).
- The Sentry plan limits for cron monitors and retained events.
