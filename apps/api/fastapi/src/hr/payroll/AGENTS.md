# hr/payroll — agent context

**Owner:** Barrels Grenada engineering, for GAA. HrPlus stays GAA's payroll of
record; this module produces **input quantities** for it and a reconciliation
trail. It is slice 1 of the payroll plan; gross pay, deductions, payslips, bank
files and cutover are later slices that need their own approval.

## Invariants
- **Quantities only.** No rate, amount, tax, NIS number or bank detail is stored,
  logged or exported. Adding any of them is a separately approved slice with its
  own permission keys (`hr.payroll.rates.manage`, `hr.payroll.read.amounts`).
- **Pay items are organisation data.** Rules live in `pay_item.params`, never in
  code. GAA's items are loaded once by `catalogue.py` (BaselineStep marker
  `payroll:gaa-pay-items:v1`), all PROVISIONAL with a memorandum reference; every
  other organisation starts with an empty catalogue.
- **Only approved attendance counts.** An `AttendanceRecord` whose current
  workflow instance is APPROVED and whose departure is recorded. The legacy
  `TimesheetEntry.overtime_hours` is ignored.
- **Lines change only while OPEN.** The `pay_line_locked` trigger refuses any
  insert, update or delete once the period is IN_REVIEW or later. A change to
  attendance in an approved period becomes REVERSAL + REPLACEMENT lines in the
  ADJUSTMENT run of a later open period (`service._adjustments`).
- **Computation is idempotent.** Computed lines are keyed by `source_key`
  (`att:<attendance>:<item>`, `adj:<attendance>:<item>:<kind>`); recomputing with
  unchanged inputs changes no row. Computed lines are bulk writes; one
  `pay_period_computation` audit entry summarises each changing computation.
- **Two people.** Submitting starts a `PAYROLL_RUN` workflow on the calendar's
  approving department with self-approval off. The generic workflow action and
  instance-create endpoints refuse `pay_period`; approve and return go through
  `/hr/payroll/periods/{id}/approval|return`, which check `hr.payroll.approve`
  (organisation-wide) and, for approve, an MFA-verified session.
- **Access.** `hr.payroll.read.department`, `.prepare`, `.approve`, `.export` are
  granted to no default role. Reading is department-scoped (ALL or DEPARTMENT
  assignments; SELF grants nothing); prepare, approve and export need ALL scope.
  A period in an organisation without payroll access is a 404. Export needs an
  MFA-verified session and writes a `pay_period_export` audit entry with counts.
- **Overtime bands (#380, PR #890).** `OVERTIME_BAND` items name a `band` as
  #890 names it, the multiplier as a normalised decimal string ("1.5", "2",
  "3"), and read band hours through `overtime.OvertimeBandSource`. Do not
  duplicate #890's band maths here. Until #890 lands and installs a source
  (`overtime.install`), `PendingOvertimeBands` returns nothing and preparers may
  enter band hours as MANUAL lines with a reason. #890 computes bands on read,
  so payroll copies them into pay-line quantities at computation; the lines
  lock at submission and approved figures never move.
- **Logs and Sentry:** IDs and counts only, never names, quantities or reasons.

## Rules (all provisional, parameters in the GAA catalogue)
- Base hours: arrival to departure (`hours_basis` ELAPSED, the memorandum's
  8 hours inclusive of lunch) capped at `standard_hours`.
- Shift premium: hours inside the local 21:00–06:00 window; breaks not deducted.
- Public holiday: hours inside a `PublicHoliday` local day. Base is not reduced.
- Meal: shift worker more than `shift_worker_beyond_hours` past
  `shift_worker_standard_hours`; non-shift worker departing after
  `non_shift_departs_after` on the shift's own date. One per shift.
- Call-out and call-out meal: MANUAL lines with a required reason.
- Shift worker: `employee_pay_profile.shift_worker`, else the department default.

## Tests
`tests/hr/test_payroll_inputs.py` (the eleven acceptance checks, through the API),
`tests/hr/test_payroll_rules.py` (pure rule edges). Synthetic data only.
