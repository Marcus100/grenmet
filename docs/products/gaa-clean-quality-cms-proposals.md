# Clean, Quality and CMS: approval proposals

**Status:** Working plan  
**Owner:** GAA (institutional content); maintained by Barrels Grenada  
**Last updated:** 2026-09-23

Prepared 23 September 2026. **Proposed, not approved or operational.**
Acceptance evidence belongs in the [readiness ledger](../operations/launch-readiness-coverage.md)
(J-Clean, J-Quality, J-CMS). HR/People changes belong to the separate workstream.
These proposals are concrete review boundaries; no tables, permissions or
mutation endpoints described below have been installed.

## Shared decisions

Use the existing FastAPI permission engine, SQLAlchemy/Alembic and generated
OpenAPI/Kubb contracts. Actors come from the authenticated session, never from
client-supplied actor fields. Every mutation commits state and history together.
Use UUID identifiers, UTC timestamps and an integer revision starting at 1.
Writes require `expected_revision`; stale writes return 409, invalid input 422,
missing authentication 401, disallowed action 403, inaccessible record 404.
No hard-delete endpoint. Text lengths: title 200, note/reason 4000, URL 2000.
Lists use `limit` 1–100 (default 50), `offset` >= 0 and `has_more`.
Cross-database identity references are UUID values, validated through existing
identity services; do not create cross-database foreign keys or HR writers.

## Clean: assignment-to-completion

Storage stays in the existing janitorial domain database. The current
`GET /api/v1/janitorial/spec` catalogue is reused unchanged. Catalogue assignments
must support both direct area tasks and bundle tasks; do not invent duplicate
task names from free text.

| Proposed table | Exact fields and constraints |
| --- | --- |
| `clean_assignments` | `id uuid PK`; `area_id integer FK areas RESTRICT`; `area_task_id integer NULL FK area_tasks RESTRICT`; `bundle_item_id integer NULL FK task_bundle_items RESTRICT`; exactly one task reference present and belonging to the selected area; `task_snapshot jsonb NOT NULL` copied from catalogue; `work_date date NOT NULL`; `assignee_id uuid NOT NULL`; `state text CHECK IN ('assigned','in_progress','blocked','completed','verified')`; `revision integer CHECK > 0`; `created_by uuid NOT NULL`; `created_at/updated_at timestamptz NOT NULL` |
| `clean_assignment_events` | `id uuid PK`; `assignment_id uuid FK clean_assignments RESTRICT`; `revision integer > 0`; `event text CHECK IN ('assigned','started','blocked','completed','reassigned','verified','reopened')`; `actor_id uuid`; `recorded_at timestamptz`; `from_state text NULL`; `to_state text`; `previous_assignee_id/assignee_id uuid`; `note text`; `performed_at timestamptz NULL`; `reported_by_id uuid NULL`; UNIQUE `(assignment_id, revision)` |

All unmarked fields are NOT NULL except `previous_assignee_id` on creation.
Indexes: `(assignee_id,work_date,state)`, `(area_id,work_date)`, event history by
`(assignment_id,revision)`. Snapshot records catalogue name/activity/frequency at
assignment time so subsequent catalogue edits cannot rewrite history.

Permissions proposed: `clean.assignment.read.own`, `clean.assignment.manage`,
`clean.assignment.review`. Own access returns only the current assignee's work;
management/review access is limited to the pilot's explicitly granted building
scope. A grant without a building scope gives no management access. Do not infer
scope from job titles. Cleaner must be active and assigned to that pilot scope.

| Endpoint | Input / outcome |
| --- | --- |
| `GET /api/v1/janitorial/assignments` | Filter work date/state; own or explicitly managed scope; paginated assignment summaries |
| `GET /api/v1/janitorial/assignments/{id}` | Assignment plus ordered events, subject to scope |
| `POST /api/v1/janitorial/assignments` | `area_id`, exactly one task reference, `work_date`, `assignee_id`; returns 201 assignment revision 1 and assigned event |
| `POST /api/v1/janitorial/assignments/{id}/events` | `expected_revision`, `event`, optional `note`, reassignment `assignee_id`; returns updated assignment and event |

