# baseline domain — agent context

**Owner:** Barrels platform (production bootstrap), with GAA organisation data.

- Production bootstrap and durable staff credentials: organisation root, departments, grades (`gaa-organisation.json`, `gms-grades.json`), catalogue seeding, product access, governance routes (`governance_router.py`).
- **HR onboarding:** mailbox provisioning never changes account security; staff approval accepts verified email or audited activation. See `docs/operations/staff-onboarding.md`.
- Seeds must be idempotent and safe to re-run on production; never reset or delete existing records.
- `BaselineStep` records bootstrap progress; permission seeding lives in `src/auth/permissions.py`.
- **HR setup access (issue #1080):** `/hr/setup/*` routes need `hr.setup.manage` (`HrSetupUser`). The key is global and sits in the `hr-admin` bundle, but it is used per organisation: `require_setup_organisation(session, actor, *organisation_ids)` in `service.py` admits a non-superuser only for organisations where they hold it through a live assignment (`setup_organisation_ids`). Role bundles and product-access policies stay `AdminUser` (superuser only). `LATE_BUNDLE_KEYS` in `permissions.py` gives the key to existing `hr-admin` roles once (marker `bundle:hr-admin:hr.setup.manage`). Tests: `tests/baseline/test_hr_setup_scope.py`.
- Tests: `tests/baseline/` (approval safety, catalogue, department seed, governance, product access).
- Related: `scripts/seed_catalogues.py`, `scripts/seed_gaa_organisation.py`, `docs/operations/production-baseline.md`.
