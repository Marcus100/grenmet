# Analytics and monitoring rollout

**Status:** Dev implementation; staging availability pilot active; production rollout pending
**Owner:** Barrels Grenada engineering
**Last updated:** 2026-10-03

Roll out **development → staging → production**. A successful `dev` push is not
production delivery. No subscriptions, overages, infrastructure, automatic AI
remediation, Discord integration or application deployment was added in this pass.

## Source of truth

[Service catalogue](../../packages/ui/src/lib/service-catalogue.json) records every
app, owner, environment, deployment target, provider mapping and coverage status.
`development` means local dev; it is not staging. Personal and NISA application
code is outside this repository. NISA's URL and ownership remain unconfirmed.
Events is currently an organiser console, so optional public analytics is disabled.

GA4 and PostHog mappings are public ingestion identifiers, never management
credentials. No mapping means no collection. Retention and access controls must
both be verified before a mapping can become configured. The validator rejects
reused destinations across apps/environments, staff GA4, malformed hosts and
unsupported delivery claims. Empty mappings are deliberate; do not copy legacy
shared keys into every row.

Build and runtime Sentry routing use the same catalogue. The old environment-wide
DSN and PostHog fallbacks no longer activate a new build. Existing deployed builds
are unchanged. **Do not promote until intended error-reporting mappings have been
reviewed**: otherwise unmapped integrations will be disabled by design. Source-map
upload and browser/server releases use `NEXT_PUBLIC_RELEASE` (the build commit).
Performance transactions are dropped and sampling remains zero until sanitation
and free quota can be verified; replay/profiling/log ingestion remain disabled.

## Public collection

The shared provider serves Elections, GMS, Docs, Signal and MBIA. It imports the
existing PostHog SDK only after consent, and loads GA4 only after consent. Acceptance
and decline have equal button treatment; Privacy settings remains available.
Consent is site-local for 183 days, with browser DNT/GPC taking precedence.
Withdrawal stops adapters and removes managed/legacy analytics identifiers.
No fallback IDs, user identity, arbitrary paths, queries, fragments, search text,
form values, draft IDs or election predictions are sent. No campaign collection
is enabled until campaign codes and referrer hosts have a reviewed allowlist.

The typed version-1 event catalogue and runtime validator reject unknown events
and properties. Explicit interactions are marked at reviewed links or handlers;
SDK DOM autocapture is disabled. Elections captures year/map changes, opening a
constituency in the atlas, the forecast page, CSV clicks and successful clipboard
sharing without map contents. GMS forecast tabs and public section navigation,
Docs/Signal content sections, and selected MBIA/Signal navigation links are wired.
Not every planned surface is instrumented yet: published warning/download actions,
MBIA external links/filters, full staff/CMS business outcomes and the homepage link
conversion remain rollout work. The static homepage exposes a no-collection
privacy notice and keeps its script-free build until its integration is reviewed.

G-6PY9N83HCP was present in the staging GitHub variables. Ownership and whether it
is a dedicated staging property were not confirmed. It is not used by the new
consent-gated implementation. Historical provider data is not deleted.

## Operational collection

FastAPI request logs now use registered route templates, status and duration;
they no longer print raw paths, Origin or request-header values. Optional Redis
counters use status classes and coarse timings, with 14-day expiration and a
50 ms failure bound. They count requests, **not people**. Auth's duplicate
Next.js/PostHog producer was removed: API status totals are the available auth
aggregate, not a claim of end-to-end workflow completion.

ARQ records four scheduled job completion/failure totals after the operation,
with atomic Redis deduplication by a hash of the execution ID. A worker heartbeat
means a successful CAP polling run, not startup and not proof that every queued
business operation succeeded. Individual delivery failures remain in their
existing durable outboxes/Sentry. Retry counts and queue-age reporting still need
an explicit operational export.

Internal commands (no public telemetry endpoint or database migration):

```bash
# From apps/api/fastapi, with the correct environment's Redis:
TELEMETRY_ENABLED=true TELEMETRY_ENVIRONMENT=development \
  TELEMETRY_REDIS_URL=redis://host.docker.internal:6379/0 \
  uv run --frozen --package fast-back python -m src.metrics_report --days 1

# From the repository root; outputs are new governed datasets:
python3 scripts/monitoring/probe.py --environment staging \
  --output /tmp/staging-probes.jsonl --state /tmp/staging-probe-state.json
python3 scripts/monitoring/report.py --samples /tmp/staging-probes.jsonl \
  --output /tmp/monitoring-reports
python3 scripts/monitoring/provider-evidence.py --output /tmp/provider-evidence.json
```

Redis reports use UTC calendar-day buckets and label partial coverage. Probe
reports contain rolling 24-hour and 7-day windows and separate Barrels, GAA,
personal and unconfirmed owners. Missing provider data is null/unknown; a real
observed zero remains zero. Stale probe data cannot imply current health.
The CLI evidence export uses read-only GitHub/Sentry access, excludes issue text
and identities, and keeps legacy mixed-project Sentry counts unattributed.
It does not pretend that an empty production error query proves working delivery.

