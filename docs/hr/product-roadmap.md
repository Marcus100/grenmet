# HR product roadmap

**Status:** Proposed roadmap, revised 2026-10-16. Direction and sequencing are Barrels' proposal; GAA has not accepted them.  
**Owner:** Barrels Grenada engineering, for GAA/GMS  
**Last updated:** 2026-10-16

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

**Also built since 2026-10-15, all warn-only or secondary:** roster rule limits with
a checker, settings tab, publish-time warnings and a shift-exchange check; a
token-based phone clock-in; and a CSV import of opening leave balances.

**Not found in the docs or the model list** (code not exhaustively read): skills or
competency gating on the roster; ingestion of the existing time-clock terminal's
punches; overtime approval; open-shift claiming; onboarding and separation
checklists; position or establishment control; performance or appraisal features;
recruitment; payroll; a mobile-first staff view; and reporting beyond the dashboard
and `/hr/reports`.

**What GAA runs today.** GAA's HR and payroll system is HrPlus (a Trinidad and
Tobago product, run on GAA's network by HR and Accounts Payroll). It issues payslips,
leave confirmations, overtime acceptance and tax certificates. Staff clock in on a
wall-mounted fingerprint and keypad terminal and carry proximity fobs. How the
terminal's punches reach HrPlus, and HrPlus's export formats, are not yet known.
Nothing here has been verified against HrPlus itself.

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

## Direction and system of record

Barrels' proposed direction, set by the project lead on 2026-10-16 and **not yet
agreed by GAA**:

- **Our system becomes the official record** for leave, overtime and hours worked,
  starting with the GMS pilot.
- **GMS is the only pilot** until it is accepted.
- **Long term, it replaces HrPlus**, with payroll last.

This is a large change for a client that already pays staff through HrPlus. Until GAA
HR and Accounts Payroll agree in writing, treat it as a proposal and keep HrPlus
authoritative for anything that affects pay. Two official records for the same fact
would be worse than either alone, so each fact needs exactly one owner at every
stage:

| Fact | Owner during pilot | Owner after cutover |
| --- | --- | --- |
| Leave balances and requests | Our system for GMS staff, once HR signs the opening balances | Our system |
| Attendance (arrival and departure) | The terminal feeds HrPlus; ours ingests the same punches | Our system |
| Overtime approval | HrPlus | Our system, after the rule engine is trusted |
| Payslips, tax and payroll | HrPlus | HrPlus until a payroll phase is agreed |

A cutover needs three things first: GAA HR's written agreement, signed opening
balances, and a reconciliation report showing our figures match HrPlus for a full
pay period.

## Roadmap

### Phase 0: prove what exists and settle ownership (now)

- Get GAA HR's agreement, in writing, on the direction above and on the fact owners.
- Obtain HR's opening balances (an anonymised Excel export from HrPlus) and load
  them with the balance import; the "HR decision pending" rows now hold provisional defaults (2026-10-18) in
  [policy rules](policy-rules.md).
- Find out who owns HrPlus (HR, Accounts Payroll or IT), the terminal model, whether
  it is networked, and how its punches reach HrPlus.
- Run host-browser acceptance on leave, absentee, exchange, attendance and
  timesheet, daily status and parking, using [operator acceptance](operator-acceptance.md).
- Fix the 5 failing tests in `components/hr/hr-pdf-preview.test.tsx` (jsdom
  `Blob.stream`; not confirmed on a clean `dev`).
- Release to staging and run a disposable staff-to-approver journey with negative
  cross-department checks.

Exit: HR has signed the direction and the opening balances, and pilot users complete
journeys unaided.

### Phase 1: roster rule engine (built; limits wait on HR)

Built and warn-only: checker, department limits, settings tab, publish-time warnings
and a shift-exchange check. Still to do: call the check from leave, absence and
overtime changes, and add a severity (warn or block) with an audited override reason
once HR confirms limits. Encode GAA–GTAWU terms only after HR confirms them.

Exit: seeded violations are caught on every path and HR has entered confirmed limits.

### Phase 2: attendance from the existing terminal (replaces the old clock-in phase)

The earlier plan assumed we would capture punches ourselves. GAA already has a
terminal, so the job is to ingest its punches into the existing attendance record.

- Start with a file import (USB or HrPlus export) that maps a terminal user ID or
  card number to an employee and matches each punch to the rostered shift. Anything
  unmatched goes to a review list; nothing is auto-approved or invented.
- Read live from the device only if it is networked, and only after approval of any
  new Python dependency.
- Check the device clock; a wrong device date makes every punch wrong.
- Keep the token-based phone clock-in as a secondary route for places without a
  terminal.
- Add a reconciliation report comparing our hours with HrPlus for the same period.

Exit: one pay period of GMS punches matches HrPlus after review, and hours are
counted once across D, M/E and N reports.

### Phase 3: lifecycle, starting with probation

- Probation confirmation and extension workflow from the recorded service facts,
  with the memorandum's ten-working-day consequence flagged.
- Onboarding and separation checklists as workflow templates (asset issue, access
  grant and revocation, exit leave-balance statement).
- Transfers and promotions with history.

### Phase 4: leave and overtime as the official record for GMS

- Leave reconciliation report against HrPlus (format-agnostic comparison).
- Overtime requests, approval and notices, replacing HrPlus's overtime feature for
  GMS once the rule engine has run clean for a period.
- Export for HrPlus to take in whatever format its import accepts, so payroll keeps
  running while HR moves over.

Exit: a full pay period where HrPlus and our system agree and HR approves the
cutover for GMS.

### Phase 5: competency and qualification layer (held)

Held until GAA defines which qualifications each role needs. Training records are
free text and do not certify operational competency. Expiry reminders to the
employee already exist (daily sweep); reminders to supervisors, role requirements and
rostering eligibility do not. Needed for ATS before it joins the pilot.

### Phase 6: second department, reporting and wider rollout

- Add Security as the second 24/7 department, then ATS after Phase 5.
- Report pack: leave liability, absence patterns, overtime exposure, training and
  licence expiry, headcount by department.
- Position and establishment control only if GAA HR wants it.
- Audit exports. The isolation audit remains a precondition for any
  multi-organisation use.

### Phase 7: operations bridge and, later, payroll

- Expose roster and attendance as a read API for ATS, Security, Janitor and Bus.
- Open-shift claiming and a mobile-first staff PWA (mutations stay online-only per
  ADR-0009).
- Payroll replacement is a separate agreed phase, not assumed: it touches tax,
  deductions and legal reporting and needs GAA Accounts Payroll's involvement.
- Optional later: a self-service assistant, and roster suggestions once the rule
  engine is trusted.

## Open questions for GAA

1. Will GAA HR and Accounts Payroll agree in writing to our system being the official
   record for GMS leave, attendance and overtime, and to what cutover test?
2. Who owns HrPlus and the terminal, and who can approve an export or a connection?
3. How do the terminal's punches reach HrPlus today, and in what formats can HrPlus
   export leave, overtime and punches?
4. What does HrPlus apply on its own (grace periods, overtime thresholds, break
   deductions)? Our rules must match or deliberately replace them.
5. Written rest, hours and overtime terms, and the maternity eligibility and
   sick-leave rules in [policy rules](policy-rules.md).

## Constraints

Python dependencies, new npm packages and changes to `turbo.json`, `biome.jsonc` or
`tsconfig*.json` need approval first, as do breaking API changes, destructive
migrations and wider permissions. Each slice ships with tests and goes through the
`api-change` and `gaa-admin-change` skills. CI green is not institutional acceptance.
