# janitorial domain — agent context

**Owner:** GAA Janitorial department module.

- Backs `/janitor` (cleaning-spec catalogue) in gaa-admin via `/api/v1/janitorial/*`.
- Separate, self-contained database with its own Alembic history (`alembic.ini`, `migrations/`); no references to HR/CAP/weather tables. Earlier web Drizzle migrations are historical only.
- Migrations are hand-written SQL (`NNNN_<slug>.py`, revision `janitorial_NNNN`); `downgrade()` deliberately raises because the catalogue is retained data.
- Tests: `tests/janitorial/test_router.py` (auth required, payload shape against a disposable migrated database, 503 when the database is unavailable). Seeds: `scripts/seed_catalogues.py` from `seed/janitorial-spec.csv`.
- **Direction (context, not approved work):** a staff PWA plus an admin portal in gaa-admin are expected. Today the only consumer is gaa-admin `/janitor` (read-only, server-side fetch in `apps/web/gaa-admin/src/db/janitorial/queries.ts`). Keep the API the single source for both.
- Related: ADR-0003.
- **Planned v2 model:** `docs/products/janitorial-and-transport-data-model.md` (proposal, awaiting approval). Read it before extending this schema.
