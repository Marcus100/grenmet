# Roster rules (union roster terms)

**Owner:** GAA/GMS (the rules and their values); Barrels Grenada engineering (the engine)
**Status:** Built (issue #380). The owner confirmed the rules on 2026-10-31 and asked
that they be enforced as fully as possible. Source references: GAA–GTAWU memorandum
2024–2028, Articles 5, 6 and 8, from the controlled local copy cited in
[policy-rules.md](policy-rules.md). This page holds no agreement text.

## Rules and defaults

Every rule is on by default. The values are data: one organisation default
(`hr.roster_rule_set` with no department) and, optionally, a department rule set
that replaces it entirely. HR administrators edit both in GAA Admin, HR setup >
Roster rules. Without any saved row the built-in defaults below apply. An empty
limit switches that rule off.

| # | Rule | Default | Code |
| --- | --- | --- | --- |
| 1 | At most 3 consecutive shifts, then 2 days off. A department can use a Monday-to-Friday pattern (D shift) instead | 3, 2, rotation | `MAX_CONSECUTIVE_DAYS`, `DAYS_OFF_AFTER_RUN`, `WEEKDAY_PATTERN` |
| 2 | Shift workers 8 h a day and 40 h a week; non-shift staff 35 h a week, Monday to Friday. Weeks run Sunday to Saturday | 8, 40, 35 | `MAX_DAILY_HOURS`, `MAX_WEEKLY_HOURS` |
| 3 | In any 4 weekends: one full weekend (Saturday and Sunday) off, plus one other Saturday and one other Sunday off | 4 | `WEEKEND_OFF` |
| 4 | A change to a published roster for a date less than 7 days away is warned | 7 | `SHORT_NOTICE` |
| 5 | Overtime hours by rate band (hours only; no pay): weekday 1.5x for the first 4 h then 2x; Saturday 1.5x from 08:00 to 12:00, other hours 2x; Sunday, public holiday or rostered day off 2x for the first 8 h then 3x; after midnight at least 2x | as listed | bands on attendance and timesheets |
| 6 | No minimum-rest rule | — | (the old `MIN_REST` check was removed) |
| 7 | Coverage: each employee has a "covered by union agreement" flag, on by default. Uncovered staff are never checked and get no bands | on | `employment_record.union_covered` |

Worker type: the rule set says whether its staff are shift workers or non-shift staff;
an employee can override it (`employment_record.rule_worker_type`). Coverage and
worker type are edited only with `roster.rules.manage` (HR administrators), not with
`hr.employment.manage`, so a department manager cannot switch off their own staff's
checks. Nobody can change their own coverage.

## Readings used by the engine

These are the engine's interpretations of the confirmed rules. Each is a candidate
question for GAA HR (see Open questions).

- A shift belongs to the date it starts. An overnight shift that ends at 06:00 leaves
  the next day free for the consecutive-shift, days-off and weekend rules, and its
  hours count on its start date.
- A day is off when no worked shift starts on it. Off, leave and sick codes, and
  rostered shifts covered by approved leave or a full-day approved absence, are not
  worked. Leave on a weekend therefore counts as that weekend being off.
- Rule 1: the 2 days off are owed after a run that reaches 3 shifts. A shorter run
  followed by one day off is not warned.
- Rule 3: windows of 4 consecutive weekends roll forward one weekend at a time; failing
  windows that overlap are reported as one warning. A window is judged only when all
  its weekends fall inside the dates loaded for the check.
- Rule 4 applies to edits of a published roster and to approved shift exchanges, for
  dates from today up to the notice limit. Past dates are corrections and are not
  warned.
- Rule 5 day kinds, in order: public holiday, Sunday, rostered day off, Saturday,
  weekday. Overtime belongs to the day its shift starts. Hours that run past midnight
  are never below the after-midnight rate; if the next day is a Sunday, holiday or day
  off its rest-day band applies to those hours. The weekday "first 4 hours" counter is
  per working day; the rest-day "first 8 hours" counter is per calendar day.
- What counts as overtime: attendance before the scheduled start or after the
  scheduled end. The whole attendance counts when the published roster had a non-work
  code for that day (called in on a day off), or for non-shift staff on a Saturday,
  Sunday or public holiday. A legacy timesheet entry's `overtime_hours` is placed right
  after the shift end, or from 08:00 when the day had no timed shift.

## Where the checks run

A break is a warning. The change is not saved until the acting supervisor gives a
reason; the API answers 409 with `code: ROSTER_RULE_WARNINGS`, the `context` and the
`violations`, and the client resends with `rule_override_reason`.

| Path | Checked | Context |
| --- | --- | --- |
| Publish a roster (`PATCH /hr/rosters/periods/{id}/publish`, and grid import with publish) | every breach in the month, with neighbouring published months loaded | `PUBLISH` |
| Edit a published roster (`POST /hr/rosters/assignments/bulk`) | breaches the edit introduces, and short notice for each changed cell | `ROSTER_CHANGE` |
| Final approval of a shift exchange | breaches the exchange introduces, and short notice | `SHIFT_SWAP` |
| Cancelling approved leave or an approved absence | breaches from the shifts that come back | `LEAVE`, `ABSENCE` |
| Final approval of a timesheet with overtime, or of attendance or an attendance correction | the hours worked replace the rostered hours | `TIMESHEET`, `ATTENDANCE` |

Approving leave or an absence only removes work, so it cannot introduce a breach. A
grid import that would publish keeps the imported roster as a draft when it has
warnings (`rule_warning_count`); publish it from the roster screen.

Only breaches the change introduces are reported for edits, exchanges, leave and
overtime, so an existing breach is not blamed on a later change.

## Override audit

Each override is stored in `hr.roster_rule_override` (organisation, department,
context, record, rule codes, the warnings, reason, who and when; insert only) and as
a `rule_override` entry in the saved record's change history. Publishing also keeps
the warnings and the reason in the published revision snapshot. HR setup > Roster
rules lists the latest overrides per department (`GET
/hr/rosters/departments/{id}/rule-overrides`, for `roster.rules.manage` or the
department's `roster.manage`). Rule-set edits are audited under the organisation.

## Overtime storage

Bands are counted when read, from the current rules, holidays and roster, and returned
on `GET /hr/attendance/week`, timesheet entries and the timesheet summary
(`overtime_bands: [{rate, hours}]`). Nothing is stored, so changing a holiday or a rule
changes the counts shown. Proposed for payroll (future work, not built): snapshot the
bands at final approval into a JSON column on the timesheet entry and attendance record
(`overtime_bands`, list of rate and hours), so an approved record keeps the counts it
was approved with.

## Open questions for GAA HR

1. The seeded M and E shifts are 8.5 h (05:30–14:00 and 14:00–22:30). With the 8 h
   daily limit every M and E shift is warned. Is 30 minutes an unpaid meal break (so
   the shift catalogue needs a break field), or should the daily limit be 8.5 h?
2. Does the 2-days-off rule apply only after a run of 3 shifts, or after every run?
3. Does a shift exchange agreed by both employees need the 7 days' notice?
4. Does leave on a weekend count as that weekend being off for rule 3?
5. For a night shift that ends on Saturday morning, is that Saturday off?
6. Is a shift worker's rostered shift on a public holiday overtime (only overtime
   beyond the shift is banded today)?
7. Does "after midnight" also cover early arrival before a morning shift (for example
   04:30 before an M shift)? Today only hours past midnight of the working day count.

## Code

`apps/api/fastapi/src/hr/roster/`: `rules.py` (pure checks), `overtime.py` (pure
bands), `rule_service.py` (rule sets, loading, enforcement), `change_checks.py`
(workflow decisions), `overtime_service.py` (bands on read). Tests:
`tests/hr/test_roster_rules.py`, `test_roster_overtime.py`,
`test_roster_rule_service.py`, `test_swap_rule_check.py`, `test_roster_rules_api.py`.
