# Airport operations programme

Owner: Barrels Grenada. Status: planning, 25 November 2026. Nothing below is
built unless the table says so. Architecture: ADR-0067.

## Why

Commercial airport-operations suites sell about 45 small modules (logbook,
incidents, safety management, work orders, inspections, passes, public request
forms and more) per airport, each with a setup fee and a monthly fee. Most of
the same capabilities are already listed in the GAA plan
(`docs/exec-plans/gaa-modular-monolith-implementation.md`, GAA-10 to GAA-19)
and none is built. The owner wants as many of these features as possible built
into this repository, on the FastAPI platform that already exists.

Whether the modules are sold as Barrels products or stay modules for the
airport authority is not decided. ADR-0067 makes every module
organisation-scoped with its own entitlement, which works either way: the
airport authority is simply the first organisation switched on.

## Principles

- **Build on what exists.** Notifications, contacts, audit, storage, the
  outbox, HR training and parking, stores, janitorial areas and QR labels,
  feedback and flights already cover part of the list. Extend them before
  adding a domain.
- **One module, one FastAPI domain, one schema** in the main database
  (ADR-0003), with its own entitlement key and organisation-bound permission
  keys (ADR-0044). Screens follow later from the Barrels Design session.
- **Modules never import each other.** They exchange messages through the
  platform outbox (ADR-0026) and point at each other's records with a
  `(kind, id)` reference.
- **Records keep their history.** Original text is never overwritten without a
  trace (audit, ADR-0009); closed records lock; only authorised managers
  reopen.
- **Private by default where it matters.** Private entries and notes, restricted
  case access, no personal data beyond what the workflow needs.
- **Plain names.** "Corrective actions", never "CAP" (CAP here is the public
  weather-alert format). "Environmental management", not "environmental"
  (that domain holds forecast data).
- **Local rules.** Build to ICAO and Eastern Caribbean requirements, not to any
  one country's reporting feeds.

## Coverage map

| Capability | What exists | Module and phase | GAA plan |
| --- | --- | --- | --- |
| Operations logbook, shift handover report | nothing | `opslog`, phase 1 | GAA-13 |
| Incidents (occurrence, response timeline, checklists, review) | nothing | `incidents`, phase 1 | GAA-12, GAA-14 |
| Safety, security, occupational health and safety, environmental management | nothing | `cases` engine, phase 1 | GAA-12 |
| Work orders, assets, preventive maintenance | nothing | `workorders`, phase 2 | GAA-10 |
| Inspections (quality, pre-operational, ad hoc) | janitorial plans only | `inspections`, phase 2 | GAA-10 |
| QR codes for any record | janitorial area labels | shared helper, phase 2 | — |
| Configurable forms and permits | HR `workflow` (named approvers) | extend, phase 2 | GAA-16 |
| Contact groups | `contacts` (no groups) | extend `contacts`, phase 3 | — |
| Alerts and notifications with replies and text messages | `notifications` (bell, email), `push` | extend, phase 3 | GAA-14 |
| Bulk email to contact groups | `subscriptions`, newsletter | extend, phase 3 | — |
| Operations status board | `gmsdash` (weather only) | `statusboard`, phase 3 | GAA-13 |
| Security passes, visitor passes, airside vehicle and driver permits | nothing | `passes`, phase 4 | GAA-15 |
| Parking permits for non-staff | `hr/parking` (staff) | extend, phase 4 | GAA-04 |
| Training matrix by position, read-and-sign | `hr/training` | extend, phase 4 | GAA-11 |
| Staff documents and announcements | `hr`, account app | extend, phase 4 | GAA-19 |
| Persons-of-interest list | nothing | phase 4, owner privacy decision first | — |
| Lost and found, passenger feedback, noise complaints, assistance requests, camera footage requests, prior-permission requests, surveys | `feedback` (page votes only) | `requests`, phase 5 | GAA-16, GAA-18 |
| Purchase orders | `stores` requisitions | extend, phase 5 | GAA-07, GAA-08 |
| Tenant leases, insurance expiry | nothing | `tenancies`, phase 6 | GAA-16 |
| NOTAM requests | nothing | phase 6 | — |
| Wildlife observations and strikes | nothing | phase 6 | GAA-12 |
| Runway condition reports (ICAO Global Reporting Format) | nothing | phase 6 | — |
| Flight information display | `flights` (experimental) | continue under MBIA | — |
| Board of directors portal | nothing | phase 6, on controlled documents | GAA-19 |
| Organisation data export | organisation API keys | phase 6 | — |
| Microsoft sign-in | nothing | phase 6, auth ADR first | — |

