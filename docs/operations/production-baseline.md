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
