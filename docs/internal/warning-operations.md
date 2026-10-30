# Warning Operations

**Status:** Active reference  
**Owner:** GMS (operational content); maintained by Barrels Grenada  
**Last updated:** 2026-10-30

This document maps the GMS warning workflow to the current codebase. The strategic warning framework — lifecycle, severity levels, IBF matrix, and content contract — lives in [../operations/warning-ibf-framework.md](../operations/warning-ibf-framework.md). This file is the engineering contract for what is implemented now.

## Implemented Surface

FastAPI includes a CAP domain under `apps/api/fastapi/src/cap`.

Management routes are mounted at `/api/v1/cap` and require authenticated users. Public feed routes are mounted at `/api/cap`.

The domain stores:

- CAP alert header records.
- CAP info blocks.
- Areas, polygons, multipolygons, circles, and geocodes.
- Resources, references, and incidents.
- XML snapshots.
- CAP settings and predefined areas.
- Webhook, MQTT broker (kept, not yet delivering), feed-import, and job-event records.
- Audit events.

## Lifecycle

Per [ADR-0023](../adr/0023-cap-approval-before-publish.md) (supersedes
[ADR-0013](../adr/0013-cap-alert-self-publish-and-bulletin-linkage.md)'s
self-publish, amended 2026-10-23 and 2026-10-25), a CAP Alert must have an
approval on record before it can be published. The author may approve their own
alert; a colleague's review is optional and is recorded in the audit trail. Only
the duty supervisor may emergency-publish without approval, with a mandatory
reason, always audited. The diagram shows the states; normal publish is only
from APPROVED:

```text
DRAFT ---------------------------------> PUBLISHED -> EXPIRED
  |                                          ^
  v                                          |
SUBMITTED -----------------------------------+
  |                                          |
  v                                          |
APPROVED -------------------------------------
                                              |
                                              v
                                          CANCELLED
```

Supported actions:

| Action | Endpoint | Required state | Next state | Permission |
| --- | --- | --- | --- | --- |
| Create | `POST /api/v1/cap/alerts` | N/A | `DRAFT` | `cap.alert.create` |
| Edit | `PATCH /api/v1/cap/alerts/{alert_id}` | `DRAFT`, `SUBMITTED`, `APPROVED` | `DRAFT` (an edit voids submission or approval) | `cap.alert.edit` |
| Duplicate | `POST /api/v1/cap/alerts/{alert_id}/duplicate` | any readable alert | `DRAFT` copy | `cap.alert.create` |
| Validate | `POST /api/v1/cap/alerts/{alert_id}/validate` | any readable alert | unchanged | `cap.alert.read` |
| Submit for approval | `POST /api/v1/cap/alerts/{alert_id}/submit` | `DRAFT` | `SUBMITTED` | `cap.alert.submit` |
| Approve | `POST /api/v1/cap/alerts/{alert_id}/approve` | `SUBMITTED` | `APPROVED` (the author may approve their own alert) | `cap.alert.approve` |
| Publish | `POST /api/v1/cap/alerts/{alert_id}/publish` | `APPROVED` with an approval on record | `PUBLISHED` or `CANCELLED` for cancel messages | `cap.alert.publish` |
| Emergency publish | `POST /api/v1/cap/alerts/{alert_id}/emergency-publish` (body `reason`, required) | `DRAFT`, `SUBMITTED`, or `APPROVED` | `PUBLISHED`; audited as `emergency_publish` | `cap.alert.publish_emergency` (duty supervisor) |
| Cancel | `POST /api/v1/cap/alerts/{alert_id}/cancel` | `PUBLISHED` | `CANCELLED` | `cap.alert.publish` |
| Expire | `POST /api/v1/cap/alerts/{alert_id}/expire` | `PUBLISHED` | `EXPIRED` | `cap.alert.publish` |

Publishing validates the alert, generates CAP XML, stores a snapshot, queues publish side-effect records, and writes an audit event.

### Linkage to authored bulletins (ADR-0013)

When a CAP Alert escalates a Marine Bulletin or a Hazard Bulletin
(`wxproducts`), the author records the source product's kind, ID, and
revision in the CAP Alert's `note` field — a manual convention, not a
database relationship. There is no automated cascade: withdrawing the source
bulletin does not automatically cancel its CAP Alert, and vice versa. The
admin UI shows a reminder at both withdraw (bulletin side) and cancel
(CAP side) prompting the author to check the other one — for a
Hazard-Bulletin-sourced alert specifically, cancelling the CAP Alert should
be followed by withdrawing the bulletin, since it has no standing reason to
stay public once the hazard it flagged has been called off. A PWS-sourced
alert (Marine Bulletin, a general forecast) does not need its source
withdrawn on cancellation — the source remains a valid scheduled record
regardless.

## Validation

CAP payload validation is implemented in three places:

- Pydantic schemas validate basic shape and time-order constraints.
- `src.cap.validation.validate_cap_alert` validates warning-content requirements before publication.
- `src.cap.xsd` checks the generated XML against the official OASIS CAP 1.2 schema (`src/cap/standards/CAP-v1.2.xsd`, see its README) before publication, cancellation and import. A document that does not conform is refused with 422 and the refusal is logged. Malformed XML on import is a 400.

Publication fails with 422 if CAP validation errors are present or the XML does not conform to the schema. The schema check is structural. The rules it cannot express (for example, a Restricted scope needs a restriction) stay in `validate_cap_alert`.

## Audit Trail

The CAP domain records audit events for create, update, submit, approve, publish, cancel, expire, and settings update actions.

Audit events store:

- Alert ID when applicable.
- Actor user ID.
- Action.
- Previous state.
- Next state.
- Note.
- Payload.
- Created timestamp.

Use `GET /api/v1/cap/audit` with optional `alert_id` to inspect events. This requires `cap.alert.read`.

## Public Dissemination Feeds

Public endpoint definitions are the API contract — see [docs/api/contracts.md — Public CAP Feed Contract](../api/contracts.md#public-cap-feed-contract).

An alert is active when it is `PUBLISHED` and has no expired info block, or at least one info block with an expiry after the current UTC time.

## Publish Side Effects

Publishing creates durable `CapJobEvent` rows, and the ARQ worker (`process_cap_jobs`, `src/worker/main.py`) processes them with retries and backoff. The rows cover:

- `publish.webhooks`
- `publish.static_map`
- `publish.pdf`
- `publish.social_image`
- `publish.last_known_good`
- `publish.email`
- `publish.push`

MQTT and WIS2 are not queued. Owner decision (2026-10-30): MQTT is not planned, and WIS2 publishing starts once the local wis2box is live. Until then the integrations view reports both as `not_configured`. A job row never says "skipped" for a channel that is not configured.

## Operational Rules

- Publishing needs an approval on record. The author may approve their own alert. A colleague's review is optional and recorded, never a gate. Emergency publish (duty supervisor, reason required) is the only route without approval.
- Every official published alert must have a validation result with no errors.
- Use cancel for active published alerts that need cancellation. Use expire when the valid period has ended.
- Do not delete official warning records as a normal workflow. Archive through state and snapshot history.
- Public feeds must only expose published, expired, or cancelled alerts.
- Duplicate prevention should be based on CAP `identifier` and XML snapshot history.

## Current Gaps

- MQTT is not planned. WIS2 publishing waits for the local wis2box (see Publish Side Effects).
- No automated stale-alert expiry job.
- No alert consistency check across website, XML, RSS, and future channels.
- Individual SOPs pending formal approval — index and status at [docs/operations/sop-index.md](../operations/sop-index.md).

