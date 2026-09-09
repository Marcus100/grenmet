# Production baseline

The existing production database is authoritative. Do not reset it or replace it with a local development database. A baseline is the minimum configuration needed to operate safely; operational records can be entered online later.

## What belongs in the baseline

| Store | Initial configuration | Records entered or ingested later |
| --- | --- | --- |
| Main API | Accounts, GAA/GMS department, six approved grade definitions, roles and permissions, eight shift types, approval templates and policies, permanent staff credentials | Verified personnel fields, opening leave balances, requests, approved rosters, CAP alerts |
| wxwatch | Existing Drizzle schema and indexes | Images from configured real feeds |
| wxproducts | Existing Drizzle schema and product configuration | Forecasts and published products |
| Transport | Existing migration plus approved catalogue seed | Bookings and operational history |
| Janitorial | Existing migration plus approved catalogue seed | Tasks, inspections and operational history |
| SURFACE | Its own migrations and reviewed reference fixtures | Observations and summaries from real feeds |
| wis2box | Reviewed station/dataset metadata and retained integration settings | Observations, publication state and notifications |

Do not manufacture observations, leave balances, employee numbers, employment dates, attendance statistics or reward activity to fill an empty page. A published roster describes a schedule, not observed attendance.

## Existing production rollout

1. Inventory the exact environment, database names, volumes, images and migration revisions. `bash scripts/production/inventory.sh` is read-only and must run on the host with Docker access.
2. Take database and uploaded-file backups before migrations. Verify that a backup restores into an isolated environment; configure off-host retention and monitoring. The earlier one-hour recovery target is not met merely by having a daily backup. A 30-minute backup cadence and 30-day retention still need to be configured and restore-tested if that target is retained.
3. Review and apply pending migrations for each store using the existing release runbook. Main API migrations and Drizzle migrations are separate. Starting FastAPI does not create the wxwatch tables.
4. Preview the approved staff baseline with `scripts/seed_production.py --profile <approved-profile.json> --environment production` from the API workspace using the production runtime configuration. Check every reported account conflict. Do not change account names, privileges or passwords just to make a seed pass.
5. Apply a reviewed seed only where the corresponding baseline has not been initialised. The main seed, transport and janitorial seeds track completion; repeat runs preserve online edits. Existing unmarked catalogue data must be reviewed rather than truncated. `scripts/production/seed-main.sh` is an operator helper; its preview describes targets and does not replace record-level review.
6. Verify login, employee profile, staff card, roster, online edits, approval separation, session revocation and the real feeds in staging before production promotion. No deployment is performed by these instructions automatically.

The SURFACE command is `python manage.py seed_production_baseline` (preview) and accepts `--apply`. It must be included in the running API image; an upstream image will not automatically contain a command added only to this checkout. It excludes publisher offsets and operational history. Review wis2box metadata through its existing management tooling; there is no generic safe seed for publication state.

## Accounts and employee setup

- Intended administrators: `ewhint@weather.gd` and `admin@weather.gd`. The generic administrator receives no employee credential.
- The 21 confirmed GMS staff have department membership, grade and permanent GAA Digital ID. Personnel fields can remain null while awaiting verification. Existing accounts keep their passwords and verification settings during seeding.
- HR Setup → Staff baseline edits staff membership, verified employee number, employment type, start date, supervisor, mailbox readiness, and audited opening leave balances. Grade edits do not silently change role assignments.
- `/profile` shows the employee record and pending fields. Personal/contact information remains editable; authoritative employment details are administrator-managed.
- Completing a staff record requires verified employee number, employment type and start date. Leave requests additionally require a recorded opening balance for that leave type. The API returns a setup conflict until these requirements are satisfied.
- A draft roster can be reviewed online. Publish only after verifying dates and duty assignments. The local September import contains 586 assignments for 21 staff; the source PDF's extra day-31 template column was excluded with the converter's explicit overflow audit flag. It has not been published or copied to production.
- Offboarding revokes the credential, deactivates the account, removes role assignments and revokes persisted sessions. Linked SURFACE/wis2box access requires its own explicit review.

## Account security

The auth application's account page links to `/security`: verified email, Google connection, authenticator enrollment and active sessions. Setup cannot reset an already-enabled authenticator. Existing email/password sign-in remains available.

Google requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and the configured auth frontend URL. Register the exact callback URL with Google. This implementation accepts matching invited accounts and requires Google to be authoritative for the email domain (Gmail or verified Workspace `hd`); arbitrary third-party email claims are not sufficient for automatic linking. See [Google's server-side verification guidance](https://developers.google.com/identity/sign-in/android/backend-auth).

Email verification requires working outbound mail and a reachable auth frontend. Do not mark an address verified merely because it appears in a roster. Before launch, verify both administrator addresses and enroll their authenticators; new staff should activate only when their mailbox is ready. Provider delivery and live Google sign-in require external credentials and end-to-end verification; tests do not establish that these services are configured.

The Digital ID remains independent of account email and personnel number. Rewards, loyalty and gamification are future extensions; no points, rewards balances or QR verification claims are seeded.


## Repeatable onboarding startup and repair

Treat schema migration, reference data and staff onboarding as separate steps.
No schema migration is required for the catalogue repair; it uses existing tables.

1. Provision the environment's empty databases and distinct runtime/migration
   credentials. Apply the committed Alembic and admin/CMS migrations using the
   existing deployment runner. Do not copy a developer database into staging or
   production.
2. For a genuinely fresh API database, run `python scripts/initial_data.py` under
   its runtime configuration as an explicit operator action. This initializes
   the configured initial administrator and permission/role catalogue. Supply a
   unique administrator password through the environment secret; do not ship a
   seed password. Review existing account conflicts before any staff import.
3. For a new GMS installation create the department with permanent ID `gms`
   using `POST /api/v1/hr/departments`; the current dashboard derives IDs from
   names, so use the API to set this explicit ID. Retain an existing
   `meteorological_department`; do not create a duplicate `gms` department.
4. In HR Setup > Staff baseline > Reference data setup, select the department,
   preview missing records, resolve conflicts, then import. The six grade
   definitions are derived from `scripts/gms-roster/profiles/gms.json`; a test
   enforces equality with the packaged runtime catalogue. Existing edits and
   deliberately disabled records are preserved. The import creates safe-default
   policies and missing two-stage templates, but grants no staff roles.
5. Complete staff membership, verified personnel fields, email/account approval,
   department-scoped approver assignments and audited opening leave balances.
   Verify an ordinary allowed and denied account; superuser tests are insufficient.
6. Run `python scripts/check_onboarding.py --require-complete` for reference-data
   acceptance. Prestart runs the same diagnostic without the strict flag so a
   fresh installation remains accessible for setup. This is separate from HTTP
   and schema readiness and does not certify available approvers or live providers.

Local development may use explicit demo fixtures only in local/test databases.
Dev CI uses isolated test databases. Staging uses reviewed reference data and
labelled acceptance records. Production uses its own secrets, reviewed personnel
and actual opening balances. Do not seed demo transactions, publications or
shared passwords during deployment. Retain backups and test restoration before
production acceptance; compatible-image rollback preserves additive data.

The old staff baseline importer preserves its completion marker and is not a
repair command. It now resolves an existing known GMS department before creating
one and refuses ambiguous duplicate identities. Use reference-data repair for
partial existing installations. No automatic staff import runs on branch pushes.

References: [Alembic data migration guidance](https://alembic.sqlalchemy.org/en/latest/cookbook.html#data-migrations-general-techniques)
and [GitHub deployment environment controls](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
