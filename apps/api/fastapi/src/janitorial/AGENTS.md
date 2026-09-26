# janitorial domain — agent context

**Owner:** GAA Janitorial department module.

- Backs the gaa-admin `/janitor` portal and the future janitor PWA via `/api/v1/janitorial/*`. Contract table: `docs/api/contracts.md` → Janitorial portal.
- Separate, self-contained database with its own Alembic history (`alembic.ini`, `migrations/`); no references to HR/CAP/weather tables. Earlier web Drizzle migrations are historical only.
- Migrations are hand-written SQL (`NNNN_<slug>.py`, revision `janitorial_NNNN`); `downgrade()` deliberately raises because the catalogue is retained data.
- Tests: `tests/janitorial/` — `test_router.py` (v1 `/spec`, 503), `test_migration_0002.py` (sites, auxiliary promotion, area defaults trigger, seed parity), `test_portal_api.py` (access/scope, revisions and history, people, grants, shifts). Seeds: `scripts/seed_catalogues.py` from `seed/janitorial-spec.csv` (creates auxiliary buildings directly, matching the migration).
- **Layout:** `models.py` mirrors the hand-written SQL (separate `janitorial_metadata`); feature packages `catalogue/`, `people/`, `shifts/` (router, schemas, service); `access.py` (permissions + building scope), `history.py` (`expectedRevision` checks, `change_events` in the same transaction). No hard deletes — deactivate.
- **Invariants:** building grants limit where anyone except superusers and `janitorial.scope.manage` holders may act; a permission without a grant gives no management access. Staff and grant holders are Barrels Login user ids resolved via `src/auth/service.py` (`get_user_by_email`, `get_users_by_ids`), never auth tables. Area codes (`GND-A0010`) are printed on QR labels: never change or reuse them.
- **Direction:** decisions and the merged work model are in `docs/products/janitorial-and-transport-data-model.md` → Janitorial decisions. Next (each needs approval): visits, assignments, issues, supplies (P3); inspections, SLA (P4); passenger feedback, flight schedule (P5).
- Related: ADR-0003.
- **v2 model:** `docs/products/janitorial-and-transport-data-model.md` (janitorial reference, people and shifts shipped in `janitorial_0002`; later phases still proposals). Read it and the Clean conventions in `docs/products/gaa-clean-quality-cms-proposals.md` before extending this schema.
