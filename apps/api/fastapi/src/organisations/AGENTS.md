# organisations domain — agent context

**Owner:** Barrels platform (ADR-0022). Platform notion of "an organisation and who acts for it", independent of employment. Not a GAA/GMS module.

- Tables live in the `org` schema of the main database (main Alembic history, `org` is in `_TRACKED_SCHEMAS`): `org.organisation` (id, slug, name, kind `barrels|client|business`, status `active|suspended`, `verified_at`), `org.membership` (role `owner|admin|member`, status `active|invited|removed`, unique per organisation and user), `org.organisation_app` (entitlement per `src/auth/apps.py` app key).
- **Bridge A (ADR-0022):** `org.organisation.id` shares the keyspace of `hr.organisation.id` (`"gaa"`). The migration backfills one platform row per HR organisation; the HR create path and baseline seed dual-write (F2). HR reads and foreign keys do not change. `service.reconcile_hr_organisations` / `missing_platform_organisations` detect and repair drift; the reconciliation test must stay green before Phase 2 (an HR foreign key).
- New organisations get immutable `org_<hex>` ids (`service.create_organisation`); the `slug` is the editable, unique, human-readable name.
- Service functions `flush` and never `commit`; the caller owns the transaction.
- Public schemas never expose ORM models.

## Tests
`tests/organisations/` — service and `/organisations/mine` (`test_organisations.py`), migration backfill and downgrade (`test_migration.py`).

## Related
ADR-0022, ADR-0014, ADR-0018, `docs/exec-plans/barrels-foundations-plan.md`, `docs/api/contracts.md`.
