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
collector. This page lists exactly what only the owner can supply.

This page holds names and procedures only. Never put a value, token, URL with a
key, database address, email address or screenshot of a secret in this
repository, an issue or a pull request.

> Statuses of GitHub secrets and variables in this page were read on 2026-10-30. They go stale quickly: the owner re-checks them (`gh secret list`, `gh variable list` per environment) before launch.

## How these issues are produced (read this first)

**Primary path (chosen by the owner on 2026-10-31): the droplet runners.**
[`monitoring-daily.yml`](../../.github/workflows/monitoring-daily.yml) runs every
day at 04:50 UTC, from `main` only:

1. A `collect` job runs on each environment's own self-hosted runner
   (`[self-hosted, <environment>, core]`, the same runners as deploys and
   `monitoring-maintenance.yml`). `scripts/monitoring/daily_receipts.py` reads the
   private database and Redis containers directly, plus Spaces and Sentry, and
   writes one aggregate-only receipt for that environment. The job summary shows
   each source as complete or not, with its count and a fixed reason.
2. A `publish` job on a GitHub-hosted runner merges the staging and production
   receipts and runs `scripts/agents/audit-runner-publish.mjs` with an
   `issues: write` token. It uses the same code as the WSL auditor, so the same
   five issues open, update and close. Any new per-environment failure (for
   example "production backups needs attention") becomes its own issue.

Both environments are needed for a source to pass: a missing, stale or
incomplete half keeps the issue open as "needs configuration". An unknown result
never closes an issue. Nothing is collected or published until
`MONITORING_DAILY_ENABLED=true` is set (step 8). Because the jobs run on the
droplets, they work while the owner's PC is off.

The run fails (a red workflow, which GitHub emails about) when monitoring cannot
report:

- **A collector failed:** its half is published as a coverage gap, and then the job fails.
- **No collector reported at all** (runner offline, or the job never started): the job fails without touching the issues.

A run where every environment is disabled passes and changes nothing.

**Optional advisory path: the WSL auditor.** The daily systemd service on the
owner's WSL host (`scripts/agents/systemd/grenmet-audit-daily.service`, see
[advisory audit](../agents/advisory-audit.md)) can still collect the same
sources from private files in `~/.config/grenmet-factory`. Once the runner path is
on, switch the WSL auditor to runner mode (step 7), or the two paths overwrite
each other's results every morning.

## How an alert reaches the owner

Two separate paths, and they are not the same thing:

