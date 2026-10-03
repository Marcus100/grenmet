# baseline domain — agent context

**Owner:** Barrels platform (production bootstrap), with GAA organisation data.

- Production bootstrap and durable staff credentials: organisation root, departments, grades (`gaa-organisation.json`, `gms-grades.json`), catalogue seeding, product access, governance routes (`governance_router.py`).
- Seeds must be idempotent and safe to re-run on production; never reset or delete existing records.
- `BaselineStep` records bootstrap progress; permission seeding lives in `src/auth/permissions.py`.
- Tests: `tests/baseline/` (approval safety, catalogue, department seed, governance, product access).
- Related: `scripts/seed_catalogues.py`, `scripts/seed_gaa_organisation.py`, `docs/operations/production-baseline.md`.
