# Warning Operations

This document maps the GMS warning workflow to the current codebase. The strategic warning model lives in [../architecture.md](../architecture.md). This file is the operational contract for what is implemented now.

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
- Webhook, MQTT, feed-import, and job-event records.
- Audit events.

## Lifecycle

The implemented lifecycle states are:

```text
DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED -> EXPIRED
                                      |
                                      v
                                  CANCELLED
```

Supported actions:

| Action | Endpoint | Required state | Next state | Permission |
| --- | --- | --- | --- | --- |
| Create | `POST /api/v1/cap/alerts` | N/A | `DRAFT` | `cap.alert.create` |
| Edit | `PATCH /api/v1/cap/alerts/{alert_id}` | `DRAFT`, `SUBMITTED`, `APPROVED` | unchanged | `cap.alert.edit` |
| Duplicate | `POST /api/v1/cap/alerts/{alert_id}/duplicate` | any readable alert | `DRAFT` copy | `cap.alert.create` |
| Validate | `POST /api/v1/cap/alerts/{alert_id}/validate` | any readable alert | unchanged | `cap.alert.read` |
| Submit | `POST /api/v1/cap/alerts/{alert_id}/submit` | `DRAFT` | `SUBMITTED` | `cap.alert.submit` |
| Approve | `POST /api/v1/cap/alerts/{alert_id}/approve` | `SUBMITTED` | `APPROVED` | `cap.alert.approve` |
| Publish | `POST /api/v1/cap/alerts/{alert_id}/publish` | `APPROVED` | `PUBLISHED` or `CANCELLED` for cancel messages | `cap.alert.publish` |
| Cancel | `POST /api/v1/cap/alerts/{alert_id}/cancel` | `PUBLISHED` | `CANCELLED` | `cap.alert.publish` |
| Expire | `POST /api/v1/cap/alerts/{alert_id}/expire` | `PUBLISHED` | `EXPIRED` | `cap.alert.publish` |

Publishing validates the alert, generates CAP XML, stores a snapshot, queues publish side-effect records, and writes an audit event.

## Validation

CAP payload validation is implemented in two places:

- Pydantic schemas validate basic shape and time-order constraints.
- `src.cap.validation.validate_cap_alert` validates warning-content requirements before publication.

Publication fails with 422 if CAP validation errors are present.

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

The public API exposes:

| Endpoint | Description |
| --- | --- |
| `/api/cap/latest-active` | Active published alerts |
| `/api/cap/alerts` | Published, expired, and cancelled alerts |
| `/api/cap/past` | Expired and cancelled alerts |
| `/api/cap/alerts/{identifier}` | Alert by CAP identifier |
| `/api/cap/alerts.geojson` | Active alerts as GeoJSON |
| `/api/cap/active-map` | Active alerts as GeoJSON |
| `/api/cap/rss.xml` | Active alerts RSS feed |
| `/api/cap/{identifier}.xml` | Latest XML snapshot |

An alert is active when it is `PUBLISHED` and has no expired info block, or at least one info block with an expiry after the current UTC time.

## Publish Side Effects

Publishing currently creates durable `CapJobEvent` rows for:

- `publish.webhooks`
- `publish.mqtt`
- `publish.wis2box`
- `publish.static_map`
- `publish.pdf`
- `publish.social_image`

The current code records these jobs in Postgres. A worker is not enabled in the deployed compose stack yet, so do not document webhook, MQTT, WIS2Box, PDF, static-map, or social-image delivery as complete until a worker processes these rows.

## Operational Rules

- A forecaster should not publish directly from draft. Use submit and approve separation.
- Every official published alert must have a validation result with no errors.
- Use cancel for active published alerts that need cancellation. Use expire when the valid period has ended.
- Do not delete official warning records as a normal workflow. Archive through state and snapshot history.
- Public feeds must only expose published, expired, or cancelled alerts.
- Duplicate prevention should be based on CAP `identifier` and XML snapshot history.

## Current Gaps

- No deployed worker processes CAP job events.
- No multi-channel dissemination execution beyond public feed/XML snapshot generation.
- No automated stale-alert expiry job.
- No alert consistency check across website, XML, RSS, and future channels.
- No formal SOP acceptance record in the repo.

