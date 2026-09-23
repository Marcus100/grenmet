# transport domain — agent context

**Owner:** GAA Transport department module.

- Backs `/bus` (staff transportation timetable: routes, shifts, stops, trips) via `/api/v1/transport/*`.
- Separate, self-contained database with its own Alembic history (`alembic.ini`, `migrations/`); no references to HR/CAP/weather tables.
- Migrations are hand-written SQL (`NNNN_<slug>.py`, revision `transport_NNNN`); `downgrade()` deliberately raises because the catalogue is retained data.
- Tests: `tests/transport/test_router.py` (auth required, payload shape against a disposable migrated database, 503 when the database is unavailable). Seeds: `scripts/seed_catalogues.py` from `seed/transport-routes.csv`.
- **Direction (context, not approved work):** a staff PWA plus an admin portal in gaa-admin are expected. Today the only consumer is gaa-admin `/bus` (read-only, server-side fetch in `apps/web/gaa-admin/src/db/transport/queries.ts`). Keep the API the single source for both.
- Related: ADR-0003.
- **Source data status (2026-09-23):** confirmed with GAA — Route 1 Sunday/holiday morning return departs 6:15 a.m.; stop spellings Perdmontemps, Vincennes, Windsor Forest, Mt. Cuma (migration `transport_0002`); "Boca" and "The Bocas" are different stops. **Awaiting GAA HR:** Route 6 departure times (memo summary 3:30 a.m./12 noon/8:30 p.m. vs detailed list 4:30 a.m./1:00 p.m./9:30 p.m.; the app shows the detailed list), the spelling of "Toco Bay", and whether Route 4 also serves shift workers. Don't change these without confirmation.
- **Planned v2 model:** `docs/products/janitorial-and-transport-data-model.md` (proposal, awaiting approval). Read it before extending this schema.