## Live evidence on 2026-10-02

- [Staging API readiness monitor 5014248](https://incidents.betterstack.com/team/t476349/monitors/5014248): up; checks every 180 s; validates TLS and `"status":"ready"`; confirmation/recovery 180 s; email only.
- [Synthetic incident 1026034957](https://incidents.betterstack.com/team/t476349/incidents/1026034957): email sent at 18:15:51 UTC, opened at 18:16:11, acknowledged at 18:16:19, resolved at 18:18:43. No application outage was induced. Recovery email receipt is not yet evidenced.
- [Staging probe snapshot](monitoring-evidence/2026-10-02-staging-probes.jsonl): all nine configured HTTPS surfaces returned 200. This is one observation, not continuous availability.
- [Provider summary](monitoring-evidence/2026-10-02-providers.json): observed Sentry staging issue activity and partial GitHub run counts; no app-specific synthetic delivery/source-map verification.
- DigitalOcean staging Droplet 567264159: CPU and memory >90%, disk >80% warning and >90% critical, sustained 5 min, email to the agreed recipient. IDs: `90bb5699-a62d-404b-a592-c1c528c0e7d0`, `f18809be-b9f9-41e6-86ab-9a0983ab7f14`, `9865ac9a-89be-42e6-b7e1-7b02455ceebd`, `b1f33fa9-099a-459f-925d-13726b9f764c`. Alert configuration is verified; actual threshold-crossing receipt is not.
- Before the rollout-order clarification, production's mislabeled memory alert was corrected from CPU to memory and disk >90% alert `31773e62-6ba9-48ce-a1a1-4b8c613bfeb8` was added. Existing production CPU/disk warning policies were preserved. No application deployment occurred.

## Heartbeats and installation

Three staging heartbeats exist. The probe runner is installed on staging, scheduled every five minutes and verified **Up** in Better Stack; backup and worker heartbeats remain paused:

| Purpose | ID | Period + grace |
| --- | --- | --- |
| Secondary probe runner | 501599 | 5 + 10 minutes |
| Verified core backup | 501600 | 24 + 2 hours |
| Worker polling completion | 501601 | 1 + 2 minutes |

Copy each heartbeat URL from Better Stack into protected host/provider settings;
the URLs are credentials and are not stored in this repository. The backup hook
runs only after every required dump, upload, remote size check and completion
marker succeeds; bootstrap backups missing CMS never send success. Set
`BACKUP_HEARTBEAT_URL` on the actual scheduled backup process. The old manual
marker-age workflow is not an active scheduled monitor.

For the worker set `TELEMETRY_WORKER_HEARTBEAT_URL`. Enable request/job counters
with `TELEMETRY_ENABLED=true`, `TELEMETRY_ENVIRONMENT=staging`, and
`TELEMETRY_REDIS_URL` pointing at existing Redis. These settings must be supplied
by the deployed service; local code alone does not enable them.

The supplied `scripts/monitoring/probes.service` and `probes.timer` are host
installation templates. Set `/etc/grenmet/monitoring.conf` to environment-specific
`MONITORING_ENVIRONMENT` and `PROBE_HEARTBEAT_URL`; protect it with mode 0600 and
set the checkout path/user to the actual host installation. Install the units,
run one successful job, then enable the timer and unpause the heartbeat. Do not
run two environments against the same state file. The runner refuses redirect
responses and records every target separately, opens state after two failures
and emits one recovery transition. The heartbeat is withheld if any checked
target fails. With `PROBE_INCIDENTS_ENABLED=true`, per-target incidents open after repeated
failures and resolve once on recovery. A protected team token is required. The
runner heartbeat then tracks probe execution and incident delivery separately from
target health. Uncertain incident creation is reconciled by a persisted episode ID;
it is never blindly retried. `PROBE_MAINTENANCE` declares app-keyed UTC start/end
windows (maximum 48 hours), suppressing incident changes during maintenance.

The probe runner retains its new journal for 14 days and sanitized monthly
sample totals for at most 24 calendar months in the same atomic journal. No cleanup applies to old datasets. The owner installed the probe
service through SSH; CI/CD adoption is prepared below. Worker settings and scheduled
backup hooks are not yet live.

## Remaining promotion gates and owner steps

1. In Better Stack Uptime billing, verify actual included monitors/heartbeats and
   zero paid overages. The advertised allowance is ten of each; the MCP does not
   expose subscription limits. The account currently has the staging pilot, the
   pre-existing paused Google monitor and three paused heartbeats. No plan change
   was made. Repurpose/remove the Google test and retire the staging direct pilot
   before allocating all ten planned production slots; staging moves to probes.
2. Confirm ownership of the GA4 ID and provide access to the intended GA4/PostHog
   properties. Set retention/access boundaries and disable Enhanced Measurement,
   advertising and automatic capture before adding mappings. Verify one synthetic
   event per app/environment/release in each enabled dashboard.
3. Review Sentry plan/access boundaries, provision separate destinations as the
   free allowance permits, enter their public DSNs/projects in the catalogue, and
   verify browser/server/worker delivery and exact-release source maps. Do not
   reuse the legacy shared project to work around an access boundary.
4. Provide an existing SSH session/agent for the staging host, or have the host
   operator install the runner/settings above. Confirm a real complete backup and
   worker heartbeat, then verify a missed heartbeat and recovery email.
5. Finish the marked remaining event/reporting/retention work, real-browser
   consent acceptance, staging deployment and quota review. Only then promote
   through the existing production release process and allocate the ten direct
   production monitors. Keep production certificate failures from the
   [domain investigation](domain-configuration.md) open until rechecked/fixed.

Alerts go to the owner-authorized `euginegnd@gmail.com`. The application remains
usable with optional collection disabled. Rollback removes provider mappings;
rebuild browser bundles through the same release gates.


## CI/CD ownership and activation

The revised rollout prioritizes operations, daily staging backups and weekly isolated
restore drills. Preserve `dev → staging → main → versioned production release` and
require at least 24 hours of staging evidence before production promotion.

- `Monitoring provider configuration` previews or applies declared Better Stack
  resources from a trusted staging branch or production release tag. It adopts
  existing IDs, preserves unrelated resources, never deletes or changes billing,
  and refuses creation until account limits are verified. New resources start paused.
  Its manually dispatched `test-alert` operation opens and resolves a clearly labelled
  synthetic incident; it records provider acceptance, never claims email/recovery
  receipt without owner confirmation. A failed resolution requires checking the
  linked TEST ONLY incident in Better Stack.
- Deployment installs versioned probe code after application smoke checks when
  `MONITORING_DEPLOY_ENABLED=true`. It requires existing administrator privileges;
  it does not grant sudo access. A failed probe restores previous configuration.
  Existing state and journals remain in `/var/lib/grenmet-monitoring`.
- `Monitoring maintenance` runs daily at 02:17 UTC and restores weekly Sunday at
  04:17 UTC. The workflow must first land on `main`, where GitHub schedules execute.
  Its protected environment variable `MONITORING_REVISION` must equal the full SHA
  installed in `/opt/grenmet/monitoring-revision`; no mutable ref is accepted.
- Set `MONITORING_STORAGE_VERIFIED=true` only after checking the existing storage
  capacity, lifecycle and cost limits; both manual and scheduled jobs require it.
- Set `MONITORING_MAINTENANCE_ENABLED=true` only after a manual backup and restore
  pass, the existing Spaces lifecycle/capacity/cost are verified, and the backup
  heartbeat is ready. Production remains disabled until staging acceptance.
- Backup, restore and deploy share environment concurrency and the existing host
  maintenance lock. Existing production backup remains unchanged during the pilot;
  disable its old schedule before enabling the replacement production schedule.
  Scheduled runs currently select staging only; production is manual-dispatch only
  and still requires the approved installed revision and protected secrets. Add production to the scheduled matrix in its reviewed promotion.
- Restore uses the running database's immutable local image in a dedicated container,
  no network, one CPU, a 1 GiB memory limit with no extra swap, and a bounded
  1 GiB temporary database filesystem. Larger restores fail rather than filling the
  application host; increasing this bound requires a capacity review. It requires 2 GiB available host RAM
  and free disk of at least max(5 GiB, ten times compressed dump bytes). Capacity
  shortfalls fail the drill; never resize infrastructure automatically.
- Every required database is restored with errors fatal and application-table presence
  checked. Domain-specific representative-record checks are still pending; restoration
  evidence must not yet be called complete recovery acceptance.
- Sanitized JSON/Markdown maintenance artifacts are retained for 14 days. Dumps and
  credentials are never artifacts; temporary local backup copies are cleaned up.

Required environment secrets: `BETTERSTACK_API_TOKEN` (team scoped),
`PROBE_HEARTBEAT_URL`, `BACKUP_HEARTBEAT_URL`, `WORKER_HEARTBEAT_URL`, and the existing
`DO_SPACES_*` credentials. Inspection on 2026-10-03 confirmed staging contains all four monitoring secret
names and the existing Spaces secret names. Secret presence is verified; token
validity remains unverified until the CI provider preview succeeds. Set `TELEMETRY_ENABLED=true` separately to enable
bounded request/job counters. Provider-created resources do not prove SDK delivery.

Remaining live gates: provider free-account limits, credential validation, approved commits
and workflow publication, runner installation privileges, storage lifecycle/capacity,
app-specific Sentry mappings/source maps, controlled incident recovery delivery,
live per-target incident/maintenance validation and 24-hour staging observation. No production application was deployed by this work.

Host monitoring scripts support Python 3.11+ (staging currently has Python 3.12).
Format them with `ruff format --isolated --target-version py311`; the API's
Python 3.14 formatter defaults can otherwise introduce incompatible exception syntax.
The standard delivery suite runs these scripts with the host `python3`.
