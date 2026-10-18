# organisations domain — agent context

**Owner:** Barrels platform (ADR-0022). Platform notion of "an organisation and who acts for it", independent of employment. Not a GAA/GMS module.

- Tables live in the `org` schema of the main database (main Alembic history, `org` is in `_TRACKED_SCHEMAS`): `org.organisation` (id, slug, name, kind `barrels|client|business`, status `active|suspended`, `verified_at`), `org.membership` (role `owner|admin|member`, status `active|invited|removed`, unique per organisation and user), `org.organisation_app` (entitlement per `src/auth/apps.py` app key).
- **Bridge A (ADR-0022):** `org.organisation.id` shares the keyspace of `hr.organisation.id` (`"gaa"`). HR's create path and the baseline seed write the platform row in the same transaction through `service.ensure_for_hr_organisation`. HR reads and foreign keys do not change. `service.reconcile_hr_organisations` / `missing_platform_organisations` detect and repair drift; the reconciliation test must stay green before Phase 2 (an HR foreign key).
- New organisations get immutable `org_<hex>` ids (`service.create_organisation`); the `slug` is the editable, unique, human-readable name.
- Service functions `flush` and never `commit`; the caller owns the transaction.
- **Request context:** `OrgContext` (`dependencies.py`) resolves the organisation from `X-Barrels-Organisation`. Missing header 400; unknown organisation or non-member 404 (same message, no existence leak); member with too low a role 403; suspended organisation 403. Superusers get no bypass: they act on organisations through a membership or the future control plane. A route is only "organisation-isolated" if it uses `OrgContext` **and** has a cross-organisation denial test.
- Routes use `AccountUser` (any active account, staff-approved or not), not `CurrentUser`, because organisation members need not be staff.
- Public schemas never expose ORM models.

## Tests
`tests/organisations/` — service and `/organisations/mine` (`test_organisations.py`), migration backfill and downgrade (`test_migration.py`), `OrgContext` denial and role tests (`test_context.py`). HR/baseline dual-write and reconciliation: `tests/organisations/test_hr_bridge.py`.

## Related
ADR-0022, ADR-0014, ADR-0018, `docs/exec-plans/barrels-foundations-plan.md`, `docs/api/contracts.md`.
