# HR operator acceptance

**Owner:** GAA (institutional acceptance); maintained by Barrels Grenada

**Scope:** account activation through HR setup and existing staff workflows

**Status:** local synthetic verification; deployment and human acceptance separate

Use disposable accounts and two synthetic organisations. Never use live employee
records to prove denial. Keep activation links, credentials and personal evidence
out of this public repository. The organisation foundation does not establish
complete isolation of every HR module.

## Establish the personnel context

1. A platform administrator creates an organisation and its departments with
   distinct stable IDs. Repeat a department code in the second organisation to
   prove that display names and codes are not the access boundary.
2. Create an administrator-approved work account and privately give its single-use
   activation link to the synthetic employee. Set a password through that link;
   verify replay and expiry denial. Record mailbox readiness independently of
   account activation. A mailbox exemption alone must not approve a public account.
3. Select the employer explicitly in HR setup. Save the department, employee
   number, employment type, commencement date, active grade and supervisor.
   Reject a department/grade belonging to another employer or department, and
   reject a supervisor from another employer or a reporting cycle.
4. Resolve registration approval after active employment and the approved identity
   path are ready. Confirm the readiness panel explains missing facts rather than
   inventing commencement dates, grade, service credit, leave balances or policy.
5. Give the department administrator only the approved department grants. Check
   their directory, setup, workflow templates and counts contain that department;
   direct IDs from the second employer must fail. Platform-superuser authority is
   global and must not be used as evidence of ordinary administrator isolation.

## Exercise the existing journeys

| Journey | Required demonstration |
| --- | --- |
| Leave | Verified opening ledger, applicable recorded service facts and configured approval policy; save draft, submit signed revision, return/correct/resubmit, approve, cancel and reconcile ledger/roster effects. Unset eligibility or balance remains unresolved. |
| Roster | Import/preview synthetic department staff, save draft, validate membership and assignments, publish and read own team schedule. Another employer's period, import department and assignment IDs fail. A SELF roster grant permits the employee's team schedule only. Shared shift/holiday definition writes require ALL-scoped or preserved never-scoped legacy roster.manage authority, or platform superuser; department grants only manage their roster. |
| Shift exchange | Two active employees of the request department, valid published shifts, required first-stage counterpart agreement, configured subsequent approvers; verify approval/cancellation changes and restores both assignments atomically. |
| Timesheet | Draft from the employee's department roster, reconcile recorded attendance/absence under existing rules, submit and approve through the configured workflow. Verify proxy edits require the correct scope and cross-employer list/download IDs fail. |
| Approvals | Named person and role stages, approved self-approval/distinct-person settings, return/rejection/cancellation and historical signed revisions. Inbox, instance IDs, comments/history and pending notification recipients follow the same live scope. Ordinary named/co-approvers and all acting officers must be active employees of the recorded organisation; an active named platform superuser retains its global approval override; approved manager/assistant-manager equivalence stays within department scope. A requester transfer does not reroute the recorded workflow to new department managers. |

Repeat each applicable journey as its subject, a permitted department operator,
an unpermitted colleague and a second-employer operator. Verify list counts as
well as rows, direct IDs and downloads. Do not enable a second organisation based
only on the dashboard and workflow regression tests.

## Offboard staff access

Revoke the staff credential and department assignments through the existing
offboarding path. Check old staff sessions, workflow actions, named approval inbox
and reminders stop working, while the person's separate personal account remains
available under its own policies. Preserve signed history and audit evidence;
offboarding is not account deletion or destructive record removal.

## Evidence and limits

Local tests use run-owned PostgreSQL databases (`tests/database_target.py`), real
JWTs and synthetic identities. The workflow organisation regression covers
template counts/list filters, template/step mutation, workflow detail/action IDs,
inbox and notification recipients, and dashboard staff/roster facts after a grant
moves organisation or expires, named employment termination, manager/assistant-manager equivalence, requester department transfer, and acting-officer/co-approver references. Existing HR suites cover leave/roster/exchange/
timesheet logic, organisation/document boundaries, signed revisions and history.
Record the actual command, revision and result before marking each gate accepted.

This checklist does not authorize production writes, migrations, release,
attendance/payroll expansion, Transport/Janitor work or sector-wide workflow
generalisation. Events organisers and promoters do not acquire an HR employment
requirement from this acceptance work. Shared shift/reference catalogues and all
remaining direct queries require an explicit isolation audit before commercial
multi-organisation rollout. An unavailable mailbox and missing institutional
policy are separate facts; neither is resolved by guessing defaults.
