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
- Bulletins carry an optional `sectors` value (comma-separated keys from `src/sectors.py`, type `sectors` in `fields.json`, validated in `validation.py`); `GET /wxproducts/public/sector-outlook` joins them with CAP warnings tagged `GMS:sectors` for the site's Plan your week (`advisories.sector_outlook`). An untagged item affects everyone; `complete` is false when a source cannot be read.
- Public forecast selection (`forecast.select_forecast`): until a report issued today is published, today's period is the matching day of the newest current evening outlook (owner decision, 28 Oct 2026); it is empty only when no evening outlook is in date.
- Aviation drafts are saved and previewed only; nothing is transmitted. `aviation_rules.py` (pure; METAR/SPECI/TAF coding rules, served by `POST /wxproducts/aviation/drafts/validate`) is advisory: findings never block saving a draft. `aviation_changes.py` holds the SPECI (App. 3 2.3) and TAF change-group (App. 5 1.3) criteria; SPECI is compared only when the validate request carries `previous_message`. Rules and gaps: `docs/operations/eregister-wmo-conformance.md`.
- GMS alerts (the hazard bulletins) are green only (ADR-0051, `validation.py`): the `level` field and the notice types `Watch` and `Warning` are refused with "GMS alerts are green only; raise to a warning (CAP) or change to green". Yellow and above go through CAP: `cap/escalation.py` builds a pre-filled warning draft from one saved alert revision and the desk shows "Warning raised" (see `src/cap/AGENTS.md`). Tropical systems are tracked per system (`TropicalSystem`, `TropicalSystemEntry`, snapshot of `nhc_storm_id` on each saved entry); the 05:00 marine forecast is not built yet: `ISSUE_HOURS` covers only morning, midday and evening, and `marine` is still the older bulletin kind.
- The forecaster on every product is the signed-in user, stamped by `validation.normalize`; never make it an editable field. Forecast area is fixed ("Grenada, Carriacou and Petite Martinique").
- Forecast/bulletin/outlook PDFs have one renderer (WeasyPrint) for the live draft preview and saved revisions; it needs Pango/HarfBuzz/fontconfig in the image. Style with `--gm-*` variables only; `PALETTE` mirrors `foundation.css`.
- New schema changes: add an Alembic revision with `-c src/wxproducts/alembic.ini`. Never add Drizzle migrations in gaa-admin.

- Reviewed NHC guidance is optional typed content in immutable revisions; source facts remain in WxWatch. Compose public scalar summaries compatibly. Each outlook system owns its probabilities; never distribute legacy bulletin-wide values. Explicit identity/embedded links require forecaster confirmation; source-backed marine publication requires a local assessment.

## Tests
`tests/wxproducts/` (authoring, aviation, forecast, migrations, PDF, preview, public products, validation). Shared template/clone fixtures live in the root `tests/conftest.py`.

## Related
ADR-0003, `docs/operations/gms-products.md`, `docs/data-architecture.md`, gaa-admin `/wxproducts`.
