# HR product roadmap

**Status:** Proposed roadmap, 2026-10-15. Sequencing is Barrels' proposal; GAA has not accepted it.  
**Owner:** Barrels Grenada engineering, for GAA/GMS  
**Last updated:** 2026-10-15

GAA is the client and the proving ground for a Barrels HR and staff platform.
GMS is GAA's meteorological department and the first pilot. The platform is meant
to grow into operations: the roster is the single source of truth that attendance,
leave and, later, ATS, Security, Janitor and Bus read from
([ADR-0009](../adr/0009-gaa-staff-platform.md)). This roadmap records what is
built, what is missing and the order to close the gaps. It does not approve policy,
establish deployed behaviour or claim institutional acceptance.

## Where we are

**Built and tested in FastAPI (`apps/api/fastapi/src/hr`):** organisations,
departments and grades; employment records; scoped department authority and staff
delegation; a leave ledger with reconciliation and reversal; absentee reports; shift
exchange; roster catalogue, periods, assignments, import, publish and revisions;
per-shift attendance with corrections; timesheets; daily status reports; parking
permits; training records; employee documents; signed Python PDFs; and the approval
workflow engine with audit. See [end-to-end alignment](end-to-end-alignment.md) for
slice-by-slice evidence.

**Not found in the docs or the model list** (code not exhaustively read): a rule
engine for rest periods, maximum hours or overtime; skills or competency gating on
the roster; clock-in (designed in ADR-0009, only manual attendance exists);
open-shift claiming; onboarding and separation checklists; position or establishment
control; performance or appraisal features; recruitment; payroll; a mobile-first
staff view; and reporting beyond the dashboard and `/hr/reports`.

**Programme focus:** the
[client programme plan](../portfolio/gaa-gms-client-programme-plan.md) puts staff
onboarding and the HR foundation first, with Transport and Janitor queued behind the
HR release gate.

## Market position

Web research on 2026-10-15; sources are mostly vendor blogs, so read this as
directional.

- General portals (BambooHR, HiBob, Rippling, Workday) lead on self-service polish
  and are shallow on rostering.
- Shift-first tools (Workforce.com, Ordio, Connecteam) lead on rosters and time but
  are not built for union agreements or safety rules.
- Airport rostering engines (Quintiq, Auto-Rostering) handle skills, qualification
  and fatigue rules but are planning optimisers, not HR systems.
- Caribbean government HR systems (Jamaica MyHR+, Belize HRMIS) centre on positions,
  employment and payroll; the research found no shift-rostering depth in them.
- Frappe HRMS covers leave, attendance, shifts, lifecycle (onboarding, promotion,
  transfer, separation, skill map), expenses and appraisals. It is AGPL-3.0: borrow
  design ideas, not code.

**The gap GAA can fill:** an HR system whose roster understands qualifications and
agreement rules. That is the differentiator and the path into operations.

## Roadmap

### Phase 0: prove what exists

- Run host-browser acceptance on leave, absentee, exchange, attendance and
  timesheet, daily status and parking, using [operator acceptance](operator-acceptance.md).
- Obtain GAA HR's opening balances, authenticated agreement reading and holiday
  list; clear the "HR decision pending" rows in [policy rules](policy-rules.md).
- Fix the 5 failing tests in `components/hr/hr-pdf-preview.test.tsx` (jsdom
  `Blob.stream`; not confirmed on a clean `dev`).
- Release to staging and run a disposable staff-to-approver journey with negative
  cross-department checks.

Exit: pilot users complete journeys unaided and HR signs the balances.

### Phase 1: roster rule engine

A roster must not be published, swapped or extended into an unsafe or
non-compliant state.

- Per-department rules in `DepartmentPolicy`: minimum rest, maximum consecutive
  days, weekly hour caps, overtime-exposure warnings.
- Run checks at publish, swap approval, leave and absence changes, and overtime
  extension, not only at publish.
- Rules are data with a severity (warn or block) and an audited override reason.
  Encode GAA–GTAWU terms only after HR confirms them.
- Reuse the `roster/` publish and revision flow and `exchange/` conflict checks.

Exit: seeded violations are caught on every path.

Status 2026-10-15: the checker, department limits, a settings tab, publish-time
warnings and a shift-exchange check are built and warn-only. Leave and absence
changes and overtime extension do not call it yet, and no limit has been entered
because GAA HR has not confirmed values.

### Phase 2: time-check clock-in

- Implement the ADR-0009 design: method-agnostic clock-in endpoint, static site
  token by NFC sticker or QR poster, late/early/overtime flags against the rostered
  shift, corrections through the approval engine.
- It feeds the existing attendance journey; no second timesheet system. Manual
  attendance remains the fallback.

Exit: one department pilots it and hours are counted once across D, M/E and N
reports.

### Phase 3: competency and qualification layer

- Extend training records into role requirements, licences and currency. Expiry
  reminders to the employee already exist (daily sweep); reminders to supervisors
  and role requirements do not.
- Add a rostering eligibility rule: a qualification-bound slot cannot be filled by
  someone without a current qualification.
- Add a per-employee skills map with documents as evidence.

Exit: an expired licence blocks rostering in a test scenario and alerts the
supervisor. Training records still do not certify operational competency until GAA
defines that.

### Phase 4: employee lifecycle

- Onboarding and separation checklists as workflow templates (asset issue, access
  grant and revocation, exit leave-balance statement).
- Probation confirmation and extension workflow from the recorded service facts.
- Transfers and promotions with history.

### Phase 5: reporting, establishment and compliance

- Report pack: leave liability, absence patterns, overtime exposure, training and
  licence expiry, headcount by department.
- Position and establishment control, only if GAA HR wants it.
- Audit exports. The isolation audit remains a precondition for any
  multi-organisation use.

### Phase 6: bridge to operations and payroll

- Expose roster and attendance as a read API for ATS, Security, Janitor and Bus.
- Open-shift claiming and a mobile-first staff PWA (mutations stay online-only per
  ADR-0009).
- Payroll-ready exports before any payroll calculation; payroll stays a client
  policy gate.
- Optional later: a self-service assistant, and roster suggestions once the rule
  engine is trusted.

## Sequencing decisions (Barrels proposal, 2026-10-15)

1. **Order by what is unblocked.** Phase 0 first. Phase 1 needs written rules from
   GAA HR, which have a long lead time, so build the engine with rules as data and
   warn-only mode while the request is out, and start Phase 2 (clock-in), which
   needs no policy answer. Switch rules to block only after HR confirms them.
2. **Second pilot: Security, then ATS.** Security is 24/7 rotating with simpler
   qualification needs, so it tests the rule engine without licence risk. ATS is
   safety-critical and should follow the Phase 3 qualification layer.
3. **Payroll and establishment control are out of scope** until GAA says
   otherwise. Deliver payroll-ready exports only; payroll may sit with a central
   government system, which needs confirming.

Still open for GAA HR and legal: written rest, hours and overtime terms, and the
maternity eligibility and sick-leave rules in [policy rules](policy-rules.md).

## Constraints

Python dependencies, new npm packages and changes to `turbo.json`, `biome.jsonc` or
`tsconfig*.json` need approval first, as do breaking API changes, destructive
migrations and wider permissions. Each slice ships with tests and goes through the
`api-change` and `gaa-admin-change` skills. CI green is not institutional acceptance.