Transitions: assigned → in_progress (start); assigned/in_progress → blocked
(reason required); in_progress → completed; blocked → in_progress (resume reason,
event `started`); completed → verified (reviewer distinct from completing actor);
completed/verified → assigned (reviewer reopen with reason). Supervisor may
reassign assigned/in_progress/blocked work with a reason, resetting to assigned;
completed work must first be reopened. No self-verification or implicit completion.
Transitions validate current assignee, scope and revision inside the transaction.

Phone flow: dated personal list → task/location → Start, Report blocked, Complete.
Supervisor list exposes assignment/reassignment/review. No-phone fallback: dated
printed assignment sheet; supervisor records the cleaner's reported outcome with
`reported_by_id`, actual `performed_at` and transcription note, preserving the
recording actor/time. A transcribing supervisor cannot verify their own entry;
a second authorised reviewer is required. No offline/PWA/QR/inventory scope.

Migration proposal: next revision after `0001_catalogue`, only additive assignment
and event tables/indexes; no catalogue backfill or changed IDs. Permissions and
building scopes need explicit approved provisioning in the identity domain.
Before rollout: backup, apply to disposable janitorial DB, verify catalogue
unchanged, migrate twice safely, test concurrency/permissions/transitions, and
restore. A rollback preserves recorded work; destructive downgrade requires an
explicit data-retention decision.

Acceptance scenarios: assigned cleaner start/complete and independent review;
blocked work reason and reassignment; old assignee denied after reassignment;
out-of-scope manager denied; concurrent completion/reassignment yields one 409;
reopen preserves original completion evidence; phone and no-phone walkthrough.
Acceptance owner: **unassigned**.

## Quality: document control and corrective action

Use a bounded Quality module in the main application database, alongside the
existing identity permissions. This placement is a proposed architecture decision
requiring approval, not a cross-domain database consolidation.

| Proposed table | Exact fields and constraints |
| --- | --- |
| `quality_documents` | `id uuid PK`; `title varchar(200)`; `owner_id uuid`; `visibility text CHECK IN ('staff','restricted','public_reference')`; `revision integer > 0`; `created_at/updated_at timestamptz` |
| `quality_document_revisions` | `id uuid PK`; `document_id uuid FK quality_documents RESTRICT`; `revision integer > 0`; `reference_url varchar(2000)`; `reference_sha256 varchar(64) NULL`; `status text CHECK IN ('draft','in_review','approved','superseded')`; `review_date date`; `submitted_by uuid`; `approved_by uuid NULL`; `approved_at timestamptz NULL`; UNIQUE `(document_id,revision)`; partial UNIQUE `document_id WHERE status='approved'` |
| `quality_findings` | `id uuid PK`; `source varchar(200)`; `title varchar(200)`; `evidence text`; `owner_id uuid`; `due_date date`; `status text CHECK IN ('open','in_progress','in_review','closed')`; `revision integer > 0`; `created_at/updated_at timestamptz` |
| `quality_actions` | `id uuid PK`; `finding_id uuid FK quality_findings RESTRICT`; `owner_id uuid`; `due_date date`; `response text`; `completion_evidence text NULL`; `status text CHECK IN ('open','in_progress','in_review','verified')`; `revision integer > 0`; `reviewer_id uuid NULL`; `verified_at timestamptz NULL` |
| `quality_events` | `id uuid PK`; exactly one FK to document/finding/action; `revision integer > 0`; `actor_id uuid`; `recorded_at timestamptz`; `event varchar(40)`; `reason text`; `before_state/after_state jsonb`; UNIQUE per parent and revision |

All unmarked columns NOT NULL. Document content remains in its controlled source;
only links and optional immutable file hashes are stored here. Superseded
references are retained. `public_reference` does not publish content or grant
anonymous API access. Restricted records require an explicit record grant; link
validation must not fetch arbitrary private-network URLs from the server.

Permissions: `quality.document.read`, `quality.document.manage`,
`quality.document.approve`, `quality.finding.read`, `quality.finding.manage`,
`quality.finding.review`. Owners may respond on assigned records, not approve
their own evidence. All actions enforce restricted record access before role
permission checks. Unassigned or overdue findings remain visibly unresolved.

