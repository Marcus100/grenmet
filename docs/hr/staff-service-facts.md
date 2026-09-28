# Recorded service and probation facts

HR Setup and the authenticated employment API record verified facts separately:
employment commencement (`start_date`), recognised continuous-service date,
recorded expected probation end, actual verified probation completion, and the
HR source for these service facts. Unknown dates remain null; existing staff
receive no guessed dates during migration.

A recognised service date may precede current employment commencement. Expected
probation end is not evidence of completed probation. Probation dates must not
precede recorded commencement, and actual completion cannot be in the future
in Grenada. Any recorded service/probation date requires a source. Updates
validate merged facts, so changing commencement cannot silently invalidate an
existing probation record.

Staff setup preserves omitted facts; explicit null clears a recorded fact.
Existing blank employee-number, employment-type and commencement inputs retain
their prior onboarding preservation behaviour. The employment PATCH API
preserves omitted fields and permits explicit null for optional facts.
Employee profile reads display recorded facts without automatic eligibility or
pay calculations. The source note is sensitive in employee audit history.

Supervisors must be active employees in the same organisation with active
accounts. Self-supervision and reporting cycles are rejected. HR Setup retains
its narrower requirement that the supervisor belongs to the chosen department.
Existing scoped employment-management permissions and administrator-only staff
setup remain unchanged. Onboarding does not grant elevated role assignments.

Verified service breaks, bargaining-unit coverage, entitlement rules and opening
balances remain governed by [the policy register](policy-rules.md). These new
facts do not enable leave accrual, probation duration calculation, or payroll.

## Verification

Service and authenticated API tests cover setup persistence, profile/record
readback, explicit clearing, source requirements, invalid dates, self/cyclic and
inactive supervisor assignments. UI tests cover prefilled values, saved edits,
profile display and visible validation responses. Additive migration
`staff20260928` preserves existing employment rows.
