# Manual shift attendance

GAA staff record their own actual arrival, departure and break duration against a
published roster assignment. This is an attendance record, not evidence inferred
from scheduled hours. D staff record one attendance record; M/E status reports
reference that same record and cannot double-count its hours.

Each completed shift is submitted through the department's existing `TIMESHEET`
approval workflow. Self approval is disabled for attendance and corrections.
Supervisors inspect actual times and correction reasons in the approval inbox.
The weekly view collects supervisor-approved shifts Sunday through Saturday;
Saturday night work stays with its local scheduled start date when it ends Sunday.

Arrival/departure are stored as UTC, displayed in Grenada local time, and require
an explicit timezone offset at the API. Break duration is recorded separately.
Elapsed hours and elapsed time minus the recorded break are both displayed; neither
determines compensation, overtime or paid/unpaid break policy.

One record is allowed per roster assignment. Identical retries reuse it; changed
values require the latest revision. Submitted/approved punches cannot be overwritten.
An employee proposes a correction with a reason, and the supervisor reviews it
through a separate `TIMESHEET` workflow. The original record stays in effect until
approval atomically applies the proposed times and advances its revision. Rejected
proposals preserve the approved time. Audit history and correction rows retain the
original changes and their explanations.

The weekly PDF is generated in Python/FastAPI and uses the same authenticated
scope as the weekly JSON view. It is a current attendance collection, not an
immutable signed submission or payroll export. Pending, returned, rejected and
cancelled attendance is excluded from the supervisor-approved total.

Existing `timesheet.submit.self` and scoped `timesheet.submit.proxy` permissions
govern recording. Department reads require scoped `timesheet.read.department`;
record review allows the employee, a scoped reader/approver, or a named approver.
No public access or new permission grant is added. Future clock hardware must
submit into this attendance journey; no device integration is included here.

The additive migration follows the daily-status `UNCONFIRMED` migration. Apply the
main database migrations before enabling the new UI. Historical roster assignments
and material catalogue times must be protected from rewriting once attendance
exists. Host authenticated browser acceptance and institutional acceptance remain
separate from disposable-database and component tests.