API proposal under `/api/v1/quality`: list/detail/create documents; create
document revisions; `/documents/{id}/review` to submit/approve/reject; list/detail/
create findings; `/findings/{id}/actions` create actions;
`/actions/{id}/response` record work and submit for review;
`/actions/{id}/review` verify or reopen;
`/findings/{id}/review` close/reopen with reason. Mutations use `expected_revision`.
Approval atomically supersedes the previous approved revision. Closing a finding
requires at least one action and all actions verified by an independent reviewer.
Reopening retains evidence and reviewer history; it never deletes prior closure.

Migration proposal: additive tables/indexes and explicit permission keys; no
import of the public docs site and no automatic approval of historical documents.
Backfill only operator-reviewed references from the existing masterlist after
approval. Test restore and retained-history rollback before pilot deployment.
Acceptance: independent document approval/supersession, restricted-record denial,
action submission and review, rejected closure with unfinished action, independent
closure/reopening and concurrent revision conflict. Owner: **unassigned**.

Until this module is approved, use the [document findings register](../operations/launch-findings.md).

## CMS references to Forecast Studio products

### Revised scope approved September 23

The user's clarification supersedes the exact-revision proposal below for the
first CMS integration. The three sections are editorial: Latest from us is a
manually written GMS product-update blog; Weather news contains interesting
weather stories; Latest publications introduces publications and articles.
Latest from us product categories include Tropical weather outlook, Bulletin,
Forecasts, Marine, Aviation and CAP alerts. Existing general categories remain
readable; older posts are not automatically reclassified.

The implemented first slice uses optional `relatedLinks` (maximum 20), each with
`title` (1–200 characters), `category` (`forecast|cap|aviation|bulletin|publication|article|source`)
and `url` (absolute HTTP/HTTPS, no credentials, maximum 2000 characters).
Destinations must be unique per post. The CMS editor must check audience access;
the server does not fetch arbitrary links. These are editorial links to existing
destinations, not verified publication identities or frozen snapshots. Existing
CMS publication permissions and review workflow apply. No automatic posting,
FastAPI mutation, public archive endpoint or changed withdrawal policy.

Migration `20260923_170000_editorial_links` adds Payload child/version tables
and product-category enum values without rewriting existing content. Payload
types are regenerated. Rollout requires applying the CMS migration before the
new application code; automatic destructive downgrade is intentionally blocked
to preserve links and version history. Production migration has not been run.

The following exact-revision design is deferred, not part of this implementation.

CMS owns editorial narrative; FastAPI wxproducts owns operational product values,
validation, publication, history and saved-revision PDFs. Do not duplicate weather
fields or let CMS publish a Forecast Studio draft.

Proposed optional Payload array on `content`: `relatedProducts`, maximum 20.
Each row: `productId` (required UUID string), `publishedRevision` (required integer
>= 1), `relationship` (required select `explains|announces|corrects`), `label`
(optional text <= 200). Unique pair `(productId,publishedRevision)` within article.
Product kind/title/validity are read from the referenced snapshot, not editable
CMS copies. Existing articles default to an empty array; no inferred associations.

On review/publication, verify every pair against a FastAPI published-revision
read contract. Unpublished, absent or mismatched revisions block publication;
an upstream outage reports unavailable and cannot pass verification. Reading an
already published article may show an unavailable linked-product notice while
preserving the article's exact references. A later correction can be linked as a
new revision with an explicit newer-issue notice; it cannot silently replace the
historical reference. Withdrawal/expiry must remain visible.

The existing current-products feed is insufficient for stable historical public
lookup; the revision PDF route is staff-authenticated and must not be exposed as
an anonymous link. Propose `GET /api/v1/wxproducts/public/products/{id}/revisions/{revision}`
for published revisions only, plus a publication-only PDF endpoint or reviewed
artifact URL. Both must deny draft/withdraw-only revisions and return explicit
current/expired/superseded/withdrawn state. Public historical disclosure after
withdrawal needs an operational policy decision before implementation.

Migration approval must cover the Payload array and version-history tables,
OpenAPI read contracts, regenerated Kubb/Payload types and migration sequence.
Permissions reuse CMS create/edit and per-section publish; linking does not
grant Forecast Studio write access. Tests: exact-revision association, draft
denial, outage, correction, expiry, withdrawal policy, old articles unchanged and
PDF snapshot hash/values matching the link. Owner: **unassigned**.
