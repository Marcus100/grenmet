# Launch-day run sheet

**Status:** Draft for the owner (issue #927). Names, numbers and times are filled in privately  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-02

One page for the production release. Roles only: the owner keeps real names and
phone numbers in the private contact sheet described in the
[incident runbook](incident-runbook.md#who-to-contact). The release procedure itself
is the [release runbook](release-runbook.md); this sheet adds who watches what and
what to do when something goes wrong. Never deploy to production, merge to `main` or
publish a release without the owner's explicit go.

## Before the day

| Check | Where | Done |
| --- | --- | --- |
| Restore drill has passed on real backups, time recorded | [restore drill](restore-drill.md), [launch checklist](launch-checklist.md#restore-drill) | open (not yet run) |
| Build-once pipeline merged and its first staging deploy verified (`/runtime-env.js`, Sentry, Turnstile) | [release runbook](release-runbook.md#build-once-promote-by-digest) | lands with PR #1026, #1020, #1025 |
| GitHub environment `build` exists with `SENTRY_AUTH_TOKEN`, `SENTRY_DSN_PRODUCTION` | release runbook | owner |
| Staging deployed the exact tree that will be released | `gh run list --workflow=pipeline-staging.yml --limit 1` | |
| Production runner online | `gh run list --workflow=pipeline-prod.yml --limit 1` | |
| Backup under 24 hours old, backup id in the release notes | **Backup database**, [backup gate](release-runbook.md#backup-gate) | |
| Release notes checklist done | [release notes checklist](release-runbook.md#release-notes-checklist) | |
| Authenticator enforcement and support mailbox state known | [launch checklist](launch-checklist.md) | |

## Who watches what

| Role | Watches | Tool |
| --- | --- | --- |
| Release lead (owner) | Go and no-go; the release publish; rollback decision | GitHub Releases, `pipeline-prod.yml` |
| Deploy watcher | The production deploy run, phase by phase, and the smoke tests | `gh run watch` |
| Application watcher | Error rate and new issues after the deploy | Sentry |
| Warnings watcher | A CAP or forecast warning published during the window reaches its feed | below |
| Client contact (GAA/GMS) | Told before and after; decides public messaging for weather and aviation | per incident runbook |

One person may hold several roles; the release lead and the deploy watcher should be
different people when possible.

## Sequence

1. Owner confirms staging acceptance and gives the go.
2. Promote `staging` to `main` by pull request ([release runbook](release-runbook.md#3-promote-staging--main)).
3. Owner publishes the release. `pipeline-prod.yml` deploys (from PR #1026 it promotes
   the staging-verified digests; before that it builds at the tag).
4. Deploy watcher reports each phase: backup gate, pull, migrations, start, smoke.
5. Run the verification below. Announce done, or roll back.

## Verification

- API health: `curl -fsS https://api.barrels.gd/api/v1/utils/health-check/`
- Spot-check `auth`, `admin`, `docs`, `weather`, `signal`, `mbia`, `events` and `hapi` on `.barrels.gd`.
- `/runtime-env.js` on each web app returns production values; Sentry and Turnstile load.
- Weather products list: `GET /api/v1/wxproducts/public/products` returns `{ "products": [...] }`; the public weather site shows current forecasts and warnings.
- CAP feed is reachable and valid (see [CAP desk acceptance](cap-desk-acceptance.md)).
- No new Sentry issues in the first 30 minutes.

## If a warning fails to publish

A missed public warning is a P1 for the client (see severity levels in the
[incident runbook](incident-runbook.md#severity-levels)).

1. The forecaster or duty officer tells the incident lead and the client contact at once.
2. Check the desk: was the product saved and published, and what error did it show?
   Check the API health and the latest Sentry errors for the wxproducts and cap domains.
3. If the platform cannot publish, the client issues the warning through its own
   existing channels and the incident lead records that it did. Do not delay a
   warning waiting for a fix.
4. If the cause is the release, roll back (below) and tell the client.

## Rolling back

Follow [rollback by digest](release-runbook.md#rollback--redeploy): dispatch **Deploy**
for production with the last good release's `production-sha-<commit>` tag and its
digest list. This does not undo database migrations; the current CMS migrations are
additive and the old image runs against them
([CMS migrations table](release-runbook.md#cms-migrations-payload-database-gmscms)).
If data is wrong, stop and ask the owner before any restore. Do not roll back to an
image from before encrypted TOTP support if authenticator enforcement is on
([incident runbook](incident-runbook.md#rollback)).

## After

Owner posts the all-clear. Record timings, anything worked around and open items
in [post-launch review](post-launch-review.md) and `SESSION_LOG.md`.