## Phase 1 modules

### Operations log (`opslog`)

A chronological, searchable record of each day's activity, used for shift
handover and oversight.

- Several named logs per organisation (operations, security, duty managers),
  each with its own categories (up to three levels), permissions and rules.
- Entry: time (now or a stated time), author, category, text, optional
  location, attachments, private flag.
- Comments add updates without changing the entry. Edit rule per log: open,
  append only, or locked, with an edit window; every change is audited.
- Keyword, date, category and author filters; the listing refreshes.
- Other modules post automatic entries through the outbox, with a link back to
  their record. An entry can start an incident.
- Later slices: notifications by category, daily summary email of the last
  24 hours, structured logs (for example fuel or de-icing records), handover
  report that carries open items to the next shift.
- **Acceptance:** the next shift sees every entry and open item from the last
  shift; an edited entry still shows what it said before.

### Incidents (`incidents`)

One record per significant occurrence, from first report to manager review.

- Draft, open, closed. Closing locks the record; managers may reopen.
- Category decides the responsible manager, who is notified, and which
  checklists apply. A required checklist blocks closing.
- A shared **timeline** of time-stamped actions by several responders, kept
  apart from **notes** (detail, correspondence, photos). Private notes.
- Sections for persons involved, witnesses, damage, resources and the weather
  at the time (from Met Service observations, a Grenmet advantage).
- Start a work order or a safety case from the incident; link several
  incidents to one case.
- Public report form (no sign-in, Turnstile) and QR codes. Exercises use the
  same forms.
- **Acceptance:** every action in an emergency response is in one timeline
  with its time and author; nothing can change after closing without a reopen
  that is audited.

### Case engine (`cases`): safety, security, occupational health and safety, environmental management

One engine, several programmes, each its own entitlement and permissions.

- Issue from a concern, incident, inspection, audit finding or change of
  procedure; anonymous concern reporting where enabled.
- Risk assessments on a configurable likelihood × severity grid (5 × 5 by
  default), before and after controls, with acceptance recorded.
- Investigation: what happened, unsafe acts or conditions, contributing
  factors list, "5 whys" root cause, management approval.
- Corrective actions, short and long term, each with owner, due date,
  progress, evidence and an optional work order; plan approval and reminders.
- Hazard register with controls and responsible people; copy the last
  assessment forward when reviewing.
- Performance indicators as rates (for example per 100,000 aircraft
  movements) with alert levels; goals; audit templates whose answers create
  findings with their own corrective actions.
- **Acceptance:** only authorised roles see case details; every corrective
  action has an owner and a due date; risk before and after is on record.

## Later phases (one line each; detail goes in each module's issue)

- **Phase 2, maintenance:** work orders with assets, preventive schedules,
  time and parts per job, checklists; inspections with criteria, deficiencies
  that open work orders; QR codes on any record; configurable request forms on
  the HR approval workflow.
- **Phase 3, communication:** contact groups; alerts by email, push and text
  message with recipient replies; bulk email to groups with delivery reports;
  a status board for control rooms fed by the modules.
- **Phase 4, people and access:** passes (security, visitor, airside vehicle
  and driver) with expiry reminders; non-staff parking; position training
  matrix and read-and-sign documents.
- **Phase 5, public requests:** one `requests` domain for lost and found,
  passenger feedback, noise complaints, assistance, footage and
  prior-permission requests, and surveys; purchase orders on stores.
- **Phase 6, aviation and governance:** NOTAM requests, wildlife records,
  runway condition reports, tenant leases, board portal, data export,
  Microsoft sign-in.

## Owner decisions still open

- Product or airport module: sold to other organisations, or only for the
  airport authority (does not block building; ADR-0067).
- Text messages cost money per message: provider and monthly budget.
- A persons-of-interest list holds sensitive personal data: whether to build
  it at all, and under what rules.

## Tracking

Tracking issue #1873 lists one issue per module (#1874 to #1901) and the three
owner decisions (#1902 to #1904). All carry `later` while the programme is in
planning; phase 1 moves to `ready-for-agent` when the owner says build.
