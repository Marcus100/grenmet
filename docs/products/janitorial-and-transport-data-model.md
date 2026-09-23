# Janitorial and Staff Transport — Data Model v2 Proposal

**Status:** Proposal, awaiting approval (schema changes are Ask First)  
**Owner:** Barrels Grenada engineering, for GAA Janitorial and GAA Transport  
**Last updated:** 2026-09-23

## Why

Both catalogues were modelled to display a PDF, and they do that faithfully
(verified against the source documents on 2026-09-23: 406/406 cleaning
activities; all 36 trips). They can't yet support what GAA expects next: a
staff PWA plus an admin portal in gaa-admin. The v1 models drop information
from the sources and have no place for operational records (who cleaned what,
who rode which bus).

This proposal follows established practice for each domain:

- **Cleaning:** facility cleaning programmes describe space by **type** and
  target a **cleanliness level** (APPA levels 1–5). They prove service with
  **area QR check-ins**, task checklists, and scored **inspections**. Restroom
  cleanliness weighs heavily in airport passenger satisfaction.
- **Bus:** timetables follow the **GTFS** model (routes → trips → stop_times,
  with service calendars and holiday exceptions), which is what transit tooling
  expects. Staff-shuttle systems add rider registration, a daily manifest, a
  driver view, check-in and issue reporting.

References: [APPA cleaning levels (OrangeQC)](https://www.orangeqc.com/resources/appa-cleaning-standards/),
[QR inspection workflow (OrangeQC)](https://www.orangeqc.com/features/qr-code-inspection-app/),
[airport restroom inspections (Oxmaint)](https://oxmaint.com/industries/aviation-management/airport-restroom-passenger-amenity-inspection-checklist),
[GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/),
[employee shuttle software features (Coaxsoft)](https://coaxsoft.com/blog/employee-transportation-software).

## Principles

- FastAPI owns both schemas (separate databases, hand-written SQL migrations,
  ADR-0003). All changes are **additive** first; v1 endpoints keep working until
  gaa-admin moves to v2.
- **Reference data** (what should happen) stays separate from **operational
  records** (what did happen), so the published catalogue never changes when
  someone logs work.
- Every catalogue row carries its **source**: document reference, effective
  date, and a `status` (`confirmed` / `awaiting_confirmation`) so open
  questions such as Route 6's times are visible in the UI.
- Staff identity comes from the main auth/HR domain via service calls, never
  shared tables. Permissions are new `janitorial.*` / `transport.*` keys in
  `src/auth/permissions.py`.

## Janitorial

### Reference data (changes to v1)

| Table | Change | Fixes |
| --- | --- | --- |
| `buildings` | Promote each auxiliary structure (Control Tower & ECCAA Tech Block, Stores Office, Stores Warehouse, Maintenance Complex, …) to its own building; add `kind` (`terminal`, `auxiliary`) | Auxiliary buildings are currently areas of one fake building |
| `sections` | Add `note` (e.g. "Tidy up area after heavy flights") | Section qualifiers dropped |
| `areas` | Add `quantity` (e.g. Elevators 2), `space_type` (`restroom`, `office`, `concourse`, `lounge`, `vertical_transport`, `boarding_bridge`, `exterior`, …), `cleanliness_level` (APPA 1–5 target), optional `cleanable_area_m2`, and a stable `code` printed as a QR label | Equipment counts dropped; no hook for QR check-ins or staffing estimates |
| `area_tasks` | Keep frequency (`count` / `period_value` / `period_unit`); replace free-text `mode` with `mode` enum (`routine`, `light`, `deep`) plus `timing_note` ("every morning before passengers arrive") | Mode wording and timing lost |
| `spec_versions` (new) | Document ref (DOC-20251009-WA0001), effective date, status; areas and tasks reference the version they came from | No history when the spec is revised |

### Operational records (new, for the PWA)

| Table | Purpose |
| --- | --- |
| `visits` | A cleaner's check-in at an area (QR scan): `area_id`, `user_id`, `started_at`, `ended_at` |
| `task_completions` | Tasks ticked during a visit, with an optional note |
| `issues` | Problems raised on site (supplies out, damage, spill) with category, photo (object storage) and status |
| `inspections` + `inspection_items` | Supervisor scoring per area against its checklist, with an overall APPA level |

**Derived:** "due now" is computed from each task's frequency and its last
completion. For example, a 1/15-minute restroom task becomes overdue 15 minutes
after the last visit. Overdue restroom checks can use the existing
notifications domain.

## Staff transport (GTFS-aligned)

### Reference data (changes to v1)

| Table | Change | Fixes |
| --- | --- | --- |
| `routes` | Keep `number`, `name`; add `description` ("St. Patrick along the Western Main Road unto MBIA") | Route descriptions dropped |
| `stops` | Add `lat`/`lon`, `landmark` | Riders can't see where a stop is |
| `service_calendars` (new, GTFS `calendar`) | `daily`, `mon_sat`, `sun_hol` as weekday patterns | Day types are a hard-coded enum |
| Holiday exceptions (GTFS `calendar_dates`) | Read from the existing `hr.public_holiday` through the HR service, not copied | "Sundays & public holidays" can't be resolved to real dates today |
| `trips` | Add `direction_id`, `service_calendar_id`, `status` (`confirmed` / `awaiting_confirmation`), source ref; keep `shift_id` (GAA-specific) | Route 6's unconfirmed times aren't visible |
| `stop_times` (replaces `trip_stops`) | `stop_sequence`, `departure_time` (may exceed 24:00 for the 22:30–06:00 night shift, as GTFS allows), `timepoint` (1 = stated time, 0 = inherited group time) | Group times are copied onto every stop with no indication that they're approximate |
| `route_notes` (new) | Descriptive segments ("along the Western Main Road", "via Lagoon Road and on through Grand Anse") | Currently lost |

### Operational records (new, for the PWA)

| Table | Purpose |
| --- | --- |
| `riders` | Staff member, home stop, usual route and shift (defaults from HR roster) |
| `runs` | A trip on a date: vehicle, driver, actual departure, status (`scheduled`, `departed`, `completed`, `cancelled`) |
| `boardings` | Rider check-in on a run (staff ID, per the memo's "carry your ID") |
| `run_reports` | Issues raised to the Duty Manager (late, missed pickup, conduct) |

Conduct rules ("Do's and Don'ts") are content, not data. They can live in the
CMS and be linked from the PWA.

## Phasing

1. **Reference v2, additive:** new columns and tables with a backfill from the
   current rows; v2 read endpoints; gaa-admin `/janitor` and `/bus` switch to
   v2. Auxiliary-building promotion and section notes need a small data
   migration, checked against the source PDF again.
2. **Operational tables and APIs:** visits, completions, issues, inspections;
   rider registration, runs, boardings, reports. Admin views in gaa-admin.
3. **PWAs:** janitor PWA (QR check-in, checklist, issue photo) and bus PWA
   (my stop and next departure, live run status, check-in), both calling
   FastAPI directly (ADR-0015).

## Decisions needed

1. Approve phase 1 (schema changes to both separate databases).
2. Is supervisor inspection scoring in scope for the first janitor release, or
   visits and checklists only?
3. Does the bus PWA need booking (reserve a seat) or only check-in? Booking
   adds capacity rules and cancellations.
4. Should vehicle live location come from a driver's phone (PWA) or a vehicle
   tracker? This affects privacy terms with drivers.
5. Confirm the space-type list and target APPA level per area with GAA Janitorial.
