# GAA-admin PIMU and Native Service Desk Plan

**Status:** Planning only; implementation deferred by the user.
**Recorded:** 11 September 2026.
**Client:** Grenada Airports Authority (GAA).
**Delivery surface:** Authenticated GAA-admin staff portal.

## Decisions and recommended delivery

The user chose to replace GAA's existing osTicket system with native capabilities
inside GAA-admin and modernise the interface. Stores becomes the Procurement and
Inventory Management Unit (PIMU). The user requested that this plan be saved for
later implementation; it does not authorise deployment, mailbox changes,
production migration, or retirement of osTicket.

Recommended first milestone: working IT ticket creation through resolution and
PIMU requisition submission through review. Follow with procurement and inventory,
the remaining PIMU responsibilities, and a reconciled migration from osTicket.
Design for the complete scope now, but deliver working vertical slices.

The delivery sequence and architecture below are recommendations. Approval rules,
service targets, operational ownership, migration inputs, and cutover details need
confirmation before their dependent implementation begins.

## Evidence and source limitations

### PIMU memorandum

The supplied image, `temp-files/stores.png`, contains an all-employee memorandum
dated 11 September 2026 from Dr. Jamiilah Linton-Anane, Human Resources Director.
It renames the Stores Department to the **Procurement and Inventory Management
Unit (PIMU)**, effective immediately. All departments must use the new name in
correspondence, forms, records, and other relevant documentation.

Its seven stated responsibilities are:

1. Procurement: coordinate purchasing under approved procedures.
2. Inventory management: receive, store, issue, and maintain accurate stock records.
3. Customs clearance: coordinate brokerage and clearance of imported goods.
4. Vendor management: manage suppliers and follow up orders and deliveries.
5. Invoice verification: verify and reconcile invoices for financial processing.
6. Fuel monitoring: monitor usage and distribution.
7. Compliance and audit support: retain documentation, follow procurement and
   customs requirements, and support audits.

