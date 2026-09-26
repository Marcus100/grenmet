# wxproducts domain — agent context

**Owner:** GMS operational service (forecasts, bulletins, aviation, observations). Barrels maintains the code.

## Data
Separate PostgreSQL database (`WXPRODUCTS_DATABASE_URL`) with its **own metadata and Alembic history** (`alembic.ini`, `migrations/`). The main-database Alembic must never see these tables (`models.py` docstring).
Migration `0001` adopts verified Drizzle history and intentionally refuses to install beside the main application's tables. Tests use disposable `weather_test_*` databases.

## Layout
`service.py` (published/authored products, history, write, aviation drafts, PDF source), `forecast.py`, `observations.py`/`observation_service.py`, `validation.py` (+ `units.py` WMO units/tables), `advisories.py` (CAP/bulletin snapshot for forecasts), `pdf.py` (status label + dispatch) and `forecast_pdf.py` + `templates/` + `assets/` + `fonts/` (WeasyPrint forecast/bulletin sheets), `fields.json` (generated mirror of `packages/gms/src/products.ts`; parity-tested), `router.py` (`/api/v1/wxproducts/*`).

## Invariants
- Self-publish actions `draft` / `publish` / `withdraw` (schemas `action` literal); saved revisions are immutable and render to PDF via `/products/{id}/revisions/{revision}/pdf`.
- Public reads return only current published products (`is_current`).
- Aviation drafts are saved and previewed only; nothing is transmitted.
- The forecaster on every product is the signed-in user, stamped by `validation.normalize`; never make it an editable field. Forecast area is fixed ("Grenada, Carriacou and Petite Martinique").
- Forecast/bulletin/outlook PDFs have one renderer (WeasyPrint) for the live draft preview and saved revisions; it needs Pango/HarfBuzz/fontconfig in the image. Style with `--gm-*` variables only; `PALETTE` mirrors `foundation.css`.
- New schema changes: add an Alembic revision with `-c src/wxproducts/alembic.ini`. Never add Drizzle migrations in gaa-admin.

## Tests
`tests/wxproducts/` (authoring, aviation, forecast, migrations, PDF, preview, public products, validation). Shared template/clone fixtures live in the root `tests/conftest.py`.

## Related
ADR-0003, `docs/operations/gms-products.md`, `docs/data-architecture.md`, gaa-admin `/wxproducts`.
