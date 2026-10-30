# Incident runbook for the launched product

**Status:** Draft runbook for launch; roles to be filled by the owner  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-30

A short first-response guide for the Barrels Grenada platform and its public
apps. It deliberately links to existing text instead of repeating it:

- Severity definitions and the meteorological service procedure:
  [cybersecurity continuity, section 7](cybersecurity-continuity.md#7-incident-response).
- Diagnosis commands and health checks: [infrastructure, incident triage](../infrastructure.md#incident-triage).
- Redeploy and rollback: [release runbook, rollback](release-runbook.md#rollback--redeploy).
- Backups and restore: [infrastructure](../infrastructure.md#backups-and-restore)
  and [restore drill](restore-drill.md).
- Privileged sign-in lockout: [privileged MFA](privileged-mfa.md#recovery-acceptance-and-break-glass-procedure).
- Host and network hardening: [host hardening](host-hardening.md).

The repository is public. Keep names, personal data, client material, secrets and
raw logs out of issues, pull requests and this page; record them in the private
incident record instead.

## Severity levels

Use the P1 to P4 table in [cybersecurity continuity](cybersecurity-continuity.md#incident-classification);
it is the single source. Launch-day examples that map to it:

| Level | Product example |
| --- | --- |
| P1 | A wrong or unauthorised weather warning or CAP alert published; a weather or aviation product compromised; the public weather or alert site down during an active hazard. |
| P2 | API or database down; a leaked or suspected-leaked credential; a failed deploy that left production unhealthy; data exposed to the wrong person. |
| P3 | One channel failing (email, push, a single app); backups or heartbeats missing; a worker job stuck. |
| P4 | Suspicious sign-in attempt, one-off error spike, configuration drift. |

When unsure, pick the higher level and downgrade later.

## First 15 minutes

| Minute | Action |
| --- | --- |
| 0 to 2 | Note the time (UTC) and open a private incident record. Say what is observed, not what is guessed. Pick a severity. |
| 2 to 5 | Contain. If wrong data is being published, take the product down or withdraw it rather than leave it up (for CAP alerts use the cancel flow). If a credential may be exposed, treat it as burned: rotate it in the provider first, then in the GitHub environment secret, then redeploy. |
| 5 to 10 | Find the smallest failing boundary with [infrastructure, incident triage](../infrastructure.md#incident-triage): DNS and TLS, container health, API liveness and readiness, logs, database, last deploy. Check Sentry and the Better Stack incident list. |
| 10 to 15 | Decide: roll back, fix forward or wait. If the last deploy is the likely cause, roll back (below). Tell the people in [Communication](#communication). |

Do not delete evidence: keep logs, the failing image tag and the time line before
changing anything.

## Rollback

Follow [release runbook, rollback and redeploy](release-runbook.md#rollback--redeploy):
dispatch the Deploy workflow with the production environment and the last good
release tag. Rolling back does not undo database migrations; if the failing
change included an irreversible migration, go to the backup gate in the
[release runbook](release-runbook.md#irreversible-data-migrations-need-a-verified-backup-first)
and the [restore drill](restore-drill.md) rather than guessing. Never push `dev`
directly or deploy to production without the owner (see `AGENTS.md`).

An emergency sign-in lockout caused by authenticator enforcement follows the
break-glass steps in [privileged MFA](privileged-mfa.md#recovery-acceptance-and-break-glass-procedure);
there is no per-user bypass.

## Who to contact

Roles only. The owner records the actual people and numbers in a private contact
sheet that is also printed and kept offline (the physical list is an open gap in
[cybersecurity continuity, gaps](cybersecurity-continuity.md#10-gaps-requiring-closure)).

| Role | Responsibility | Contact in private sheet |
| --- | --- | --- |
| Incident lead (platform owner) | Classifies, decides, runs the response, writes the record. | To fill |
| Backup responder | Takes over when the incident lead is unavailable or asleep. | To fill, currently none named |
| Infrastructure host contact | Droplet, network, DNS and Cloudflare access. | To fill |
| Client programme sponsor (GAA/GMS) | Told for any P1 or P2 that touches their products; decides public messaging for weather and aviation. | To fill |
| Client operations lead | Formal escalation for public-safety or legal exposure. | To fill |
| Product support contact | Answers users; see the support route in [launch checklist](launch-checklist.md). | To fill |
| Legal and privacy adviser | Consulted on any personal-data breach before notifying anyone. | To fill |

## Communication

| Audience | When | How |
| --- | --- | --- |
| Client sponsor | Immediately for P1 and P2 affecting their products | Phone or the agreed channel, then a written note |
| Affected staff | When their tools are down or data is wrong | Short message with workaround (manual procedures in [SOP index](sop-index.md)) |
| Public | When warnings or public product availability is affected; the client sponsor owns this | The channels listed in the backup dissemination section of [cybersecurity continuity](cybersecurity-continuity.md#8-backup-dissemination-channels) |
| Individuals and regulators | If personal data was exposed | Only after the legal adviser confirms obligations; do not improvise wording |

State facts, impact, what is being done and the next update time. Do not speculate
about cause in public.

## After the incident

Within 5 working days, write the review: timeline, impact, cause, what worked,
what did not, and actions with owners and due dates. Use the structure and
backlog method in [post-launch review](post-launch-review.md), record the
findings in [launch findings](launch-findings.md) and, for repeated friction,
open GitHub issues. Update this runbook and the affected controls so the same
incident cannot recur silently.

## Open items for the owner

- Name the roles above in the private contact sheet and print a copy.
- Decide who watches alerts out of hours; see [launch monitoring inputs](launch-monitoring-inputs.md#how-an-alert-reaches-the-owner).
- Practise once on staging: a rollback, and a restore (the [restore drill](restore-drill.md) has never been run).
- Have a lawyer review the breach-notification step; this page contains no legal text.
