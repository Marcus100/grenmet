# Employee training records

Single-feature scope: record a course name and provider, training end date, result,
optional certificate expiry and notes against an employee. HR adds records;
employees read their own history. This does not certify operational competency.

The screen is `/hr/training`, linked from the HR dashboard. Select an organisation,
find an employee within your training access and view their paginated history.
The API returns creation/archive capabilities; hiding buttons is not authorisation.

The `hr.training.manage` permission permits creation and archival within an active
organisation or department assignment. `hr.training.read.department` permits scoped
reads. SELF assignments never permit department-wide management. Default HR-admin
roles receive management, while supervisor and management roles receive reads.
The existing permission seed updates those role bundles; it does not create new
assignments or expand the organisation/department scopes already assigned.

Records retain their filing department and organisation. Historical access remains
discoverable after a transfer, while new entries require management of the employee's
current department. Out-of-scope current department details are masked in search.
An employee's own historical training records preserve access to their old organisation
context without granting access to colleagues or other organisation data.

Corrections archive the original with a reason and add a replacement. Archived rows
remain available through the archive filter. Row locking preserves the first archive
actor, reason and timestamp when requests race. No hard-delete or in-place edit route
exists.

Migration `c1d2e3f4a5b6` adds only `hr.training_record`. No workflow type is added:
this is a maintained register, not an approval request. The new public API contract
is documented in [contracts](../api/contracts.md#employee-training-history).

No course catalogue, competency assessments, role training profiles, skills matrix,
reminder sending or storage setup is included. Certificate files remain separately
managed in Employee Documents. No deployed-database migration has been performed.

Backend integration tests live in `tests/hr/test_training.py`, covering scope,
validation, history, transfers, pagination and concurrent archival. They require a
disposable PostgreSQL service with database-creation privileges. The application's
restricted database role must not be elevated for tests. Run the repository's
`pnpm verify:backend` on the host or use the documented dedicated test-service setup.
