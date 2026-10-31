# Roster rules (union roster terms)

**Owner:** GAA/GMS (the rules and their values); Barrels Grenada engineering (the engine)
**Last updated:** 2026-10-31
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

The engine's interpretations of the confirmed rules. Those marked "owner, 31 Oct
2026" were settled by the owner on that date; the rest are engine readings.

- A shift belongs to the date it starts. An overnight shift that ends at 06:00 leaves
  the next day free for the consecutive-shift, days-off and weekend rules, and its
  hours count on its start date. The Saturday after a Friday night shift therefore
  counts as off (owner, 31 Oct 2026).
- Worked hours are the shift span minus its unpaid break (`shift_catalog.break_minutes`,
  default 0). The GMS M (05:30-14:00) and E (14:00-22:30) shifts include a 30-minute
  unpaid meal break, so each counts as 8 worked hours and a normal M or E shift is
  not warned (owner, 31 Oct 2026). Break minutes apply to the daily and weekly limits
  and to overtime bands. Attendance uses the break it records, or the shift's break
  when none is recorded.
- A day is off when no worked shift starts on it. Off, leave and sick codes, and
  rostered shifts covered by approved leave or a full-day approved absence, are not
  worked. Leave on a weekend counts as that weekend being off (owner, 31 Oct 2026).
- Rule 1: the 2 days off are owed only after a run of 3 shifts in a row; a shorter
  run followed by one day off is not warned (owner, 31 Oct 2026).
- Rule 3: windows of 4 consecutive weekends roll forward one weekend at a time; failing
  windows that overlap are reported as one warning. A window is judged only when all
  its weekends fall inside the dates loaded for the check.
- Rule 4 applies to edits of a published roster and to reversing an approved shift
  exchange, for dates from today up to the notice limit. An exchange both employees
  agreed to is exempt (owner, 31 Oct 2026). Past dates are corrections and are not
  warned.
- Rule 5 day kinds, in order: public holiday, Sunday, rostered day off, Saturday,
  weekday. Overtime belongs to the day its shift starts. Hours that run past midnight
  are never below the after-midnight rate; if the next day is a Sunday, holiday or day
  off its rest-day band applies to those hours. The weekday "first 4 hours" counter is
  per working day; the rest-day "first 8 hours" counter is per calendar day. Early
  arrival before a morning shift is not "after midnight" (owner, 31 Oct 2026).
- What counts as overtime: attendance before the scheduled start or after the
  scheduled end. The whole worked shift counts (less its unpaid break) on a public
  holiday, for every worker: double for the first 8 hours, triple after (owner, 31 Oct
  2026, Art. 6); when the published roster had a non-work code for that day (called in
  on a day off); and for non-shift staff on a Saturday or Sunday. A legacy timesheet
  entry's `overtime_hours` is placed right after the shift end, or from 08:00 when the
  day had no timed shift; on a public holiday the rostered shift's worked hours are
  added before it.

## Where the checks run

A break is a warning. The change is not saved until the acting supervisor gives a
reason; the API answers 409 with `code: ROSTER_RULE_WARNINGS`, the `context` and the
`violations`, and the client resends with `rule_override_reason`. Every route that can
return these warnings declares its 409 as `RosterRuleWarningsErrorPublic`, a superset of
`ApiError`: an ordinary conflict has only `detail`. The reason is at most 1,000
characters; a NUL character is refused (422) and other control characters, Unicode bidi
controls and zero-width characters are removed.

| Path | Checked | Context |
| --- | --- | --- |
| Publish a roster (`PATCH /hr/rosters/periods/{id}/publish`), grid import with publish | every breach in the month, with neighbouring published months loaded | `PUBLISH` |
| Edit a published roster (`POST /hr/rosters/assignments/bulk`), CSV import and grid import into a published period | breaches the edit introduces, and short notice for each changed cell | `ROSTER_CHANGE` |
| Final approval of a shift exchange (workflow or `POST /hr/shift-swaps/{id}/action`) | breaches the exchange introduces; an agreed exchange is exempt from notice | `SHIFT_SWAP` |
| Cancelling an approved shift exchange (reversal) | breaches from the restored shifts, and short notice | `SHIFT_SWAP` |
| Cancelling approved leave (workflow or the legacy leave action) or an approved absence | breaches from the shifts that come back | `LEAVE`, `ABSENCE` |
| Approving a timesheet with overtime (workflow or the legacy `PATCH /hr/timesheets/{id}/approve`), attendance or an attendance correction | the hours worked replace the rostered hours | `TIMESHEET`, `ATTENDANCE` |
| A submission that a template approves at once (timesheet, attendance or correction submit) | as for approval; the submitter gives the reason | as above |

Approving leave or an absence only removes work, so it cannot introduce a breach. A
grid import that would publish keeps the imported roster as a draft when it has
warnings and no reason (`rule_warning_count`); publish it from the roster screen or
resend the import with `rule_override_reason`.

Only breaches the change introduces are reported for edits, exchanges, leave and
overtime, so an existing breach is not blamed on a later change.

## Override audit

Each override is stored in `hr.roster_rule_override` (organisation, department,
context, record, rule codes, the warnings, reason, who and when; insert only) and as
a `rule_override` entry in the saved record's change history (the reason is stored as
sensitive and masked for readers without `audit.view_sensitive`). Roster period
history is readable by the department's roster managers, correction history by
whoever may read the attendance. Publishing also keeps
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

## Owner decisions (31 Oct 2026)

The owner answered the questions raised when the engine was first built:

1. GMS M and E shifts (8.5 h) include a 30-minute unpaid meal break. Built as
   `shift_catalog.break_minutes`; M and E are seeded with 30.
2. The 2 days off apply only after 3 shifts in a row (as built).
3. On a public holiday a shift worker's whole rostered shift is overtime: double for
   the first 8 hours, triple after (Art. 6).
4. An exchange both employees agreed to is exempt from the 7-day notice rule.
5. Leave on a weekend counts as that weekend off (as built).
6. The Saturday after a Friday night shift counts as off (as built).
7. Early arrival before a morning shift is not "after midnight" (as built).

## Code

`apps/api/fastapi/src/hr/roster/`: `rules.py` (pure checks), `overtime.py` (pure
bands), `rule_service.py` (rule sets, loading, enforcement), `change_checks.py`
(workflow decisions), `overtime_service.py` (bands on read). Tests:
`tests/hr/test_roster_rules.py`, `test_roster_overtime.py`,
`test_roster_rule_service.py`, `test_swap_rule_check.py`, `test_roster_rules_api.py`.