1. **Audit issues (this page's subject).** A failing or unconfigured source opens
   or updates a GitHub issue in this repository, labelled `codex-audit`.
   Reach the owner through normal GitHub issue notification. This path runs daily
   on the droplets. It is advisory and is **not** a paging system.
2. **Live alerts.** Better Stack monitors and heartbeats, Sentry alert rules and
   DigitalOcean droplet alerts email the owner-authorised address (see
   [analytics and monitoring](analytics-monitoring.md)). These detect an outage
   in minutes; the audit issues only report that a daily receipt is missing or
   bad.

Neither path pages anyone out of hours. Decide before launch whether email is
enough, and who watches the inbox; see
[incident runbook](incident-runbook.md#who-to-contact).

## Owner checklist (runner path)

Do the steps in order. Each environment is independent; you can finish staging
first and test it with `environment=staging` (step 9), but the five issues only
close once production is complete too.

### Step 1: create two monitoring environments

The existing `production` environment requires a reviewer, so a daily job there
would wait for approval every day. The monitoring jobs use their own
environments instead, holding only the read-only inputs below, so they get no
deploy secrets from GitHub's secret store. That is the only separation: the
self-hosted runner hosts themselves hold the deploy files (`runtime/.env.local`
and Docker access), so any job that reaches a droplet runner can read them. The
real boundary is the `main`-only branch policy below plus who has write access
to the repository.

GitHub creates an environment automatically, **with no branch policy**, the
first time a job references it. So create both environments and their
`main`-only policy **before** adding any secret to them, and before this
workflow first runs.

- [ ] Create `staging-monitoring` and `production-monitoring` (Settings,
  Environments, New environment). No required reviewers. Under Deployment
  branches and tags choose **Selected branches and tags** and add `main` only.

The same from a terminal (repeat with `production-monitoring`):

```bash
gh api -X PUT repos/Marcus100/grenmet/environments/staging-monitoring \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/Marcus100/grenmet/environments/staging-monitoring/deployment-branch-policies \
  -f name=main
```

- [ ] Verify each environment allows `main` and nothing else:

```bash
gh api repos/Marcus100/grenmet/environments/staging-monitoring/deployment-branch-policies --jq '[.branch_policies[].name]'     # ["main"]
gh api repos/Marcus100/grenmet/environments/production-monitoring/deployment-branch-policies --jq '[.branch_policies[].name]'  # ["main"]
```

- [ ] Confirm workflows from fork pull requests need approval before they run
  (Settings, Actions, General, "Approval for running fork pull request
  workflows from contributors"; choose at least "Require approval for
  first-time contributors", or stricter). This repository is public and its
  runners sit on the droplets.

### Step 2: create the read-only database role (once per droplet)

The eRegister and WIS2 send checks read four columns of one table, through
`docker exec` into the database container, as a role that has no password. With
no password it cannot sign in over the network; it is reachable only from the
droplet itself. The collector still wraps its query in `BEGIN READ ONLY` with a 3
second timeout.

- [ ] On each droplet, open `psql` as the database superuser in the eRegister
  database. The database is `eregister_staging` on staging and `eregister` on
  production (`EREGISTER_DB_NAME` in `infra/docker/<environment>.env`).

```bash
# staging droplet (production: project grenmet, database eregister)
db=$(docker ps -q --filter label=com.docker.compose.project=grenmet-staging --filter label=com.docker.compose.service=db)
docker exec -it "$db" psql -U "<superuser name from runtime/.env.local>" -d eregister_staging
```

```sql
CREATE ROLE grenmet_monitor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOINHERIT CONNECTION LIMIT 2;
ALTER ROLE grenmet_monitor SET default_transaction_read_only = on;
ALTER ROLE grenmet_monitor SET statement_timeout = '5s';
GRANT CONNECT ON DATABASE eregister_staging TO grenmet_monitor; -- production: eregister
GRANT USAGE ON SCHEMA public TO grenmet_monitor;
GRANT SELECT (status, target, next_retry_at, created_at)
  ON public.eregister_send TO grenmet_monitor;
```

- [ ] Confirm it can count but cannot read other columns or write:

```bash
docker exec -i "$db" psql -U grenmet_monitor -d eregister_staging -c "SELECT COUNT(*) FROM public.eregister_send"      # a number
docker exec -i "$db" psql -U grenmet_monitor -d eregister_staging -c "SELECT last_error FROM public.eregister_send LIMIT 1"  # permission denied
```

- [ ] Confirm two negative checks. Another database's tables are denied (the
  main application database is `app_staging` on staging and `app_prod` on
  production):

```bash
docker exec -i "$db" psql -U grenmet_monitor -d app_staging -c "SELECT COUNT(*) FROM public.alembic_version"  # permission denied
```

  And a network (non-socket) login fails. This connects to the container's own
  network address, not the local socket, without a password:

```bash
docker exec -i "$db" sh -c 'psql -w -h "$(hostname -i | cut -d" " -f1)" -U grenmet_monitor -d eregister_staging -c "SELECT 1"'
# fe_sendauth: no password supplied (or password authentication failed)
```

  If either command succeeds instead, stop and tell engineering before going on.

To use a different role name, set `MONITORING_DB_ROLE` (step 5).

### Step 3: create a read-only Spaces key (per environment)

- [ ] DigitalOcean control panel, Spaces Object Storage, Access Keys, Create
  Access Key. Choose **Limited Access**, select only the backup bucket, and give it
  **Read** permission. Name it `grenmet-monitoring-read-staging` (and
  `-production`). Copy the key ID and secret straight into the environment
  secrets in step 5. Never reuse the backup job's write key.

### Step 4: create a read-only Sentry token

- [ ] Sentry, Settings, Developer Settings, Custom Integrations, Create New
  Integration, **Internal Integration**, named `grenmet-monitoring-read`.
  Permissions: Project **Read**, Issue & Event **Read**, Organization **Read**,
  everything else No Access. No webhooks, no alert rule actions. Save and copy
  its token into `MONITORING_SENTRY_TOKEN` (step 5).
- [ ] Do not reuse the deploy token `SENTRY_AUTH_TOKEN`; it can write releases.

The collector counts, per project, unresolved issues first seen in the last 24
hours plus unresolved regressed issues seen in the last 24 hours. It keeps only
the count; no titles, events or identities leave Sentry.

### Step 5: set the environment secrets and variables

Set each item in **both** `staging-monitoring` and `production-monitoring`
unless the table says otherwise. Use `gh variable set <name> --env <environment>
--body <value>` for variables, and `gh secret set <name> --env <environment>`
(it prompts for the value, so it stays out of shell history) for secrets.

| Name | Kind | Value |
| --- | --- | --- |
| `MONITORING_SENTRY_ORG` | variable | Sentry organisation slug |
| `MONITORING_SENTRY_PROJECT` | variable | `grenmet-staging` in staging, `grenmet-production` in production |
| `MONITORING_SENTRY_TOKEN` | secret | Token from step 4 |
| `MONITORING_SENTRY_URL` | variable, optional | Only if the organisation lives on a regional address such as `https://de.sentry.io`; default `https://sentry.io` |
| `MONITORING_SPACES_BUCKET` | secret | Backup bucket name |
| `MONITORING_SPACES_ENDPOINT` | secret | Spaces endpoint, for example `https://<region>.digitaloceanspaces.com` (no bucket, no path) |
| `MONITORING_SPACES_KEY_ID` | secret | Key ID from step 3 |
| `MONITORING_SPACES_SECRET_KEY` | secret | Secret from step 3 |
| `MONITORING_SPACES_REGION` | variable, optional | Spaces region; default `us-east-1`, which Spaces accepts |
| `MONITORING_BACKUP_KINDS` | variable | Comma-separated kinds that are genuinely backed up in that environment: any of `core`, `weather`, `objects`, `sutron` (start with `core`). Listing a kind that is not backed up fails the check |
| `MONITORING_SECRET_EXPIRY_DATES` | variable | Comma-separated expiry dates of every credential in that environment that expires, each an ISO timestamp with a timezone, for example `2027-01-31T00:00:00Z,2027-03-15T00:00:00Z`. Dates only, never names. Any date within 21 days counts as a failure |
| `MONITORING_DB_ROLE` | variable, optional | Role from step 2; default `grenmet_monitor` |
| `MONITORING_DAILY_ENABLED` | variable | `true`, set last (step 8) |

### Step 6: turn on worker telemetry (#646)

- [ ] Set variable `TELEMETRY_ENABLED=true` in the existing **deploy**
  environments `staging` and `production` (read by `deploy.yml`), then deploy.
- [ ] Wait one full UTC day. The worker-jobs check reads the previous, fully
  elapsed UTC day of job counters, and needs every tracked job
  (`process_cap_jobs`, `ingest_cap_feeds`, `send_notification_emails`,
  `run_notification_sweeps`, which runs once a day at 10:00 UTC) to have run.
  The first complete receipt is the morning after the first full day.

### Step 7: switch the WSL auditor to runner mode

- [ ] If the WSL daily timer is enabled, add `"dailySources": "runner"` to
  `~/.config/grenmet-factory/audit.json` (mode 0600). The WSL daily run then
  keeps its health and certificate probes but leaves the seven sources to the
  runners. Without this it reopens the issues at 05:30 with "needs configuration".

### Step 8: enable

- [ ] The workflow only runs from `main`, so it starts once this change has been
  promoted to `main`.
- [ ] Set `MONITORING_DAILY_ENABLED=true` in `staging-monitoring`, and in
  `production-monitoring` when its inputs are ready.

### Step 9: run it once by hand and confirm the issues close

```bash
# 1. Dry run: collect and show what would change, without touching issues.
gh workflow run monitoring-daily.yml --ref main -f environment=both -f mode=dry-run
gh run watch "$(gh run list --workflow monitoring-daily.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

- [ ] In the run's summary, each `collect` job lists all seven sources as
  complete `yes`. A `no` shows a fixed reason, for example `backup marker
  unavailable` or `Sentry read token unavailable`; fix that input and repeat. The
  `publish` summary lists every `coverage:daily:*` observation as `pass` and the
  issues it would close.

```bash
# 2. Publish.
gh workflow run monitoring-daily.yml --ref main -f environment=both -f mode=publish
# 3. Confirm: the five issues are CLOSED.
for n in 644 645 646 647 648; do gh issue view "$n" --json number,state --jq '"\(.number) \(.state)"'; done
```

- [ ] Any new `codex-audit` issue such as "production eregister-sends needs
  attention" is a real problem, not a configuration problem; follow its runbook
  below. From now on the 04:50 UTC schedule keeps the issues current.

## Per-monitor detail

### #644 sentry

| Field | Detail |
| --- | --- |
| Inputs | `MONITORING_SENTRY_ORG`, `MONITORING_SENTRY_PROJECT`, `MONITORING_SENTRY_TOKEN` (steps 4 and 5). |
| What is counted | Unresolved issues first seen in the last 24 hours plus unresolved regressed issues seen in the last 24 hours, per environment project. Count only. |
| Also needed for the live path | Sentry projects `grenmet-staging` and `grenmet-production`; production secret `SENTRY_DSN_PRODUCTION`; the five alert rules in [analytics and monitoring](analytics-monitoring.md#sentry-releases-crons-and-alert-rules); organisation hardening from [Sentry hardening](sentry-hardening.md). |
| Alert to owner | Sentry issue and metric alert rules by email; #644 and "\<environment\> sentry needs attention" as GitHub issues. |

### #645 eregister-sends

The issue covers two sources, `eregister-sends` (email) and `wis2-sends`, both
read from the `eregister_send` table.

| Field | Detail |
| --- | --- |
| Inputs | The read-only role (step 2); optional `MONITORING_DB_ROLE`. |
| What is counted | `failed` sends plus `queued` sends older than 15 minutes, per target and environment. Non-zero is a real delivery problem: follow [WIS2 publishing runbook](wis2-publishing-runbook.md). |
| Alert to owner | #645 as a GitHub issue. There is no live email alert for a stuck send; eRegister staff see failed sends in the app. |

### #646 worker-jobs

The issue covers `worker-jobs` and `notification-sweeps`.

| Field | Detail |
| --- | --- |
| Inputs | `TELEMETRY_ENABLED=true` in the deploy environments (step 6). No Redis credential: the runner reads one key, `telemetry:v1:<environment>:jobs:<previous UTC day>`, from the Redis container with a single `HGETALL`. |
| What is counted | Failed runs of the four tracked jobs on the previous full UTC day. The report is complete only when all four recorded an outcome. Counters are best effort (a dropped increment is possible), so a count is a lower bound. |
| Alert to owner | Better Stack worker heartbeat (1 minute period, 2 minute grace) by email; Sentry cron monitors if `SENTRY_CRONS_ENABLED=true` reaches the worker; #646 as a GitHub issue. |

### #647 secrets

| Field | Detail |
| --- | --- |
| Inputs | `MONITORING_SECRET_EXPIRY_DATES` per environment (step 5). |
| What is counted | How many listed dates fall within 21 days. Add a calendar reminder for rotation so the issue is never the first warning, and update the list after each rotation. |
| Alert to owner | #647 as a GitHub issue. Better Stack also alerts 14 days before TLS certificate expiry. Rotation procedure for the authenticator key: [privileged MFA](privileged-mfa.md#encryption-key-rotation). |

### #648 backups

| Field | Detail |
| --- | --- |
| Inputs | `MONITORING_BACKUP_KINDS` and the four `MONITORING_SPACES_*` secrets per environment (steps 3 and 5). |
| What is counted | Each kind's `latest-success.json` marker in Spaces, checked by the same rules as `scripts/production/check-backup-age.py` (under 24 hours old, full coverage). A readable but stale or incomplete marker is a failure; an unreadable marker leaves the issue open as "needs configuration". |
| Production backup workflow inputs | Environment `production-backup` already holds `DO_SPACES_*` and `POSTGRES_USER`. Still unset on 2026-10-30: variable `BACKUP_MARKERS_ENABLED`, and variables `WEATHER_BACKUP_ENABLED` and `SUTRON_BACKUP_ENABLED` if those backups are wanted. Variable `CMS_BACKUP_ENABLED` exists. |
| Maintenance workflow inputs | `monitoring-maintenance.yml` (scheduled backup and weekly restore test) is off until variables `MONITORING_MAINTENANCE_ENABLED`, `MONITORING_REVISION` (a full approved commit SHA that matches the installed monitoring revision) and `MONITORING_STORAGE_VERIFIED=true` are set, and secret `BACKUP_HEARTBEAT_URL` exists in the production environment. Staging already has the secret; production does not. |
| Alert to owner | Better Stack backup heartbeat (24 hour period, 2 hour grace) by email; #648 as a GitHub issue. |

## Optional: the WSL advisory path

The WSL auditor can still collect these sources itself if the runner path is off.
It reads three private, local-only files (mode 0600, outside any repository):

| Local input | Purpose |
| --- | --- |
| `~/.config/grenmet-factory/audit.json` | Main auditor config. Shape: `scripts/agents/audit-config.example.json`. Needs `operationsConfig` (path of the next file) and, for Sentry, `receipts.sentry`. Leave out `dailySources` for this path. |
| The operations config file named by `operationsConfig` | Per-environment (`staging`, `production`) read-only `databaseUrl`, `telemetryRedisUrl`, `backupKinds`, and `secrets` expiry dates. |
| `~/.config/grenmet-factory/audit-operations.conf` | systemd `EnvironmentFile` with the read-only Spaces credentials (`DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`). |

This path needs network access from the WSL host to both private databases and
Redis instances, and only runs while the host is awake; that is why the runner
path is primary. Shapes: [advisory audit](../agents/advisory-audit.md#operational-coverage-and-private-configuration).

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

1. Steps 1 and 2: monitoring environments and read-only roles (unblocks #645).
2. Steps 3 and 5 for Spaces and `MONITORING_BACKUP_KINDS` (clears #648 quickly).
3. `MONITORING_SECRET_EXPIRY_DATES` (clears #647).
4. Step 4 Sentry token (clears #644).
5. Step 6 telemetry, then wait a full UTC day (clears #646).
6. Steps 7 to 9: WSL runner mode, enable, dry run, publish, confirm.
7. Better Stack production apply, heartbeats and test alert (live alerting).

## Unknowns to settle with the owner

- Whether email to one inbox is acceptable out of hours, or a phone-reaching channel is needed.
- Which backup kinds are genuinely in production use (`weather`, `objects`, `sutron`).
- The Sentry plan limits for cron monitors and retained events.
- Whether the Sentry organisation uses the default or a regional API address.
