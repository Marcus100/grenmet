# September launch and recovery checklist

Prepared 23 September 2026; **draft pending operator exercise and acceptance**.
Use the existing [release runbook](release-runbook.md) for actual deployment and
rollback commands and [infrastructure record](../infrastructure.md) for backups.
This checklist adds journey evidence; it does not replace either runbook.

## Before September 29 review

Eugine records the exact candidate revision, image digests, enabled services,
configuration fingerprint, migration heads and rollback-compatible prior
manifest. Name operational acceptance and incident owners in the
[readiness ledger](launch-readiness-coverage.md). Check no unrelated HR work or
unapproved pilot migration has entered the candidate.

Exercise restore into an isolated environment from a real backup. Record backup
identifier/time, restored database names, media/object versions, duration and
the expected recovery point/time agreed by the owner. Verify a saved product and
PDF revision, CMS publication, CAP lifecycle/audit and observation draft after
restore. A backup file's existence is not a successful restore.

Record monitoring evidence for API, worker heartbeat, database, object storage,
WxWatch source age and publication failures. Test an alert reaching the named
operator; a dashboard alone does not prove escalation works.

## Connected release checks

Use controlled non-production records. For J-CMS record edit/save/reopen/review/
publish, private-draft checks, three section placements, exact links/downloads
and measured publish-to-public delay. For each public/marine/tropical forecast,
record preview, publish, subsequent draft edit, correction, expiry and saved PDF.
The previous published snapshot must stay stable while a new draft is edited.

CAP exercises must remain Test/Exercise in an isolated sandbox and excluded
from actual public feeds. Verify approval policy, updates/cancellations,
configuration permissions and failure/retry audit history. J-WxWatch requires
missing, stale, failed and recovered source states with provenance. J-Obs
requires persisted structured data and imported/staff separation; do not assume
unimplemented lifecycle actions. HR evidence is supplied by the separate owner.

For WIS2 follow the [existing publisher runbook](wis2-publishing-runbook.md):
verify sandbox isolation, unique source record/time, decoder outcome, CSV,
BUFR hash, matching notification identifier and actual retrieval. Keep queued,
generated, published and received distinct. For aviation record chosen profile,
input hash, output hash and every required validation stage; required skips fail
the gate. Receiver receipt needs independent evidence.

## Failure and rollback

Stop the affected release for unauthorised access, unsafe publication, data loss
or failed essential recovery. Preserve evidence and accepted manual procedures.
Do not repeatedly publish when a timeout leaves the result unknown: inspect the
saved record, revision and audit first. Do not restore a whole database over
new operational records without a reviewed recovery plan.

Eugine uses the prior compatible manifest and runbook only after checking schema
compatibility. Retain current and prior record counts/artifact hashes, repeat
affected journeys, and document any manual reconciliation. No automatic database
downgrade. If required sandbox evidence is missing, obtain Eugine's explicit
hold/reduced-release decision and describe the omitted capability accurately.

## After deployment

Record actual deployment time/revision, health checks, authorised/unauthorised
access, representative public content and product revisions, cache refresh,
warning isolation, source freshness and recovery contacts. Deployment evidence
does not replace staff acceptance. Add a dated adoption/recovery follow-up and
prioritised next-release work; Clean/Quality release only after pilot acceptance.