The [HR announcement email](https://mail.google.com/mail/#all/1a091458526ed313)
corroborates the name, immediate effect, and documentation requirements. The memo
does not establish spending thresholds, approver assignments, approval stages,
stock valuation rules, or service-level targets. Do not infer those policies.

### Existing requisition example

The [forwarded requisition thread](https://mail.google.com/mail/#all/1a08c734791e54b5)
provides a real example of the current workflow:

| Date | Recorded event |
| --- | --- |
| 8 September 2026 | MET submitted ticket SDR202601170 for maintenance supplies and protective equipment, with quantities and specifications. |
| 9 September 2026 | Quotations were updated, followed by ticket acknowledgement. |
| 10 September 2026 | Purchase order 20260427 was reported as created. |

This demonstrates line items, quotation revisions, acknowledgement, conversation
history, and a purchase-order reference. It does **not** establish approval,
receipt, issue, invoice settlement, or delivery completion. The quotation PDFs
were linked from an internal osTicket host; their contents were not read or
archived. Email evidence is contextual input, not an imported production record.
Private Gmail links require access and are not a durable migration archive.

### osTicket research

Official sources reviewed on 11 September 2026:

- [Project repository](https://github.com/osTicket/osTicket): osTicket supports
  requests originating through web forms, email, and phone.
- [API documentation](https://docs.osticket.com/en/latest/Developer%20Documentation/API%20Docs.html)
  and [API dispatcher source](https://github.com/osTicket/osTicket/blob/develop/api/http.php):
  the standard ticket API supports creation, not full ticket retrieval and updates.
  Installed plugins or local customisations must be inspected separately.
- [Data extraction guide](https://docs.osticket.com/en/latest/Guides/Data%20Extraction%20Guide.html):
  standard CSV ticket exports contain header metadata. Do not treat CSV as a full
  conversation or attachment backup.
- [Ticket documentation](https://docs.osticket.com/en/v1.14.8/Agent/Tickets/Tickets.html):
  requester-visible replies and internal notes have distinct visibility. Preserve
  that boundary in both the replacement and migration.
- [osTicket 2.0 announcement](https://next.osticket.com/): describes a new
  architecture; it is not evidence of the version or capabilities installed at GAA.

The replacement will use native GAA-admin features. Its production runtime should
not depend on an osTicket API. A verified database and attachment export, or an
equivalently complete extraction, is needed for historical migration.

## Repository baseline

Source inspection at planning time found:

- `apps/web/gaa-admin/src/navigation/sidebar-items.ts` labels Stores with
  Requisition, Inventory, and Delivered links under `/salesbus`.
- `apps/web/gaa-admin/src/app/(admin)/salesbus/` contains the former sales flow.
  The cart uses local React state, cash/credit selection, and a Done action that
  clears the cart without submitting an order.
- `apps/web/gaa-admin/src/lib/salesbus/` defines mock products, customers,
  transactions, payment types, and case pricing. These are not a PIMU domain model.
- `apps/web/gaa-admin/src/app/(admin)/it-tickets/page.tsx` is an informational
  operations page. It explicitly does not submit tickets.
- GAA-admin already consumes authenticated FastAPI services through the generated
  API client. Existing staff identity, scoped permissions, HR workflows, and
  document access patterns provide prior art, not automatic authorisation to
  reuse HR-specific records or policies.

Recheck these findings when implementation resumes; concurrent repository work
may have changed them. Preserve unrelated working-tree edits.

## Product and interface design

| Area | Recommended screens |
| --- | --- |
| PIMU | Overview, Requisitions, Procurement, Inventory, Receipts & Issues, Suppliers |
| IT support | My Tickets, Team Queue, New Ticket, Ticket Details |
| Later PIMU capabilities | Customs, Invoice Verification, Fuel, Audit Reports |
| Administration | Team assignments, categories, permissions, approval rules, service targets |

Use GAA-admin's shared UI primitives, existing typography, semantic design tokens,
and dark-mode conventions. Prioritise operational density, readable tables,
clear actions, and predictable navigation. Add searchable and filterable queues,
saved views, pagination, empty/loading/error states, visible status labels, and
responsive layouts with accessible keyboard and focus behaviour.

Recommended detail layout: a header with reference, status, owner, and next action;
a main record area; an activity/conversation panel; and supporting documents.
Distinguish internal notes by both text and styling. Staff see only records and
actions their permissions allow; enforce the same limits server-side.

Replace checkout with a requisition editor: department, purpose, required date,
line items, quantities, units, specifications, and attachments. Support catalogue
items and requests for items not yet catalogued. Preserve work through validation
errors and save drafts durably. Avoid presenting unavailable operations as live.

Use PIMU in navigation and the full official name on its overview and documents.
Preserve the former name in historical source records with a dated rename note.
Introduce `/pimu` routes and explicitly map each retained `/salesbus` URL; the
legacy sales/customer model must not be silently represented as procurement data.

## Proposed architecture and domain boundaries

Use Next.js for GAA-admin screens and FastAPI/Postgres for authoritative data and
business rules, following the repository's existing domain structure. Prefer
server-rendered initial data and client components where interaction requires it.

Introduce a service-desk domain for tickets, participants, team assignment,
messages, internal notes, attachment relationships, and ticket transitions. PIMU
owns requisitions, quotations, suppliers, orders, receipts, issues, and stock.
Link PIMU records to conversation capabilities without equating ticket closure
with purchasing completion. Define ownership of shared audit, document-storage,
and notification capabilities after inspecting existing implementations.

Proposed records include:

- Service desk: ticket, participant, assignment, message with visibility,
  attachment reference, status event, notification delivery, legacy mapping.
- PIMU: requisition and lines, review decisions, quotation revisions and lines,
  supplier, order and lines, receipt and lines, issue and lines, stock movement.
- Later PIMU scope: customs case, invoice verification and discrepancies,
  fuel receipt/issue, supporting-document links.

Use stable internal IDs and separate human-readable references. Preserve osTicket
IDs and original references as provenance. Record actor, timestamp, and reason for
material changes. Do not overwrite historical decisions or quotation revisions.
Protect attachment downloads by record visibility, including files attached to
internal notes. Sanitise imported HTML and validate upload types and sizes.

Suggested ticket states are Open, In Progress, Waiting, Resolved, and Closed,
with explicit reopen rules. Requisition review, purchasing, and fulfilment have
separate state transitions. A PO reference does not prove an approved order;
an order does not prove a receipt; a receipt does not prove departmental issue.

Use existing permission conventions for requester, departmental reviewer,
PIMU operator, IT agent, auditor, and administrator capabilities. Role names here
are conceptual; determine exact grants and department scope during design.
Do not infer authority from job grade or import old privileges automatically.

## Delivery phases and acceptance gates

### 0. Confirm operational policies and migration inputs

Inspect the installed osTicket version, departments, topics, custom fields,
status definitions, queues, mailbox routing, plugins, and attachment storage.
Obtain a source snapshot and assess data volumes and identity mappings.
Confirm request approval rules and service ownership with GAA.

Deliver a field mapping, permission matrix, state diagrams, migration inventory,
and representative interface designs. Unresolved policy blocks only its dependent
behaviour; do not substitute invented defaults for operational approval.

### 1. Native IT support and PIMU requisition milestone

Build in small, reviewable slices:

1. Add domain tables, migrations, permission checks, and API contracts.
2. Deliver IT ticket creation, persistent personal list, and ticket detail.
3. Add agent queues, assignment, replies, internal notes, and attachments.
4. Add resolve/reopen behaviour and audit history.
5. Deliver PIMU draft editing, line items, submission, and personal tracking.
6. Add departmental review, return-for-correction, approval/rejection, and history
   using confirmed policy. Keep procurement actions outside this review slice.
7. Modernise navigation and map old URLs when destination flows are working.

Acceptance: records survive refresh and sessions; unauthorised departments cannot
read or mutate them; private notes never appear in requester responses or exports;
failed saves preserve input; duplicate submissions do not create duplicate records;
each transition has an actor and timestamp. This milestone is usable for a pilot,
not sufficient by itself to retire osTicket.

### 2. Procurement and inventory

Add suppliers, quotation revisions, PO records/references, receipts, issues,
returns, and stock adjustments. Make quantities and units explicit. Support
partial fulfilment and unresolved balances. Implement a transactional movement
ledger, with concurrency protection and reasoned corrections rather than silent
balance edits. Confirm treatment of reservations, negative stock, valuation,
multiple locations, and opening balances before enabling those behaviours.

Acceptance: ordering does not increase stock; receipt and issue quantities are
independently traceable; simultaneous issues cannot violate the agreed stock
policy; quotation history remains available. Use the SDR202601170 email scenario
to check that PO creation alone never marks goods delivered or issued.

### 3. Remaining PIMU responsibilities

Add customs clearance tracking and documents, invoice verification against
orders/receipts, discrepancy resolution, fuel usage/distribution records, and
permission-aware audit exports. Verify invoice approval separately from payment
processing. Fuel units, recipients/assets, and reconciliation rules need policy
input before implementation.

Acceptance: records link back to their source transaction and supporting evidence;
verification status does not claim that payment occurred; audit reports respect
record visibility and retain correction history.

### 4. Email continuity and service operations

Implement inbound ticket creation and replies, identity/participant checks,
message threading, duplicate detection, and attachment processing. Account for
unknown senders, forwarded messages, legacy ticket references, mail loops, and
messages arriving during migration. Use durable outbound delivery with retries,
delivery history, and explicit notification preferences. Internal notes must never
be sent to requesters. Confirm mailbox ownership and credentials separately.

Acceptance: retries do not duplicate tickets or messages; replies attach only to
authorised conversations; failed notifications are visible and recoverable.
Inventory the existing installation's routing, SLAs, canned replies, knowledge
base, and reporting usage; implement or explicitly defer each used capability
before approving retirement. Notifications may be introduced earlier for pilot
use, but full email continuity is a cutover prerequisite.

### 5. Historical migration and cutover preparation

Build a repeatable importer with a dry-run mode. Preserve original identifiers,
authors, timestamps, visibility, custom fields, assignments, message ordering,
and attachment relationships. Include deleted/inactive users in identity mapping
without granting them access. Quarantine unmapped or malformed records for review.

Reconcile ticket/message counts, attachment counts and checksums, status mappings,
and representative full threads, including internal notes. Re-running an import
must not duplicate data. Standard CSV alone cannot satisfy this gate.

Prepare a cutover runbook covering backup/restore verification, a defined source
freeze or delta capture, final import, mailbox routing, late-arriving messages,
read-only legacy access, and rollback ownership. Specify how writes created after
cutover are retained if rollback is needed. Production execution is separate from
this plan and requires operational authorisation.

Acceptance: a migration rehearsal passes reconciliation, owners accept the new
flows, the last source delta is accounted for, and rollback has been exercised
before osTicket is retired.

## Verification and affected surfaces

Implementation will affect GAA-admin navigation, legacy sales routes and
components, IT support, staff access, FastAPI models/services/routes and migrations,
OpenAPI, the generated TypeScript client, document storage, notifications,
operational documentation, and migration tooling.

Before changing shared symbols, trace every consumer and validate the impact on
the other consolidated modules: HR, CAP, wxwatch, and wxproducts. Do not broaden
HR permissions or alter its workflow semantics to accommodate PIMU.

Required implementation checks:

- Backend integration tests using the repository's async fixtures and a real test
  database for authorisation, transitions, persistence, and stock concurrency.
- UI behaviour tests for draft preservation, validation, assignment, visibility,
  partial fulfilment, and empty/error states.
- Email tests for identity boundaries, threading, retries, and duplicate messages.
- Migration fixtures with private notes, missing files, inactive users, and
  repeated imports; verify source-to-target reconciliation.
- Browser verification of staff, reviewer, PIMU operator, and IT agent journeys
  on desktop and mobile, including keyboard navigation and dark mode.
- `pnpm fix`, `pnpm type-check`, relevant tests, documentation link checks, and
  regenerated OpenAPI/client with `pnpm check:drift` after API changes.

Do not create live tickets, email staff, seed production records from the example,
or switch mail routing as part of tests.

## Open decisions for resumption

| Decision | Recommended starting point / required evidence |
| --- | --- |
| First milestone | IT support plus PIMU requisitions through review. |
| Approval rules | Obtain GAA's actual approval matrix; memo is insufficient. |
| osTicket data access | Obtain version/configuration inventory, DB export, and complete attachment source. |
| Department access | Personal access by default; explicit team/department permissions for operators and reviewers. |
| Email continuity | Preserve used inboxes and thread references after a migration rehearsal. |
| Document storage | Inspect existing storage and access patterns; choose durable storage with private downloads. |
| Stock policy | Confirm units, locations, opening balances, reservations, adjustments, and valuation. |
| Purchase orders | Confirm authoritative PO issuer and numbering before creating new official numbers. |
| Service targets | Confirm hours, escalation owners, and paused/waiting behaviour. |
| Historical retention | Agree scope and retention with GAA; preserve source provenance. |
| Design review | Review representative queue, ticket, requisition, and receipt screens before broad UI work. |
| Cutover ownership | Name operational owners for acceptance, mailbox routing, reconciliation, and rollback. |

## Out of scope for the current documentation task

Application implementation, database changes, dependency installation, osTicket
modification or deployment, live imports, mailbox changes, notifications, and
production cutover are deferred. The future replacement does not automatically
include accounting/payment execution, every osTicket feature, or unrelated
GAA-admin redesigns.

## Resume here

Re-read this plan and current repository instructions. Reconfirm the working-tree
baseline, inspect existing identity/document/notification facilities, and resolve
phase 0 dependencies. Turn the first milestone into a precise file scope and
reviewable implementation tasks before starting application changes.
